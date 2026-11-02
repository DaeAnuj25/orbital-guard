/**
 * GET /api/experiments — measured results from the Python pipeline.
 * Reads ml/experiments/*.json (written by ml/scripts/train.py / evaluate.py)
 * and the status of the exported ONNX model. If nothing has been trained the
 * response says so instead of inventing numbers.
 */
import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getModelStatus } from "@/lib/vision/onnx";
import { withErrorBoundary } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withErrorBoundary("experiments", async () => {
  const dir = path.join(process.cwd(), "ml", "experiments");
  const experiments: Array<Record<string, unknown>> = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
      try {
        const rec = JSON.parse(readFileSync(path.join(dir, f), "utf-8")) as Record<string, unknown>;
        // Strip absolute paths before sending anything to the browser.
        const artifacts = Object.fromEntries(Object.entries((rec.artifacts as Record<string, string>) ?? {}).map(([k, v]) => [k, typeof v === "string" ? path.basename(v) : v]));
        const dataset = { ...((rec.dataset as Record<string, unknown>) ?? {}) };
        delete dataset.source_folder;
        experiments.push({ ...rec, artifacts, dataset });
      } catch { /* skip unreadable record */ }
    }
  }
  const model = await getModelStatus();
  return NextResponse.json({ ok: true, experiments, model, generatedAt: new Date().toISOString() });
});
