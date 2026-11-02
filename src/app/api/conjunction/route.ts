/**
 * POST /api/conjunction
 * Body: { source, a: { noradId | tleText | omm }, b: { ... }, start?, durationHours?, stepSeconds?, thresholdKm? }
 * Preliminary close-approach screening (see src/lib/orbital/conjunction.ts).
 */
import { NextResponse } from "next/server";
import { screenConjunction } from "@/lib/orbital/conjunction";
import { PropagationError } from "@/lib/orbital/propagate";
import { resolveObject } from "@/lib/orbital/resolve";
import { saveRun } from "@/lib/runs";
import { jsonError, num, readJson, withErrorBoundary } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LIMITATIONS = [
  "Preliminary screening estimate from public mean elements (TLE/OMM) propagated with SGP4; not a collision probability and not operational advice.",
  "No covariance is available for TLEs, so probability-of-collision methods (Alfano, Foster, Chan) cannot be applied honestly here.",
  "Miss distances of a few kilometres are within the uncertainty of TLE-based propagation; treat any flagged event as 'needs better data', not as a predicted collision.",
];

export const POST = withErrorBoundary("conjunction", async (req: Request) => {
  const body = await readJson(req);
  const source = body.source === "live" ? "live" : "bundled";
  const a = await resolveObject({ ...(body.a as Record<string, unknown>), source });
  if ("error" in a) return jsonError(`Object A: ${a.error}`, 400, a.details);
  const b = await resolveObject({ ...(body.b as Record<string, unknown>), source });
  if ("error" in b) return jsonError(`Object B: ${b.error}`, 400, b.details);
  const start = body.start ? new Date(String(body.start)) : new Date();
  if (Number.isNaN(start.getTime())) return jsonError("start must be an ISO-8601 timestamp.");
  const durationHours = num(body.durationHours, 24, 0.25, 7 * 24);
  const stepSeconds = num(body.stepSeconds, 30, 1, 600);
  const thresholdKm = num(body.thresholdKm, 10, 0.1, 1000);
  try {
    const result = screenConjunction({ a: a.record, b: b.record, aOmm: a.omm, bOmm: b.omm, start, durationHours, stepSeconds, reportThresholdKm: thresholdKm });
    const params = { start: start.toISOString(), durationHours, stepSeconds, thresholdKm, source };
    const origin = a.origin === "user-import" || b.origin === "user-import" ? "user-import" : a.origin;
    const runId = await saveRun({
      kind: "conjunction", title: `Close approach — ${a.record.name} vs ${b.record.name}`, dataOrigin: origin, modelName: "SGP4 screening (satellite.js)", modelVersion: "7.1.0", params,
      input: { a: a.record, b: b.record },
      output: { closest: result.closest, events: result.events, series: result.series.filter((_, i) => i % Math.max(1, Math.ceil(result.series.length / 1500)) === 0), screening: result.screening, window: result.window },
      metrics: { missDistanceKm: result.closest.missDistanceKm, tca: result.closest.tca, relativeSpeedKmS: result.closest.relativeSpeedKmS, flagged: result.screening.flagged },
      limitations: [...LIMITATIONS, ...result.assumptions],
    });
    return NextResponse.json({ ok: true, a: a.record, b: b.record, ...result, params, limitations: LIMITATIONS, runId, dataOrigin: origin });
  } catch (err) {
    if (err instanceof PropagationError) return jsonError(err.message, 422);
    throw err;
  }
});
