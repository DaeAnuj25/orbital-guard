/**
 * POST /api/orbital/propagate
 * Body: { source: "bundled"|"live", noradId?, tleText?, omm?, start?, durationMinutes?, stepSeconds?, validateOnly? }
 * Exactly one of noradId / tleText / omm selects the object. Returns the parsed
 * elements, validation messages and (unless validateOnly) propagated states.
 */
import { NextResponse } from "next/server";
import { resolveObject } from "@/lib/orbital/resolve";
import { propagateWindow, validateWindow, PropagationError, PROPAGATION_MODEL, COORDINATE_FRAME } from "@/lib/orbital/propagate";
import { saveRun } from "@/lib/runs";
import { jsonError, num, readJson, withErrorBoundary } from "@/lib/api";

export const dynamic = "force-dynamic";

const LIMITATIONS = [
  "SGP4 with mean elements: positions are typically accurate to ~1 km at epoch and degrade by kilometres per day in LEO (drag, manoeuvres).",
  "Output frame is TEME; latitude/longitude/altitude are derived via GMST and an ellipsoidal Earth for visualisation only.",
  "Image detections cannot be matched to these catalogued objects without calibrated observations (time, pointing, plate solution) and an association step.",
];


export const POST = withErrorBoundary("propagate", async (req: Request) => {
  const body = await readJson(req);
  const resolved = await resolveObject(body);
  if ("error" in resolved) return jsonError(resolved.error, 400, resolved.details);
  const { record, omm, origin } = resolved;
  const start = body.start ? new Date(String(body.start)) : new Date();
  const durationMinutes = num(body.durationMinutes, 95, 1, 7 * 1440);
  const stepSeconds = num(body.stepSeconds, 30, 1, 3600);
  const spec = { start, durationSeconds: durationMinutes * 60, stepSeconds };
  const validation = validateWindow(record, spec);
  if (body.validateOnly) return NextResponse.json({ ok: true, record, validation, model: PROPAGATION_MODEL, frame: COORDINATE_FRAME });
  if (validation.errors.length) return jsonError(validation.errors.join(" "), 422, validation);
  try {
    const { samples, warnings } = propagateWindow(record, spec, omm);
    const params = { start: start.toISOString(), durationMinutes, stepSeconds };
    const runId = await saveRun({
      kind: "propagation", title: `Propagation — ${record.name}`, dataOrigin: origin, modelName: "SGP4 (satellite.js)", modelVersion: "7.1.0", params,
      input: { record }, output: { samples: samples.filter((_, i) => i % Math.max(1, Math.ceil(samples.length / 1000)) === 0) }, metrics: { samples: samples.length, warnings }, limitations: LIMITATIONS,
    });
    return NextResponse.json({ ok: true, record, samples, warnings, params, model: PROPAGATION_MODEL, frame: COORDINATE_FRAME, limitations: LIMITATIONS, runId, dataOrigin: origin });
  } catch (err) {
    if (err instanceof PropagationError) return jsonError(err.message, 422);
    throw err;
  }
});
