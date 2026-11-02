/** GET /api/model — availability + provenance of the optional trained ONNX model. */
import { NextResponse } from "next/server";
import { getModelStatus } from "@/lib/vision/onnx";
import { DETECTOR_INFO, DEFAULT_PARAMS } from "@/lib/vision/detector";

export const dynamic = "force-dynamic";

export async function GET() {
  const onnx = await getModelStatus();
  return NextResponse.json({ ok: true, classical: { ...DETECTOR_INFO, defaults: DEFAULT_PARAMS, available: true }, onnx });
}
