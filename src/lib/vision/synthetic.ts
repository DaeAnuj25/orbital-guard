/**
 * Synthetic telescope-frame generator (DEMONSTRATION DATA).
 *
 * Mirrors ml/scripts/generate_synthetic.py so the web demo and the Python
 * pipeline agree on what "synthetic" means: a noisy sky with a gradient, static
 * stars (Gaussian PSFs), elongated streaks from moving objects and unlabelled
 * hot pixels. Every frame carries its ground truth so the dashboard can measure
 * the classical detector honestly - but a synthetic benchmark only validates
 * the pipeline, never real-world debris detection.
 *
 * Generation is fully deterministic given a seed (mulberry32 PRNG), so sample
 * images, evaluation sets and tracking sequences are reproducible.
 */
import type { GrayImage } from "./image";

export type ObjectClass = "point_source" | "streak";

export interface TruthObject {
  id: number;
  cls: ObjectClass;
  /** Centre (image coordinates, pixels). */
  cx: number;
  cy: number;
  /** Axis-aligned box [x1, y1, x2, y2] in pixels. */
  bbox: [number, number, number, number];
  /** Peak amplitude over background divided by the noise sigma. */
  peakSnr: number;
  lengthPx: number;
}

export interface SyntheticFrame {
  image: GrayImage;
  truth: TruthObject[];
  params: { seed: number; background: number; noiseSigma: number; nStars: number; nStreaks: number; hotPixels: number };
}

export interface SceneOptions {
  width: number;
  height: number;
  seed: number;
  nStars: number;
  nStreaks: number;
  /** Noise sigma in grey levels (higher = harder). */
  noiseSigma: number;
  hotPixels: number;
  /** Multiplier applied to all object amplitudes (lower = fainter objects). */
  brightness: number;
}

/** Small, fast, seedable PRNG (mulberry32). */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const uniform = (lo: number, hi: number) => lo + (hi - lo) * next();
  const gauss = () => {
    // Box-Muller
    const u = Math.max(next(), 1e-12);
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const int = (lo: number, hi: number) => Math.floor(uniform(lo, hi + 1));
  return { next, uniform, gauss, int };
}

function addGaussian(img: GrayImage, cx: number, cy: number, amp: number, sigma: number) {
  const r = Math.ceil(4 * sigma);
  const x0 = Math.max(0, Math.floor(cx) - r), x1 = Math.min(img.width - 1, Math.floor(cx) + r);
  const y0 = Math.max(0, Math.floor(cy) - r), y1 = Math.min(img.height - 1, Math.floor(cy) + r);
  const inv = 1 / (2 * sigma * sigma);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      img.data[y * img.width + x] += amp * Math.exp(-d2 * inv);
    }
  }
}

function addStreak(img: GrayImage, ax: number, ay: number, bx: number, by: number, amp: number, sigma: number) {
  const r = Math.ceil(4 * sigma);
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx)) - r), x1 = Math.min(img.width - 1, Math.ceil(Math.max(ax, bx)) + r);
  const y0 = Math.max(0, Math.floor(Math.min(ay, by)) - r), y1 = Math.min(img.height - 1, Math.ceil(Math.max(ay, by)) + r);
  const dx = bx - ax, dy = by - ay;
  const len2 = Math.max(dx * dx + dy * dy, 1e-9);
  const inv = 1 / (2 * sigma * sigma);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const px = ax + t * dx, py = ay + t * dy;
      const d2 = (x - px) * (x - px) + (y - py) * (y - py);
      img.data[y * img.width + x] += amp * Math.exp(-d2 * inv);
    }
  }
}

export interface MovingObjectSpec {
  x0: number; y0: number; vx: number; vy: number; amp: number; sigma: number;
  /** Frames (indices) in which the object is missing (e.g. passes behind a cloud / dims). */
  dropouts: number[];
}

/**
 * Render one frame. `moving` + `frameIndex` are used by sequences: stars stay
 * fixed (sidereal tracking) while moving objects advance by their velocity.
 */
export function renderFrame(opts: SceneOptions, moving: MovingObjectSpec[] = [], frameIndex = 0): SyntheticFrame {
  const { width, height, seed } = opts;
  const rng = makeRng(seed);
  const background = rng.uniform(25, 55);
  const noiseSigma = opts.noiseSigma;
  const data = new Float32Array(width * height).fill(background);
  const image: GrayImage = { width, height, data };
  const gx = rng.uniform(-8, 8), gy = rng.uniform(-8, 8);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] += (gx * x) / width + (gy * y) / height;

  const truth: TruthObject[] = [];
  let id = 1;
  for (let i = 0; i < opts.nStars; i++) {
    const cx = rng.uniform(2, width - 3), cy = rng.uniform(2, height - 3);
    const sigma = rng.uniform(0.9, 1.7);
    const amp = Math.exp(rng.uniform(Math.log(2.5 * noiseSigma), Math.log(50 * noiseSigma))) * opts.brightness;
    addGaussian(image, cx, cy, amp, sigma);
    const h = 3 * sigma;
    truth.push({ id: id++, cls: "point_source", cx, cy, bbox: [cx - h, cy - h, cx + h, cy + h], peakSnr: amp / noiseSigma, lengthPx: 0 });
  }
  for (let i = 0; i < opts.nStreaks; i++) {
    const cx = rng.uniform(width * 0.15, width * 0.85), cy = rng.uniform(height * 0.15, height * 0.85);
    const length = rng.uniform(12, Math.min(width, height) * 0.3);
    const angle = rng.uniform(0, Math.PI);
    const sigma = rng.uniform(0.9, 1.5);
    const amp = Math.exp(rng.uniform(Math.log(2.5 * noiseSigma), Math.log(15 * noiseSigma))) * opts.brightness;
    const ax = cx - (Math.cos(angle) * length) / 2, ay = cy - (Math.sin(angle) * length) / 2;
    const bx = cx + (Math.cos(angle) * length) / 2, by = cy + (Math.sin(angle) * length) / 2;
    addStreak(image, ax, ay, bx, by, amp, sigma);
    const p = 3 * sigma;
    truth.push({ id: id++, cls: "streak", cx, cy, bbox: [Math.min(ax, bx) - p, Math.min(ay, by) - p, Math.max(ax, bx) + p, Math.max(ay, by) + p], peakSnr: amp / noiseSigma, lengthPx: length });
  }
  // Moving objects (sequences): rendered as point sources that change position per frame.
  moving.forEach((m, k) => {
    if (m.dropouts.includes(frameIndex)) return;
    const cx = m.x0 + m.vx * frameIndex, cy = m.y0 + m.vy * frameIndex;
    if (cx < 1 || cy < 1 || cx > width - 2 || cy > height - 2) return;
    addGaussian(image, cx, cy, m.amp, m.sigma);
    const h = 3 * m.sigma;
    truth.push({ id: 1000 + k, cls: "point_source", cx, cy, bbox: [cx - h, cy - h, cx + h, cy + h], peakSnr: m.amp / noiseSigma, lengthPx: 0 });
  });
  // Hot pixels / cosmic rays: unlabelled single-pixel spikes the detector must reject.
  for (let i = 0; i < opts.hotPixels; i++) data[rng.int(0, height - 1) * width + rng.int(0, width - 1)] += rng.uniform(80, 200);
  // Noise: per-frame seed offset so sequences get independent noise realisations.
  const nrng = makeRng(seed * 7919 + frameIndex * 104729 + 17);
  for (let i = 0; i < data.length; i++) {
    const shot = Math.sqrt(Math.max(data[i], 1)) * 0.4 * nrng.gauss();
    data[i] = Math.max(0, Math.min(255, data[i] + shot + noiseSigma * nrng.gauss()));
  }
  return { image, truth, params: { seed, background, noiseSigma, nStars: opts.nStars, nStreaks: opts.nStreaks, hotPixels: opts.hotPixels } };
}

/** Curated single-frame samples shown in the Detection Laboratory. */
export const SAMPLE_SCENES: Array<{ id: string; title: string; description: string; opts: SceneOptions }> = [
  { id: "bright-field", title: "Bright star field + 2 streaks", description: "Easy case: high-SNR stars and two clear streaks.", opts: { width: 512, height: 512, seed: 11, nStars: 35, nStreaks: 2, noiseSigma: 3, hotPixels: 5, brightness: 1.4 } },
  { id: "faint-field", title: "Faint objects, high noise", description: "Hard case: low-SNR sources near the detection limit.", opts: { width: 512, height: 512, seed: 23, nStars: 40, nStreaks: 2, noiseSigma: 7, hotPixels: 8, brightness: 0.6 } },
  { id: "crowded", title: "Crowded field", description: "Many stars; tests false positives and blending.", opts: { width: 512, height: 512, seed: 37, nStars: 120, nStreaks: 1, noiseSigma: 4, hotPixels: 10, brightness: 1.0 } },
  { id: "streak-rich", title: "Multiple streaks", description: "Several moving-object trails of different lengths.", opts: { width: 512, height: 512, seed: 41, nStars: 25, nStreaks: 5, noiseSigma: 4, hotPixels: 6, brightness: 1.1 } },
  { id: "empty-sky", title: "Noise only (no objects)", description: "Control image: a good detector should report (almost) nothing.", opts: { width: 512, height: 512, seed: 53, nStars: 0, nStreaks: 0, noiseSigma: 5, hotPixels: 6, brightness: 1 } },
];

export function getSampleScene(id: string) {
  return SAMPLE_SCENES.find((s) => s.id === id) ?? null;
}

export interface SequenceOptions { frames: number; width: number; height: number; seed: number; nStars: number; nMoving: number; noiseSigma: number; dropoutProb: number }

export interface TruthTrack { id: number; points: Array<{ frame: number; x: number; y: number; visible: boolean }>; vx: number; vy: number }

/** Generate a sidereally-tracked sequence: fixed stars, moving objects, random dropouts. */
export function generateSequence(o: SequenceOptions): { frames: SyntheticFrame[]; truthTracks: TruthTrack[]; moving: MovingObjectSpec[] } {
  const rng = makeRng(o.seed * 31 + 7);
  const moving: MovingObjectSpec[] = [];
  for (let k = 0; k < o.nMoving; k++) {
    const speed = rng.uniform(3, 9); // px per frame
    const angle = rng.uniform(0, 2 * Math.PI);
    const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
    // Start so the object stays inside the frame for most of the sequence.
    const x0 = rng.uniform(o.width * 0.2, o.width * 0.8) - (vx * o.frames) / 2;
    const y0 = rng.uniform(o.height * 0.2, o.height * 0.8) - (vy * o.frames) / 2;
    const dropouts: number[] = [];
    for (let f = 1; f < o.frames - 1; f++) if (rng.next() < o.dropoutProb) dropouts.push(f);
    moving.push({ x0, y0, vx, vy, amp: rng.uniform(5, 14) * o.noiseSigma, sigma: rng.uniform(1.0, 1.5), dropouts });
  }
  const scene: SceneOptions = { width: o.width, height: o.height, seed: o.seed, nStars: o.nStars, nStreaks: 0, noiseSigma: o.noiseSigma, hotPixels: 4, brightness: 1 };
  const frames: SyntheticFrame[] = [];
  for (let f = 0; f < o.frames; f++) frames.push(renderFrame(scene, moving, f));
  const truthTracks: TruthTrack[] = moving.map((m, k) => ({
    id: k + 1,
    vx: m.vx,
    vy: m.vy,
    points: Array.from({ length: o.frames }, (_, f) => {
      const x = m.x0 + m.vx * f, y = m.y0 + m.vy * f;
      const inside = x >= 1 && y >= 1 && x <= o.width - 2 && y <= o.height - 2;
      return { frame: f, x, y, visible: inside && !m.dropouts.includes(f) };
    }),
  }));
  return { frames, truthTracks, moving };
}

export const SAMPLE_SEQUENCES: Array<{ id: string; title: string; description: string; opts: SequenceOptions }> = [
  { id: "two-movers", title: "Two moving objects, 8 frames", description: "Clean case with occasional dropouts.", opts: { frames: 8, width: 384, height: 384, seed: 5, nStars: 30, nMoving: 2, noiseSigma: 4, dropoutProb: 0.15 } },
  { id: "faint-mover", title: "Faint mover, 10 frames, noisy", description: "Low SNR with more missed detections to stress track continuity.", opts: { frames: 10, width: 384, height: 384, seed: 9, nStars: 40, nMoving: 1, noiseSigma: 6, dropoutProb: 0.3 } },
  { id: "three-movers", title: "Three movers, 12 frames", description: "Crossing trajectories test data association.", opts: { frames: 12, width: 384, height: 384, seed: 14, nStars: 35, nMoving: 3, noiseSigma: 4, dropoutProb: 0.2 } },
];

export function getSampleSequence(id: string) {
  return SAMPLE_SEQUENCES.find((s) => s.id === id) ?? null;
}
