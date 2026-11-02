/**
 * Preliminary close-approach (conjunction) screening between two catalogued objects.
 *
 * Method
 *   1. Propagate both objects with SGP4 on a coarse grid (e.g. every 30-60 s).
 *   2. Compute the separation |rA - rB| at every sample (both in TEME, so the
 *      relative vector is frame-consistent).
 *   3. Take the global minimum of the sampled series and refine it with a
 *      golden-section search on the continuous separation function between the
 *      neighbouring samples (SGP4 can be evaluated at any instant).
 *   4. Report time of closest approach (TCA), miss distance, relative speed and
 *      the miss vector in the RIC (radial / in-track / cross-track) frame of
 *      object A - the frame operators use to describe encounters.
 *
 * What this is NOT
 *   * Not a collision probability. A probability needs position covariance for
 *     both objects (as in a CDM) and a validated method (e.g. Alfano, Foster,
 *     Chan). TLEs carry no covariance, so we deliberately do not print a Pc.
 *   * Not operational advice. Fresh owner/operator ephemerides, manoeuvre plans
 *     and a proper conjunction service (e.g. 18 SDS / EU SST) are required
 *     before any avoidance decision.
 *   * Sampling can miss very short encounters if the coarse step is too large
 *     relative to the relative speed (we flag this: relative speed * step is the
 *     distance travelled between samples).
 */
import { createSatrec, stateAt, toSample, validateWindow, PropagationError, PROPAGATION_MODEL, COORDINATE_FRAME, type Vec3, type StateSample } from "./propagate";
import type { OrbitalRecord, OmmJson } from "./tle";

export interface ConjunctionInput {
  a: OrbitalRecord; b: OrbitalRecord; aOmm?: OmmJson; bOmm?: OmmJson;
  start: Date; durationHours: number; stepSeconds: number;
  /** Local minima below this distance are listed as additional events (km). */
  reportThresholdKm: number;
}

export interface ConjunctionEvent {
  tca: string; missDistanceKm: number; relativeSpeedKmS: number;
  ricKm: { radial: number; inTrack: number; crossTrack: number };
  stateA: StateSample; stateB: StateSample; refined: boolean;
}

export interface ConjunctionResult {
  closest: ConjunctionEvent;
  events: ConjunctionEvent[];
  series: Array<{ t: string; minutesFromStart: number; separationKm: number; relativeSpeedKmS: number }>;
  window: { start: string; end: string; durationHours: number; coarseStepSeconds: number; samples: number };
  screening: { thresholdKm: number; flagged: boolean; maxSamplingGapKm: number };
  assumptions: string[];
  warnings: string[];
  model: string; frame: string;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: Vec3): Vec3 => { const n = norm(a) || 1; return { x: a.x / n, y: a.y / n, z: a.z / n }; };

/** Express a relative vector in the RIC frame of (r, v). */
export function toRic(r: Vec3, v: Vec3, rel: Vec3) {
  const R = unit(r), C = unit(cross(r, v)), I = cross(C, R);
  return { radial: dot(rel, R), inTrack: dot(rel, I), crossTrack: dot(rel, C) };
}

export function screenConjunction(input: ConjunctionInput): ConjunctionResult {
  const { a, b, start } = input;
  const durationSeconds = input.durationHours * 3600;
  const windowSpec = { start, durationSeconds, stepSeconds: input.stepSeconds };
  const va = validateWindow(a, windowSpec), vb = validateWindow(b, windowSpec);
  const errors = [...va.errors, ...vb.errors.filter((e) => !va.errors.includes(e))];
  if (errors.length) throw new PropagationError(errors.join(" "));
  if (a.noradId === b.noradId && a.line1 === b.line1) throw new PropagationError("Select two different objects.");
  const warnings = Array.from(new Set([...va.warnings.map((w) => `${a.name}: ${w}`), ...vb.warnings.map((w) => `${b.name}: ${w}`)]));

  const sa = createSatrec(a, input.aOmm), sb = createSatrec(b, input.bOmm);
  const sep = (t: number) => {
    const d = new Date(t);
    const A = stateAt(sa, d), B = stateAt(sb, d);
    return { d, A, B, dist: norm(sub(A.position, B.position)), relSpeed: norm(sub(A.velocity, B.velocity)) };
  };

  const n = va.samples;
  const series: ConjunctionResult["series"] = [];
  const dists: number[] = [];
  let maxRelSpeed = 0;
  for (let i = 0; i < n; i++) {
    const t = start.getTime() + i * input.stepSeconds * 1000;
    const s = sep(t);
    dists.push(s.dist);
    maxRelSpeed = Math.max(maxRelSpeed, s.relSpeed);
    series.push({ t: s.d.toISOString(), minutesFromStart: Number(((t - start.getTime()) / 60000).toFixed(2)), separationKm: Number(s.dist.toFixed(3)), relativeSpeedKmS: Number(s.relSpeed.toFixed(4)) });
  }

  // Local minima (interior samples lower than both neighbours) + endpoints.
  const minimaIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const left = i === 0 ? Infinity : dists[i - 1], right = i === n - 1 ? Infinity : dists[i + 1];
    if (dists[i] <= left && dists[i] < right) minimaIdx.push(i);
  }
  const refine = (i: number): ConjunctionEvent => {
    const t0 = start.getTime() + Math.max(0, i - 1) * input.stepSeconds * 1000;
    const t1 = start.getTime() + Math.min(n - 1, i + 1) * input.stepSeconds * 1000;
    let lo = t0, hi = t1;
    const refined = i > 0 && i < n - 1;
    if (refined) {
      // Golden-section search; separation is smooth and unimodal between neighbouring samples.
      const g = (Math.sqrt(5) - 1) / 2;
      let c = hi - g * (hi - lo), d = lo + g * (hi - lo);
      let fc = sep(c).dist, fd = sep(d).dist;
      for (let k = 0; k < 40 && hi - lo > 1; k++) { // 1 ms resolution
        if (fc < fd) { hi = d; d = c; fd = fc; c = hi - g * (hi - lo); fc = sep(c).dist; }
        else { lo = c; c = d; fc = fd; d = lo + g * (hi - lo); fd = sep(d).dist; }
      }
    }
    const tStar = refined ? (lo + hi) / 2 : start.getTime() + i * input.stepSeconds * 1000;
    const s = sep(tStar);
    const rel = sub(s.B.position, s.A.position);
    const ric = toRic(s.A.position, s.A.velocity, rel);
    return {
      tca: s.d.toISOString(), missDistanceKm: Number(s.dist.toFixed(3)), relativeSpeedKmS: Number(s.relSpeed.toFixed(4)),
      ricKm: { radial: Number(ric.radial.toFixed(3)), inTrack: Number(ric.inTrack.toFixed(3)), crossTrack: Number(ric.crossTrack.toFixed(3)) },
      stateA: toSample(s.d, start, s.A), stateB: toSample(s.d, start, s.B), refined,
    };
  };
  const events = minimaIdx.map(refine).sort((x, y) => x.missDistanceKm - y.missDistanceKm);
  const closest = events[0];
  const listed = events.filter((e) => e.missDistanceKm <= input.reportThresholdKm).slice(0, 10);
  const maxSamplingGapKm = maxRelSpeed * input.stepSeconds;
  if (maxSamplingGapKm > 2 * input.reportThresholdKm) warnings.push(`Objects move up to ${maxSamplingGapKm.toFixed(0)} km relative to each other between coarse samples; brief encounters could be under-sampled. Reduce the step for a finer screen.`);
  const end = new Date(start.getTime() + durationSeconds * 1000);
  return {
    closest, events: listed.length ? listed : [closest], series,
    window: { start: start.toISOString(), end: end.toISOString(), durationHours: input.durationHours, coarseStepSeconds: input.stepSeconds, samples: n },
    screening: { thresholdKm: input.reportThresholdKm, flagged: closest.missDistanceKm <= input.reportThresholdKm, maxSamplingGapKm: Number(maxSamplingGapKm.toFixed(1)) },
    assumptions: [
      `Propagation: ${PROPAGATION_MODEL}; both objects from mean elements (${a.source.toUpperCase()} epoch ${a.epoch}, ${b.source.toUpperCase()} epoch ${b.epoch}).`,
      `Frame: ${COORDINATE_FRAME}. Separation is the Euclidean norm of the TEME position difference; RIC components are relative to object A.`,
      "No manoeuvres, no atmospheric density updates beyond the B* term, no covariance. Typical TLE position errors are ~1 km at epoch, growing with age.",
      "Minimum found by coarse sampling plus golden-section refinement; the result is a preliminary screening estimate, not a collision probability.",
    ],
    warnings, model: PROPAGATION_MODEL, frame: COORDINATE_FRAME,
  };
}
