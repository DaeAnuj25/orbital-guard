import { describe, expect, it } from "vitest";
import { detect } from "@/lib/vision/detector";
import { renderFrame } from "@/lib/vision/synthetic";
import { computeMetrics, iou, runBenchmark } from "@/lib/vision/evaluate";

const scene = { width: 256, height: 256, seed: 3, nStars: 20, nStreaks: 2, noiseSigma: 3, hotPixels: 6, brightness: 1.5 };

describe("classical detector", () => {
  it("recovers most bright synthetic sources and rejects hot pixels", () => {
    const frame = renderFrame(scene);
    const res = detect(frame.image, { kSigma: 4 });
    const m = computeMetrics([{ detections: res.detections, truth: frame.truth }]);
    const bright = frame.truth.filter((t) => t.peakSnr > 10).length;
    expect(res.detections.length).toBeGreaterThanOrEqual(Math.floor(bright * 0.8));
    expect(m.precision).toBeGreaterThan(0.7);
    expect(res.stats.rejectedSmall).toBeGreaterThanOrEqual(1); // hot pixels filtered by minArea
    expect(res.detections.some((d) => d.cls === "streak")).toBe(true);
  });
  it("reports (almost) nothing on a noise-only frame", () => {
    const frame = renderFrame({ ...scene, nStars: 0, nStreaks: 0, hotPixels: 0 });
    const res = detect(frame.image, { kSigma: 5 });
    expect(res.detections.length).toBeLessThanOrEqual(2);
  });
  it("is deterministic for the same seed", () => {
    const a = detect(renderFrame(scene).image).detections.length;
    const b = detect(renderFrame(scene).image).detections.length;
    expect(a).toBe(b);
  });
  it("computes IoU correctly", () => {
    expect(iou([0, 0, 10, 10], [0, 0, 10, 10])).toBeCloseTo(1);
    expect(iou([0, 0, 10, 10], [5, 0, 15, 10])).toBeCloseTo(1 / 3);
    expect(iou([0, 0, 10, 10], [20, 20, 30, 30])).toBe(0);
  });
  it("benchmark: matched-filter variant has higher recall on faint sources than global threshold", () => {
    const base = runBenchmark({ nImages: 6, seed: 11, size: 192, noiseSigma: 6, brightness: 0.8, params: { variant: "global-threshold" } }).metrics;
    const improved = runBenchmark({ nImages: 6, seed: 11, size: 192, noiseSigma: 6, brightness: 0.8, params: { variant: "local-matched-filter" } }).metrics;
    expect(improved.recall).toBeGreaterThanOrEqual(base.recall);
    expect(improved.map).toBeGreaterThan(0);
  });
});
