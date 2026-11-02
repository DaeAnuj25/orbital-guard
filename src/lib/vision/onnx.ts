/**
 * Optional deep-learning inference path: run an exported Ultralytics YOLOv8
 * ONNX model (ml/weights/model.onnx) with onnxruntime-node.
 *
 * The model files are produced by ml/scripts/export_onnx.py. If they are
 * missing, or onnxruntime cannot be loaded on this machine, `getModelStatus()`
 * reports why and the API falls back to the classical detector - it never
 * pretends a neural network ran.
 *
 * Pre/post-processing follows the Ultralytics convention:
 *   input  : [1, 3, S, S] float32 RGB in 0..1, letterboxed (grey 114 padding)
 *   output : [1, 4 + nc, A]  rows = (cx, cy, w, h, class scores...) per anchor
 * followed by confidence filtering and class-wise greedy NMS.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Detection } from "./detector";
import type { ObjectClass } from "./synthetic";

export interface OnnxModelMeta {
  format: string;
  name: string;
  exported_at: string;
  imgsz: number;
  classes: string[];
  data_origin?: string;
  dataset?: string | null;
  metrics_val?: Record<string, unknown>;
  metrics_test?: Record<string, unknown>;
}

export interface ModelStatus {
  available: boolean;
  reason?: string;
  meta?: OnnxModelMeta;
  runtime?: string;
}

export const WEIGHTS_DIR = path.join(process.cwd(), "ml", "weights");
const MODEL_PATH = path.join(WEIGHTS_DIR, "model.onnx");
const META_PATH = path.join(WEIGHTS_DIR, "model.json");

type Ort = typeof import("onnxruntime-node");
let ortModule: Ort | null = null;
let session: import("onnxruntime-node").InferenceSession | null = null;
let sessionError: string | null = null;

async function loadOrt(): Promise<Ort | null> {
  if (ortModule) return ortModule;
  try {
    // Kept out of the webpack bundle via next.config `serverExternalPackages`.
    ortModule = (await import("onnxruntime-node")) as Ort;
    return ortModule;
  } catch {
    return null;
  }
}

export function readModelMeta(): OnnxModelMeta | null {
  try {
    if (!existsSync(META_PATH)) return null;
    return JSON.parse(readFileSync(META_PATH, "utf-8")) as OnnxModelMeta;
  } catch {
    return null;
  }
}

export async function getModelStatus(): Promise<ModelStatus> {
  if (!existsSync(MODEL_PATH)) return { available: false, reason: "No trained weights found at ml/weights/model.onnx. Train and export a model with the scripts in ml/ to enable this engine." };
  const meta = readModelMeta();
  if (!meta) return { available: false, reason: "model.onnx exists but model.json metadata is missing or invalid (re-run ml/scripts/export_onnx.py)." };
  const ort = await loadOrt();
  if (!ort) return { available: false, reason: "onnxruntime-node could not be loaded on this machine.", meta };
  if (sessionError) return { available: false, reason: sessionError, meta };
  return { available: true, meta, runtime: "onnxruntime-node" };
}

async function getSession() {
  if (session) return session;
  const ort = await loadOrt();
  if (!ort) throw new Error("onnxruntime unavailable");
  try {
    session = await ort.InferenceSession.create(MODEL_PATH, { executionProviders: ["cpu"], graphOptimizationLevel: "all" });
    return session;
  } catch {
    sessionError = "The ONNX model could not be initialised (incompatible opset or corrupted file).";
    throw new Error(sessionError);
  }
}

/** Letterbox-resize RGB bytes to SxS and return CHW float tensor data + mapping. */
function letterbox(rgb: Uint8Array, width: number, height: number, size: number) {
  const scale = Math.min(size / width, size / height);
  const newW = Math.round(width * scale), newH = Math.round(height * scale);
  const padX = Math.floor((size - newW) / 2), padY = Math.floor((size - newH) / 2);
  const chw = new Float32Array(3 * size * size).fill(114 / 255);
  const plane = size * size;
  for (let y = 0; y < newH; y++) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const si = (sy * width + sx) * 3;
      const di = (y + padY) * size + (x + padX);
      chw[di] = rgb[si] / 255;
      chw[plane + di] = rgb[si + 1] / 255;
      chw[2 * plane + di] = rgb[si + 2] / 255;
    }
  }
  return { chw, scale, padX, padY };
}

function nms(boxes: Array<{ bbox: [number, number, number, number]; score: number; cls: number }>, iouThr: number) {
  boxes.sort((a, b) => b.score - a.score);
  const keep: typeof boxes = [];
  for (const b of boxes) {
    let suppressed = false;
    for (const k of keep) {
      if (k.cls !== b.cls) continue;
      const x1 = Math.max(k.bbox[0], b.bbox[0]), y1 = Math.max(k.bbox[1], b.bbox[1]);
      const x2 = Math.min(k.bbox[2], b.bbox[2]), y2 = Math.min(k.bbox[3], b.bbox[3]);
      const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
      const union = (k.bbox[2] - k.bbox[0]) * (k.bbox[3] - k.bbox[1]) + (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]) - inter;
      if (inter / Math.max(union, 1e-9) > iouThr) { suppressed = true; break; }
    }
    if (!suppressed) keep.push(b);
  }
  return keep;
}

export interface OnnxResult { detections: Detection[]; model: OnnxModelMeta; elapsedMs: number; confThreshold: number; iouThreshold: number }

export async function detectWithOnnx(rgb: Uint8Array, width: number, height: number, opts: { conf?: number; iou?: number } = {}): Promise<OnnxResult> {
  const t0 = Date.now();
  const meta = readModelMeta();
  if (!meta) throw new Error("model metadata missing");
  const ort = await loadOrt();
  if (!ort) throw new Error("onnxruntime unavailable");
  const sess = await getSession();
  const size = meta.imgsz;
  const { chw, scale, padX, padY } = letterbox(rgb, width, height, size);
  const inputName = sess.inputNames[0];
  const feeds = { [inputName]: new ort.Tensor("float32", chw, [1, 3, size, size]) };
  const out = await sess.run(feeds);
  const tensor = out[sess.outputNames[0]];
  const dims = tensor.dims; // [1, 4+nc, A]
  const rows = dims[1], anchors = dims[2];
  const data = tensor.data as Float32Array;
  const nc = rows - 4;
  const confThr = opts.conf ?? 0.25, iouThr = opts.iou ?? 0.45;
  const candidates: Array<{ bbox: [number, number, number, number]; score: number; cls: number }> = [];
  for (let a = 0; a < anchors; a++) {
    let best = 0, bestCls = 0;
    for (let c = 0; c < nc; c++) {
      const s = data[(4 + c) * anchors + a];
      if (s > best) { best = s; bestCls = c; }
    }
    if (best < confThr) continue;
    const cx = data[a], cy = data[anchors + a], w = data[2 * anchors + a], h = data[3 * anchors + a];
    // Undo letterbox -> original pixel coordinates.
    const x1 = (cx - w / 2 - padX) / scale, y1 = (cy - h / 2 - padY) / scale;
    const x2 = (cx + w / 2 - padX) / scale, y2 = (cy + h / 2 - padY) / scale;
    candidates.push({ bbox: [Math.max(0, x1), Math.max(0, y1), Math.min(width, x2), Math.min(height, y2)], score: best, cls: bestCls });
  }
  const kept = nms(candidates, iouThr);
  const detections: Detection[] = kept.map((k, i) => {
    const [x1, y1, x2, y2] = k.bbox;
    const name = meta.classes[k.cls] ?? `class_${k.cls}`;
    return {
      id: i + 1,
      cls: (name === "point_source" ? "point_source" : "streak") as ObjectClass,
      confidence: Number(k.score.toFixed(3)),
      bbox: [r1(x1), r1(y1), r1(x2), r1(y2)],
      centroid: [r1((x1 + x2) / 2), r1((y1 + y2) / 2)],
      area: Math.round((x2 - x1) * (y2 - y1)),
      peak: 0, flux: 0, snr: 0,
      elongation: Number((Math.max(x2 - x1, y2 - y1) / Math.max(1, Math.min(x2 - x1, y2 - y1))).toFixed(2)),
      orientationDeg: 0,
    };
  });
  return { detections, model: meta, elapsedMs: Date.now() - t0, confThreshold: confThr, iouThreshold: iouThr };
}

const r1 = (v: number) => Number(v.toFixed(1));
