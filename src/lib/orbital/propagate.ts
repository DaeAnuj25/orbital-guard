/**
 * Orbit propagation with SGP4 via satellite.js (a direct port of Vallado's
 * reference implementation - we do not invent any orbital maths here).
 *
 * Frames and assumptions (also surfaced to the user):
 *   * SGP4 outputs position/velocity in the TEME frame (True Equator, Mean
 *     Equinox) in km and km/s. For display we convert to geodetic
 *     latitude/longitude/altitude (WGS-72 constants inside SGP4; WGS-84-like
 *     ellipsoid in the geodetic conversion) using GMST.
 *   * TLE/OMM mean elements are only valid near their epoch. Position error
 *     grows roughly to kilometres within days in LEO because of atmospheric drag
 *     and unmodelled manoeuvres; we warn beyond +-7 days and refuse beyond 30.
 *   * No manoeuvres, no covariance: these are screening-grade positions.
 */
import { twoline2satrec, json2satrec, propagate as sgp4Propagate, gstime, eciToGeodetic, degreesLat, degreesLong, type SatRec } from "satellite.js";
import { elementAgeDays, type OrbitalRecord, type OmmJson } from "./tle";

export const PROPAGATION_MODEL = "SGP4/SDP4 (satellite.js 7.x, Vallado 2006 reference implementation)";
export const COORDINATE_FRAME = "TEME (True Equator Mean Equinox) Earth-centred inertial, km / km/s";
export const MAX_SAMPLES = 20000;
export const MAX_AGE_DAYS = 30;

export interface Vec3 { x: number; y: number; z: number }
export interface StateSample {
  t: string;
  minutesFromStart: number;
  position: Vec3;
  velocity: Vec3;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
  speedKmS: number;
  radiusKm: number;
}

const SGP4_ERRORS: Record<number, string> = {
  1: "mean eccentricity out of range (0 <= e < 1)",
  2: "mean motion is negative",
  3: "perturbed eccentricity out of range",
  4: "semi-latus rectum negative",
  5: "epoch elements are sub-orbital",
  6: "satellite has decayed",
};

export class PropagationError extends Error {
  constructor(message: string) { super(message); this.name = "PropagationError"; }
}

export function createSatrec(record: OrbitalRecord, omm?: OmmJson): SatRec {
  if (record.source === "omm" && omm) {
    // satellite.js expects the CelesTrak OMM shape; cast because its type is stricter than our parsed object.
    return json2satrec(omm as unknown as Parameters<typeof json2satrec>[0]);
  }
  return twoline2satrec(record.line1, record.line2);
}

/** Propagate one epoch; throws PropagationError with a user-safe message. */
export function stateAt(satrec: SatRec, date: Date): { position: Vec3; velocity: Vec3 } {
  const pv = sgp4Propagate(satrec, date);
  if (!pv || !pv.position || !pv.velocity) {
    throw new PropagationError(`SGP4 failed: ${SGP4_ERRORS[satrec.error] ?? `error code ${satrec.error}`}.`);
  }
  return { position: pv.position, velocity: pv.velocity };
}

export function toSample(date: Date, start: Date, pv: { position: Vec3; velocity: Vec3 }): StateSample {
  const gmst = gstime(date);
  const geo = eciToGeodetic(pv.position, gmst);
  const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z);
  const v = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
  return {
    t: date.toISOString(),
    minutesFromStart: Number(((date.getTime() - start.getTime()) / 60000).toFixed(3)),
    position: round3(pv.position),
    velocity: { x: r6(pv.velocity.x), y: r6(pv.velocity.y), z: r6(pv.velocity.z) },
    latitudeDeg: Number(degreesLat(geo.latitude).toFixed(4)),
    longitudeDeg: Number(degreesLong(geo.longitude).toFixed(4)),
    altitudeKm: Number(geo.height.toFixed(3)),
    speedKmS: Number(v.toFixed(4)),
    radiusKm: Number(r.toFixed(3)),
  };
}

export interface WindowSpec { start: Date; durationSeconds: number; stepSeconds: number }

export function validateWindow(record: OrbitalRecord, w: WindowSpec): { errors: string[]; warnings: string[]; samples: number } {
  const errors: string[] = [], warnings: string[] = [];
  if (Number.isNaN(w.start.getTime())) errors.push("Start time is not a valid ISO-8601 timestamp.");
  if (!(w.durationSeconds > 0)) errors.push("Duration must be positive.");
  if (!(w.stepSeconds > 0)) errors.push("Step must be positive.");
  const samples = errors.length ? 0 : Math.floor(w.durationSeconds / w.stepSeconds) + 1;
  if (samples > MAX_SAMPLES) errors.push(`Too many samples (${samples}); increase the step or shorten the window (max ${MAX_SAMPLES}).`);
  if (!errors.length) {
    const ageStart = elementAgeDays(record, w.start), ageEnd = elementAgeDays(record, new Date(w.start.getTime() + w.durationSeconds * 1000));
    const maxAge = Math.max(Math.abs(ageStart), Math.abs(ageEnd));
    if (maxAge > MAX_AGE_DAYS) errors.push(`Window is ${maxAge.toFixed(1)} days from the element epoch (${record.epoch}); SGP4 results would be meaningless beyond ${MAX_AGE_DAYS} days. Import fresher elements.`);
    else if (maxAge > 7) warnings.push(`Window is up to ${maxAge.toFixed(1)} days from the element epoch; expect position errors of several km or more (drag, manoeuvres).`);
    if (ageStart < -1) warnings.push("Window starts before the element epoch; backward propagation is less reliable.");
  }
  return { errors, warnings, samples };
}

export function propagateWindow(record: OrbitalRecord, w: WindowSpec, omm?: OmmJson): { samples: StateSample[]; warnings: string[] } {
  const v = validateWindow(record, w);
  if (v.errors.length) throw new PropagationError(v.errors.join(" "));
  const satrec = createSatrec(record, omm);
  const samples: StateSample[] = [];
  for (let i = 0; i < v.samples; i++) {
    const date = new Date(w.start.getTime() + i * w.stepSeconds * 1000);
    samples.push(toSample(date, w.start, stateAt(satrec, date)));
  }
  return { samples, warnings: v.warnings };
}

const r6 = (x: number) => Number(x.toFixed(6));
const round3 = (p: Vec3): Vec3 => ({ x: Number(p.x.toFixed(3)), y: Number(p.y.toFixed(3)), z: Number(p.z.toFixed(3)) });
