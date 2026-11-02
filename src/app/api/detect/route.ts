/**
 * POST /api/detect
 *
 * Accepts either
 *   * multipart/form-data with an `image` file (PNG/JPEG) and optional `params` JSON, or
 *   * application/json { sampleId, params }  -> uses a synthetic demonstration frame.
 *
 * `params.engine` selects the detector:
 *   * "classical" (default) - transparent source extractor (always available)
 *   * "onnx"               - trained YOLO model if ml/weights/model.onnx exists
 * The response always states which engine actually ran and why, so a fallback
 * is never mistaken for a neural-network prediction.
 */
import { NextResponse } from "next/server";
import { decodeImage, ImageDecodeError, grayToRgb, MAX_UPLOAD_BYTES, type GrayImage } from "@/lib/vision/image";
import { detect, DEFAULT_PARAMS, DETECTOR_INFO, type DetectorParams } from "@/lib/vision/detector";
import { getSampleScene, renderFrame, type TruthObject } from "@/lib/vision/synthetic";
import { detectWithOnnx, getModelStatus } from "@/lib/vision/onnx";
import { computeMetrics } from "@/lib/vision/evaluate";
import { saveRun } from "@/lib/runs";
import { jsonError, num, withErrorBoundary } from "@/lib/api";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLASSICAL_LIMITS = [
  "A detected point source or streak is evidence of a signal on the sensor, not proof of space debris. Stars, satellites, aircraft, meteors and sensor artefacts all produce similar signatures in a single frame.",
  "Confidence is a heuristic function of signal-to-noise ratio, not a calibrated probability.",
  "Classical thresholding struggles with faint sources, crowded fields, blended objects and strong background structure.",
];

function parseParams(raw: unknown): Partial<DetectorParams> & { engine: "classical" | "onnx"; conf: number } {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    engine: p.engine === "onnx" ? "onnx" : "classical",
    conf: num(p.conf, 0.25, 0.01, 0.99),
    variant: p.variant === "global-threshold" ? "global-threshold" : "local-matched-filter",
    kSigma: num(p.kSigma, DEFAULT_PARAMS.kSigma, 1.5, 20),
    minArea: Math.round(num(p.minArea, DEFAULT_PARAMS.minArea, 1, 50)),
    maxArea: Math.round(num(p.maxArea, DEFAULT_PARAMS.maxArea, 10, 200000)),
    cellSize: Math.round(num(p.cellSize, DEFAULT_PARAMS.cellSize, 8, 256)),
    psfSigma: num(p.psfSigma, DEFAULT_PARAMS.psfSigma, 0.5, 5),
    elongationThreshold: num(p.elongationThreshold, DEFAULT_PARAMS.elongationThreshold, 1.2, 10),
  };
}

export const POST = withErrorBoundary("detect", async (req: Request) => {
  const contentType = req.headers.get("content-type") ?? "";
  let gray: GrayImage, rgb: Uint8Array;
  let truth: TruthObject[] | null = null;
  let input: Record<string, unknown>;
  let rawParams: unknown = {};
  let dataOrigin: "synthetic-demo" | "user-upload";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return jsonError("No image file received (field name must be 'image').");
    if (file.size === 0) return jsonError("The uploaded file is empty.");
    if (file.size > MAX_UPLOAD_BYTES) return jsonError(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
    const buf = Buffer.from(await file.arrayBuffer());
    try {
      const decoded = decodeImage(buf);
      gray = decoded.gray; rgb = decoded.rgb;
      input = { fileName: file.name.slice(0, 120), bytes: file.size, format: decoded.format, width: gray.width, height: gray.height };
    } catch (err) {
      if (err instanceof ImageDecodeError) return jsonError(err.message, 415);
      throw err;
    }
    const p = form.get("params");
    if (typeof p === "string") { try { rawParams = JSON.parse(p); } catch { return jsonError("params must be valid JSON."); } }
    dataOrigin = "user-upload";
  } else {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const scene = getSampleScene(String(body.sampleId ?? ""));
    if (!scene) return jsonError("Unknown sampleId.", 404);
    const frame = renderFrame(scene.opts);
    gray = frame.image; rgb = grayToRgb(gray); truth = frame.truth;
    input = { sampleId: scene.id, title: scene.title, width: gray.width, height: gray.height, synthetic: true, sceneOptions: scene.opts };
    rawParams = body.params ?? {};
    dataOrigin = "synthetic-demo";
  }

  const params = parseParams(rawParams);
  const notes: string[] = [];
  let engine: "classical" | "onnx" = "classical";
  let payload: Record<string, unknown>;
  let modelName = DETECTOR_INFO.name, modelVersion = DETECTOR_INFO.version;
  let limitations = CLASSICAL_LIMITS;

  if (params.engine === "onnx") {
    const status = await getModelStatus();
    if (status.available) {
      try {
        const r = await detectWithOnnx(rgb, gray.width, gray.height, { conf: params.conf });
        engine = "onnx";
        modelName = `yolo-onnx:${r.model.name}`; modelVersion = r.model.exported_at;
        payload = { detections: r.detections, stats: { elapsedMs: r.elapsedMs, confThreshold: r.confThreshold, iouThreshold: r.iouThreshold }, model: r.model };
        limitations = [
          `Model trained on ${r.model.dataset ?? "an unknown dataset"} (${r.model.data_origin ?? "unknown"} data); it only knows the classes ${r.model.classes.join(", ")}. Performance on other sensors, exposures or sky conditions is not guaranteed.`,
          "A detected streak means a moving object left a trail during the exposure - satellite, debris, aircraft or meteor. Identification requires orbit association, not image analysis.",
          "Confidence scores from a detector trained on a few hundred images are not calibrated probabilities.",
        ];
      } catch (err) {
        log.warn("onnx inference failed, falling back", { error: (err as Error).message });
        notes.push("The ONNX model could not run; results below come from the classical detector instead.");
        payload = detect(gray, params) as unknown as Record<string, unknown>;
      }
    } else {
      notes.push(`Trained model not available (${status.reason}). Results below come from the classical detector instead.`);
      payload = detect(gray, params) as unknown as Record<string, unknown>;
    }
  } else {
    payload = detect(gray, params) as unknown as Record<string, unknown>;
  }

  // For synthetic samples we know the truth, so we can score this very image.
  let metrics: Record<string, unknown> | undefined;
  if (truth) {
    const m = computeMetrics([{ detections: payload.detections as never, truth }]);
    metrics = { precision: m.precision, recall: m.recall, f1: m.f1, map: m.map, map50: m.map50, matching: m.matching, note: "Scored against the synthetic ground truth of this sample." };
  }

  const runId = await saveRun({
    kind: "detection", title: `Detection — ${(input.title as string) ?? (input.fileName as string) ?? "image"}`, dataOrigin,
    modelName, modelVersion, params: { ...params, engineRequested: params.engine, engineUsed: engine }, input,
    output: { detections: payload.detections, stats: payload.stats }, metrics: metrics ?? {}, limitations,
  });

  return NextResponse.json({ ok: true, engine, engineRequested: params.engine, notes, image: { width: gray.width, height: gray.height }, truth, metrics, limitations, runId, dataOrigin, ...payload });
});
