import { describe, expect, it } from "vitest";
import { detect } from "@/lib/vision/detector";
import { generateSequence } from "@/lib/vision/synthetic";
import { trackFrames } from "@/lib/vision/tracker";

describe("kalman tracker", () => {
  it("links a moving object across frames with dropouts and separates it from stars", () => {
    const seq = generateSequence({ frames: 10, width: 256, height: 256, seed: 7, nStars: 25, nMoving: 1, noiseSigma: 3, dropoutProb: 0.2 });
    const dets = seq.frames.map((f) => detect(f.image, { kSigma: 4 }).detections);
    const res = trackFrames(dets, { maxMisses: 3, minHits: 3 });
    const moving = res.tracks.filter((t) => t.kind === "moving");
    expect(moving.length).toBeGreaterThanOrEqual(1);
    expect(res.tracks.filter((t) => t.kind === "stationary").length).toBeGreaterThan(5);
    const truth = seq.truthTracks[0];
    const best = moving[0];
    // The longest moving track should follow the true trajectory closely.
    const errs = best.points.filter((p) => p.measured).map((p) => { const t = truth.points[p.frame]; return Math.hypot(p.x - t.x, p.y - t.y); });
    expect(Math.max(...errs)).toBeLessThan(3);
    expect(Math.abs(best.speedPxPerFrame - Math.hypot(truth.vx, truth.vy))).toBeLessThan(1);
  });
  it("coasts through a missing frame instead of splitting the track", () => {
    const mk = (x: number) => [{ id: 1, cls: "point_source" as const, confidence: 0.9, bbox: [x - 2, 48, x + 2, 52] as [number, number, number, number], centroid: [x, 50] as [number, number], area: 9, peak: 50, flux: 200, snr: 20, elongation: 1, orientationDeg: 0 }];
    const frames = [mk(10), mk(15), mk(20), [], mk(30), mk(35)];
    const res = trackFrames(frames, { maxMisses: 2, minHits: 3 });
    expect(res.tracks.length).toBe(1);
    expect(res.tracks[0].hits).toBe(5);
    expect(res.tracks[0].points.find((p) => p.frame === 3)?.measured).toBe(false);
  });
});
