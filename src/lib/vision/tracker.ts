/**
 * Multi-frame tracker: constant-velocity Kalman filter + gated nearest-neighbour association.
 *
 * This is a compact tracking-by-detection design in the spirit of SORT:
 *   * each track keeps a state [x, y, vx, vy] in IMAGE coordinates (pixels),
 *   * predict -> associate detections (greedy, closest first, inside a gate) -> update,
 *   * unmatched tracks "coast" on their prediction for up to `maxMisses` frames
 *     (so a dropped detection does not break the track), then terminate,
 *   * a track is "confirmed" once it has `minHits` real detections.
 *
 * In a sidereally-tracked image sequence stars stay put, so tracks with ~zero
 * velocity are classified `stationary` and those that move consistently are
 * `moving` - the candidates for satellites/debris. The velocities are
 * pixels-per-frame on the sensor; they are NOT orbital velocities and cannot be
 * turned into an orbit without the plate solution, timestamps and an orbit
 * determination step.
 */
import type { Detection } from "./detector";

export interface TrackerParams {
  /** Maximum distance (px) between a prediction and a detection to associate them. */
  gatePx: number;
  /** Frames a track may survive without a detection before it is terminated. */
  maxMisses: number;
  /** Detections required before a track is reported as confirmed. */
  minHits: number;
  /** Speed (px/frame) below which a confirmed track is considered a fixed star. */
  stationarySpeedPx: number;
  processNoise: number;
  measurementNoise: number;
}

export const DEFAULT_TRACKER: TrackerParams = { gatePx: 18, maxMisses: 3, minHits: 3, stationarySpeedPx: 0.6, processNoise: 0.5, measurementNoise: 1.0 };

export interface TrackPoint { frame: number; x: number; y: number; measured: boolean; detectionId?: number }
export interface Track {
  id: number;
  kind: "moving" | "stationary" | "tentative";
  confirmed: boolean;
  hits: number;
  misses: number;
  startFrame: number;
  endFrame: number;
  points: TrackPoint[];
  velocityPxPerFrame: [number, number];
  speedPxPerFrame: number;
  headingDeg: number;
}

// --- 4x4 Kalman filter with 2-D position measurements ---------------------------------
type Mat = number[][];
const eye = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
const matMul = (a: Mat, b: Mat): Mat => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
const matAdd = (a: Mat, b: Mat): Mat => a.map((row, i) => row.map((v, j) => v + b[i][j]));
const matSub = (a: Mat, b: Mat): Mat => a.map((row, i) => row.map((v, j) => v - b[i][j]));
const transpose = (a: Mat): Mat => a[0].map((_, j) => a.map((row) => row[j]));
const inv2 = (m: Mat): Mat => {
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0] || 1e-9;
  return [[m[1][1] / det, -m[0][1] / det], [-m[1][0] / det, m[0][0] / det]];
};

class KalmanTrack {
  x: Mat; // state column vector 4x1
  P: Mat;
  constructor(px: number, py: number, private p: TrackerParams) {
    this.x = [[px], [py], [0], [0]];
    this.P = eye(4).map((r, i) => r.map((v) => v * (i < 2 ? p.measurementNoise ** 2 : 25)));
  }
  predict() {
    const F: Mat = [[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]];
    const q = this.p.processNoise ** 2;
    const Q: Mat = [[q / 4, 0, q / 2, 0], [0, q / 4, 0, q / 2], [q / 2, 0, q, 0], [0, q / 2, 0, q]];
    this.x = matMul(F, this.x);
    this.P = matAdd(matMul(matMul(F, this.P), transpose(F)), Q);
  }
  update(mx: number, my: number) {
    const H: Mat = [[1, 0, 0, 0], [0, 1, 0, 0]];
    const r = this.p.measurementNoise ** 2;
    const S = matAdd(matMul(matMul(H, this.P), transpose(H)), [[r, 0], [0, r]]);
    const K = matMul(matMul(this.P, transpose(H)), inv2(S));
    const y = matSub([[mx], [my]], matMul(H, this.x));
    this.x = matAdd(this.x, matMul(K, y));
    this.P = matMul(matSub(eye(4), matMul(K, H)), this.P);
  }
  get pos(): [number, number] { return [this.x[0][0], this.x[1][0]]; }
  get vel(): [number, number] { return [this.x[2][0], this.x[3][0]]; }
}

interface Live { id: number; kf: KalmanTrack; hits: number; misses: number; startFrame: number; points: TrackPoint[]; consecutiveMisses: number }

export interface TrackingResult { tracks: Track[]; params: TrackerParams; summary: { frames: number; detectionsTotal: number; tracksTotal: number; confirmed: number; moving: number; stationary: number } }

/** Run the tracker over per-frame detection lists (frames must be in temporal order). */
export function trackFrames(framesDetections: Detection[][], overrides: Partial<TrackerParams> = {}): TrackingResult {
  const p: TrackerParams = { ...DEFAULT_TRACKER, ...overrides };
  const live: Live[] = [];
  const finished: Live[] = [];
  let nextId = 1;

  framesDetections.forEach((dets, f) => {
    live.forEach((t) => t.kf.predict());
    // Greedy association: consider all (track, detection) pairs by increasing distance.
    const pairs: Array<{ ti: number; di: number; d: number }> = [];
    live.forEach((t, ti) => {
      const [px, py] = t.kf.pos;
      dets.forEach((d, di) => {
        const dist = Math.hypot(d.centroid[0] - px, d.centroid[1] - py);
        if (dist <= p.gatePx) pairs.push({ ti, di, d: dist });
      });
    });
    pairs.sort((a, b) => a.d - b.d);
    const usedT = new Set<number>(), usedD = new Set<number>();
    for (const { ti, di } of pairs) {
      if (usedT.has(ti) || usedD.has(di)) continue;
      usedT.add(ti); usedD.add(di);
      const t = live[ti], d = dets[di];
      t.kf.update(d.centroid[0], d.centroid[1]);
      t.hits++; t.consecutiveMisses = 0;
      t.points.push({ frame: f, x: r2(t.kf.pos[0]), y: r2(t.kf.pos[1]), measured: true, detectionId: d.id });
    }
    // Coast unmatched tracks on their prediction; terminate after maxMisses.
    for (let ti = live.length - 1; ti >= 0; ti--) {
      if (usedT.has(ti)) continue;
      const t = live[ti];
      t.misses++; t.consecutiveMisses++;
      t.points.push({ frame: f, x: r2(t.kf.pos[0]), y: r2(t.kf.pos[1]), measured: false });
      if (t.consecutiveMisses > p.maxMisses) {
        t.points.splice(t.points.length - t.consecutiveMisses, t.consecutiveMisses); // drop trailing predictions
        finished.push(t); live.splice(ti, 1);
      }
    }
    // Spawn new tracks from unmatched detections.
    dets.forEach((d, di) => {
      if (usedD.has(di)) return;
      live.push({ id: nextId++, kf: new KalmanTrack(d.centroid[0], d.centroid[1], p), hits: 1, misses: 0, consecutiveMisses: 0, startFrame: f, points: [{ frame: f, x: r2(d.centroid[0]), y: r2(d.centroid[1]), measured: true, detectionId: d.id }] });
    });
  });
  live.forEach((t) => { t.points.splice(t.points.length - t.consecutiveMisses, t.consecutiveMisses); finished.push(t); });

  const tracks: Track[] = finished
    .map((t): Track => {
      const confirmed = t.hits >= p.minHits;
      // Velocity from a least-squares fit over measured points is more robust than the final KF state.
      const m = t.points.filter((pt) => pt.measured);
      let vx = 0, vy = 0;
      if (m.length >= 2) {
        const n = m.length, mf = m.reduce((s, q) => s + q.frame, 0) / n, mx = m.reduce((s, q) => s + q.x, 0) / n, my = m.reduce((s, q) => s + q.y, 0) / n;
        const sff = m.reduce((s, q) => s + (q.frame - mf) ** 2, 0) || 1;
        vx = m.reduce((s, q) => s + (q.frame - mf) * (q.x - mx), 0) / sff;
        vy = m.reduce((s, q) => s + (q.frame - mf) * (q.y - my), 0) / sff;
      }
      const speed = Math.hypot(vx, vy);
      const kind: Track["kind"] = !confirmed ? "tentative" : speed < p.stationarySpeedPx ? "stationary" : "moving";
      return { id: t.id, kind, confirmed, hits: t.hits, misses: t.misses, startFrame: t.startFrame, endFrame: t.points[t.points.length - 1]?.frame ?? t.startFrame, points: t.points, velocityPxPerFrame: [r2(vx), r2(vy)], speedPxPerFrame: r2(speed), headingDeg: r2((Math.atan2(vy, vx) * 180) / Math.PI) };
    })
    .sort((a, b) => (a.kind === "moving" ? -1 : 1) - (b.kind === "moving" ? -1 : 1) || a.id - b.id);

  return {
    tracks,
    params: p,
    summary: {
      frames: framesDetections.length,
      detectionsTotal: framesDetections.reduce((s, d) => s + d.length, 0),
      tracksTotal: tracks.length,
      confirmed: tracks.filter((t) => t.confirmed).length,
      moving: tracks.filter((t) => t.kind === "moving").length,
      stationary: tracks.filter((t) => t.kind === "stationary").length,
    },
  };
}

const r2 = (v: number) => Number(v.toFixed(2));
