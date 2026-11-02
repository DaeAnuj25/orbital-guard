/**
 * Resolve an orbital object from an API request body: catalogue NORAD id,
 * pasted TLE text, or an OMM JSON object. Shared by the propagate and
 * conjunction routes so both validate input identically.
 */
import { findObject } from "./catalog";
import { parseTleText, parseOmm, type OrbitalRecord, type OmmJson } from "./tle";
import type { DataOrigin } from "@/db/schema";

const num = (v: unknown) => (typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN);

export async function resolveObject(body: Record<string, unknown>): Promise<{ record: OrbitalRecord; omm?: OmmJson; origin: DataOrigin } | { error: string; details?: unknown }> {
  const source = body.source === "live" ? "live" : "bundled";
  if (typeof body.tleText === "string" && body.tleText.trim()) {
    if (body.tleText.length > 20000) return { error: "TLE text too long (max 20 kB)." };
    const { records, errors } = parseTleText(body.tleText);
    if (!records.length) return { error: "No valid TLE found in the pasted text.", details: errors };
    return { record: records[0], origin: "user-import" };
  }
  if (body.omm && typeof body.omm === "object") {
    const r = parseOmm(Array.isArray(body.omm) ? body.omm[0] : body.omm);
    if (!r.ok) return { error: "Invalid OMM object.", details: r.errors };
    return { record: r.record, omm: r.omm, origin: "user-import" };
  }
  const noradId = Math.round(num(body.noradId));
  if (!Number.isFinite(noradId)) return { error: "Provide a noradId, tleText or omm." };
  const obj = await findObject(noradId, source);
  if (!obj) return { error: `NORAD ${noradId} is not in the ${source} catalogue.` };
  return { record: obj, origin: source === "live" ? "live-catalog" : "bundled-catalog" };
}
