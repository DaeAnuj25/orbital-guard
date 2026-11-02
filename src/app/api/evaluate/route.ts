/**
 * POST /api/evaluate — reproducible synthetic benchmark of the classical detector.
 *
 * Runs BOTH variants (global-threshold baseline vs local-background + matched
 * filter) on the same seeded image set so the comparison is fair, and returns
 * precision / recall / F1 / AP plus recall by SNR bin (failure analysis).
 * These are MEASURED numbers, but measured on SYNTHETIC data: they validate the
 * pipeline, not real-world debris detection. The run record says so.
 */
import { NextResponse } from "next/server";
import { runBenchmark } from "@/lib/vision/evaluate";
import { DETECTOR_INFO, type DetectorVariant } from "@/lib/vision/detector";
import { saveRun } from "@/lib/runs";
import { num, readJson, withErrorBoundary } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withErrorBoundary("evaluate", async (req: Request) => {
  const body = await readJson(req);
  const nImages = Math.round(num(body.nImages, 20, 2, 60));
  const seed = Math.round(num(body.seed, 2026, 0, 2 ** 31));
  const size = Math.round(num(body.size, 256, 128, 512));
  const noiseSigma = num(body.noiseSigma, 5, 1, 15);
  const brightness = num(body.brightness, 1, 0.2, 3);
  const kSigma = num(body.kSigma, 4, 1.5, 20);
  const variants: DetectorVariant[] = ["global-threshold", "local-matched-filter"];
  const results = variants.map((variant) => {
    const r = runBenchmark({ nImages, seed, size, noiseSigma, brightness, params: { variant, kSigma } });
    return { variant, metrics: r.metrics, elapsedMs: r.elapsedMs };
  });
  const params = { nImages, seed, size, noiseSigma, brightness, kSigma, variants };
  const limitations = [
    "Measured on synthetic frames with a simplified PSF/noise model; validates the detector pipeline only, not real-world performance.",
    "Lenient matching (centroid within 3 px) is reported alongside strict IoU>=0.5 AP; point sources are tiny so IoU is a harsh criterion for them.",
    "Both variants share the same seeded images, so the comparison between them is fair; absolute numbers depend on the chosen noise and brightness.",
  ];
  const runId = await saveRun({
    kind: "evaluation", title: `Synthetic benchmark (${nImages} images, seed ${seed})`, dataOrigin: "synthetic-demo",
    modelName: DETECTOR_INFO.name, modelVersion: DETECTOR_INFO.version, params, input: { generator: "src/lib/vision/synthetic.ts", nImages, seed, size },
    output: { variants: results }, metrics: Object.fromEntries(results.map((r) => [r.variant, { precision: r.metrics.precision, recall: r.metrics.recall, f1: r.metrics.f1, map: r.metrics.map, map50: r.metrics.map50 }])), limitations,
  });
  return NextResponse.json({ ok: true, params, results, limitations, runId, dataOrigin: "synthetic-demo" });
});
