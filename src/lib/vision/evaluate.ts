/**
 * Detection metrics + a reproducible synthetic benchmark for the classical detector.
 *
 * Matching rule: a detection matches a ground-truth object of the same class if
 * their centroids are within `matchRadiusPx` (point sources are only a few
 * pixels wide, so pure IoU is a poor criterion for them). We ALSO report AP at
 * IoU >= 0.5 ("ap50") because that is the standard object-detection metric, so
 * readers can see both the lenient and the strict view.
 *
 * AP is the area under the precision/recall curve with the usual monotone
 * (all-points) interpolation; mAP is the mean over classes that occur in the
 * ground truth.
 */
import { detect, type DetectorParams, type Detection } from "./detector";
import { renderFrame, type ObjectClass, type SceneOptions, type TruthObject, makeRng } from "./synthetic";

export interface MatchOptions { matchRadiusPx: number; iouThreshold: number }
export const DEFAULT_MATCH: MatchOptions = { matchRadiusPx: 3, iouThreshold: 0.5 };

export function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a[2] - a[0]) * (a[3] - a[1]), areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / Math.max(areaA + areaB - inter, 1e-9);
}

interface ScoredPrediction { imageIndex: number; cls: ObjectClass; confidence: number; matched: boolean }

/** Greedy matching per image, highest confidence first. Returns per-GT flags and scored predictions. */
function matchImage(dets: Detection[], truth: TruthObject[], imageIndex: number, opt: MatchOptions, strict: boolean) {
  const used = new Set<number>();
  const preds: ScoredPrediction[] = [];
  const gtDetected = new Array<boolean>(truth.length).fill(false);
  const sorted = [...dets].sort((a, b) => b.confidence - a.confidence);
  for (const d of sorted) {
    let best = -1, bestScore = Infinity;
    for (let g = 0; g < truth.length; g++) {
      if (used.has(g) || truth[g].cls !== d.cls) continue;
      if (strict) {
        const v = iou(d.bbox, truth[g].bbox);
        if (v >= opt.iouThreshold && 1 - v < bestScore) { best = g; bestScore = 1 - v; }
      } else {
        const dist = Math.hypot(d.centroid[0] - truth[g].cx, d.centroid[1] - truth[g].cy);
        // Streaks: centroid tolerance scales with their length (centroid is well defined but longer).
        const tol = truth[g].cls === "streak" ? Math.max(opt.matchRadiusPx, truth[g].lengthPx * 0.25) : opt.matchRadiusPx;
        if (dist <= tol && dist < bestScore) { best = g; bestScore = dist; }
      }
    }
    if (best >= 0) { used.add(best); gtDetected[best] = true; }
    preds.push({ imageIndex, cls: d.cls, confidence: d.confidence, matched: best >= 0 });
  }
  return { preds, gtDetected };
}

function averagePrecision(preds: ScoredPrediction[], totalGt: number): number {
  if (totalGt === 0) return 0;
  const sorted = [...preds].sort((a, b) => b.confidence - a.confidence);
  let tp = 0, fp = 0;
  const precisions: number[] = [], recalls: number[] = [];
  for (const p of sorted) {
    if (p.matched) tp++; else fp++;
    precisions.push(tp / (tp + fp));
    recalls.push(tp / totalGt);
  }
  // Monotone interpolation: precision at recall r = max precision at recall >= r.
  for (let i = precisions.length - 2; i >= 0; i--) precisions[i] = Math.max(precisions[i], precisions[i + 1]);
  let ap = 0, prevR = 0;
  for (let i = 0; i < precisions.length; i++) { ap += (recalls[i] - prevR) * precisions[i]; prevR = recalls[i]; }
  return ap;
}

export interface ClassMetrics { cls: string; gt: number; tp: number; fp: number; fn: number; precision: number; recall: number; f1: number; ap: number; ap50: number }
export interface SnrBin { bin: string; total: number; detected: number; recall: number }
export interface MetricsSummary {
  images: number;
  totalGt: number;
  totalDetections: number;
  precision: number;
  recall: number;
  f1: number;
  map: number;
  map50: number;
  perClass: ClassMetrics[];
  recallBySnr: SnrBin[];
  matching: MatchOptions;
}

const SNR_BINS: Array<[string, number, number]> = [["faint (SNR < 5)", 0, 5], ["low (5-10)", 5, 10], ["medium (10-25)", 10, 25], ["bright (> 25)", 25, Infinity]];

export function computeMetrics(perImage: Array<{ detections: Detection[]; truth: TruthObject[] }>, opt: MatchOptions = DEFAULT_MATCH): MetricsSummary {
  const classes: ObjectClass[] = ["point_source", "streak"];
  const lenient: ScoredPrediction[] = [], strict: ScoredPrediction[] = [];
  const gtCount: Record<string, number> = { point_source: 0, streak: 0 };
  const bins = SNR_BINS.map(([bin]) => ({ bin, total: 0, detected: 0, recall: 0 }));
  perImage.forEach(({ detections, truth }, i) => {
    const m = matchImage(detections, truth, i, opt, false);
    const s = matchImage(detections, truth, i, opt, true);
    lenient.push(...m.preds); strict.push(...s.preds);
    truth.forEach((t, g) => {
      gtCount[t.cls]++;
      const b = bins[SNR_BINS.findIndex(([, lo, hi]) => t.peakSnr >= lo && t.peakSnr < hi)];
      if (b) { b.total++; if (m.gtDetected[g]) b.detected++; }
    });
  });
  bins.forEach((b) => (b.recall = b.total ? Number((b.detected / b.total).toFixed(4)) : 0));
  const perClass: ClassMetrics[] = classes.map((cls) => {
    const p = lenient.filter((x) => x.cls === cls);
    const tp = p.filter((x) => x.matched).length, fp = p.length - tp, gt = gtCount[cls], fn = gt - tp;
    const precision = p.length ? tp / p.length : 0, recall = gt ? tp / gt : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { cls, gt, tp, fp, fn, precision: r4(precision), recall: r4(recall), f1: r4(f1), ap: r4(averagePrecision(p, gt)), ap50: r4(averagePrecision(strict.filter((x) => x.cls === cls), gt)) };
  });
  const tp = perClass.reduce((s, c) => s + c.tp, 0), fp = perClass.reduce((s, c) => s + c.fp, 0), gt = perClass.reduce((s, c) => s + c.gt, 0);
  const precision = tp + fp ? tp / (tp + fp) : 0, recall = gt ? tp / gt : 0;
  const present = perClass.filter((c) => c.gt > 0);
  return {
    images: perImage.length,
    totalGt: gt,
    totalDetections: tp + fp,
    precision: r4(precision), recall: r4(recall), f1: r4(precision + recall ? (2 * precision * recall) / (precision + recall) : 0),
    map: r4(present.length ? present.reduce((s, c) => s + c.ap, 0) / present.length : 0),
    map50: r4(present.length ? present.reduce((s, c) => s + c.ap50, 0) / present.length : 0),
    perClass, recallBySnr: bins, matching: opt,
  };
}

const r4 = (v: number) => Number(v.toFixed(4));

export interface BenchmarkOptions { nImages: number; seed: number; size: number; noiseSigma: number; brightness: number; params: Partial<DetectorParams> }

/** Deterministic synthetic benchmark: same seed => same images => comparable variants. */
export function runBenchmark(o: BenchmarkOptions): { metrics: MetricsSummary; elapsedMs: number; sceneSeeds: number[] } {
  const t0 = Date.now();
  const rng = makeRng(o.seed);
  const perImage: Array<{ detections: Detection[]; truth: TruthObject[] }> = [];
  const sceneSeeds: number[] = [];
  for (let i = 0; i < o.nImages; i++) {
    const scene: SceneOptions = { width: o.size, height: o.size, seed: Math.floor(rng.next() * 1e9), nStars: rng.int(10, 45), nStreaks: rng.int(0, 3), noiseSigma: o.noiseSigma, hotPixels: rng.int(0, 10), brightness: o.brightness };
    sceneSeeds.push(scene.seed);
    const frame = renderFrame(scene);
    perImage.push({ detections: detect(frame.image, o.params).detections, truth: frame.truth });
  }
  return { metrics: computeMetrics(perImage), elapsedMs: Date.now() - t0, sceneSeeds };
}
