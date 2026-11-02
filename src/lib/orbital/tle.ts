/**
 * TLE / OMM parsing and validation.
 *
 * A Two-Line Element set is a fixed-column text format (69 characters per
 * line) with a modulo-10 checksum in column 69. We validate structure and
 * checksum BEFORE handing anything to the propagator, and we derive a few
 * human-readable quantities (period, apogee/perigee altitude, orbit regime)
 * from the mean elements. These derived values use the Keplerian relation
 * a = (mu / n^2)^(1/3) on the mean motion - adequate for display, not for
 * precision work (SGP4 handles the real propagation).
 *
 * OMM (Orbit Mean-Elements Message, CCSDS 502) is the modern JSON/XML
 * replacement for TLEs; CelesTrak serves it with FORMAT=json.
 */

export const EARTH_RADIUS_KM = 6378.137;
export const MU_EARTH = 398600.4418; // km^3/s^2

export type OrbitRegime = "LEO" | "MEO" | "GEO" | "HEO" | "Other";

export interface OrbitalRecord {
  name: string;
  noradId: number;
  intlDesignator: string;
  classification: string;
  epoch: string; // ISO UTC
  epochJulian?: number;
  meanMotionRevPerDay: number;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  bstar: number;
  meanMotionDot: number;
  revAtEpoch: number;
  elementSetNo: number;
  /** Derived (Keplerian, for display) */
  periodMinutes: number;
  semiMajorAxisKm: number;
  perigeeAltKm: number;
  apogeeAltKm: number;
  regime: OrbitRegime;
  line1: string;
  line2: string;
  source: "tle" | "omm";
}

export interface ParseError { line?: number; message: string }

export function tleChecksum(line: string): number {
  let sum = 0;
  for (const ch of line.slice(0, 68)) {
    if (ch >= "0" && ch <= "9") sum += Number(ch);
    else if (ch === "-") sum += 1;
  }
  return sum % 10;
}

/** TLE epoch "YYDDD.DDDDDDDD" -> Date (UTC). */
export function tleEpochToDate(yy: number, dayOfYear: number): Date {
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const ms = Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000;
  return new Date(ms);
}

/** Parse the "assumed decimal point" exponent notation, e.g. " 18188-3" -> 0.18188e-3. */
function parseExp(field: string): number {
  const s = field.trim();
  if (!s) return 0;
  const m = s.match(/^([+-]?)(\d+)([+-]\d)$/);
  if (!m) return Number(s) || 0;
  return Number(`${m[1]}0.${m[2]}e${m[3]}`);
}

export function classifyRegime(perigeeAltKm: number, apogeeAltKm: number, periodMinutes: number): OrbitRegime {
  const e = (apogeeAltKm - perigeeAltKm) / (apogeeAltKm + perigeeAltKm + 2 * EARTH_RADIUS_KM);
  if (apogeeAltKm < 2000) return "LEO";
  if (Math.abs(periodMinutes - 1436) < 30 && e < 0.1) return "GEO";
  if (e > 0.25) return "HEO";
  if (perigeeAltKm >= 2000 && apogeeAltKm < 35586) return "MEO";
  return "Other";
}

function derive(rec: Omit<OrbitalRecord, "periodMinutes" | "semiMajorAxisKm" | "perigeeAltKm" | "apogeeAltKm" | "regime">): OrbitalRecord {
  const n = (rec.meanMotionRevPerDay * 2 * Math.PI) / 86400; // rad/s
  const a = Math.cbrt(MU_EARTH / (n * n));
  const perigeeAltKm = a * (1 - rec.eccentricity) - EARTH_RADIUS_KM;
  const apogeeAltKm = a * (1 + rec.eccentricity) - EARTH_RADIUS_KM;
  const periodMinutes = 1440 / rec.meanMotionRevPerDay;
  return { ...rec, periodMinutes: r3(periodMinutes), semiMajorAxisKm: r3(a), perigeeAltKm: r3(perigeeAltKm), apogeeAltKm: r3(apogeeAltKm), regime: classifyRegime(perigeeAltKm, apogeeAltKm, periodMinutes) };
}

const r3 = (v: number) => Number(v.toFixed(3));

/** Parse one TLE (two lines + optional name). Returns a record or a list of errors. */
export function parseTle(line1: string, line2: string, name = ""): { ok: true; record: OrbitalRecord } | { ok: false; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const l1 = line1.replace(/\s+$/, ""), l2 = line2.replace(/\s+$/, "");
  if (l1.length !== 69) errors.push({ line: 1, message: `Line 1 must be 69 characters (got ${l1.length}).` });
  if (l2.length !== 69) errors.push({ line: 2, message: `Line 2 must be 69 characters (got ${l2.length}).` });
  if (l1[0] !== "1") errors.push({ line: 1, message: "Line 1 must start with '1'." });
  if (l2[0] !== "2") errors.push({ line: 2, message: "Line 2 must start with '2'." });
  if (errors.length) return { ok: false, errors };
  if (tleChecksum(l1) !== Number(l1[68])) errors.push({ line: 1, message: `Checksum mismatch on line 1 (expected ${tleChecksum(l1)}).` });
  if (tleChecksum(l2) !== Number(l2[68])) errors.push({ line: 2, message: `Checksum mismatch on line 2 (expected ${tleChecksum(l2)}).` });
  const id1 = l1.slice(2, 7).trim(), id2 = l2.slice(2, 7).trim();
  if (id1 !== id2) errors.push({ message: `Catalog numbers differ between lines (${id1} vs ${id2}).` });
  const yy = Number(l1.slice(18, 20)), doy = Number(l1.slice(20, 32));
  const ecc = Number(`0.${l2.slice(26, 33).trim()}`);
  const inc = Number(l2.slice(8, 16)), raan = Number(l2.slice(17, 25)), argp = Number(l2.slice(34, 42)), ma = Number(l2.slice(43, 51));
  const mm = Number(l2.slice(52, 63));
  if (!(doy >= 1 && doy < 367)) errors.push({ line: 1, message: "Epoch day-of-year out of range." });
  if (!(ecc >= 0 && ecc < 1)) errors.push({ line: 2, message: "Eccentricity must be in [0, 1)." });
  if (!(inc >= 0 && inc <= 180)) errors.push({ line: 2, message: "Inclination must be in [0, 180] degrees." });
  if (!(mm > 0 && mm < 20)) errors.push({ line: 2, message: "Mean motion must be between 0 and 20 rev/day." });
  if ([raan, argp, ma].some((v) => Number.isNaN(v))) errors.push({ line: 2, message: "Angles could not be parsed." });
  if (errors.length) return { ok: false, errors };
  const epoch = tleEpochToDate(yy, doy);
  return {
    ok: true,
    record: derive({
      name: name.trim() || `NORAD ${id1}`,
      noradId: Number(id1),
      intlDesignator: l1.slice(9, 17).trim(),
      classification: l1[7],
      epoch: epoch.toISOString(),
      meanMotionRevPerDay: mm,
      eccentricity: ecc,
      inclinationDeg: inc,
      raanDeg: raan,
      argPerigeeDeg: argp,
      meanAnomalyDeg: ma,
      bstar: parseExp(l1.slice(53, 61)),
      meanMotionDot: Number(l1.slice(33, 43).trim()) || 0,
      revAtEpoch: Number(l2.slice(63, 68)) || 0,
      elementSetNo: Number(l1.slice(64, 68)) || 0,
      line1: l1,
      line2: l2,
      source: "tle",
    }),
  };
}

/** Parse a block of text containing 2-line or 3-line element sets (CRLF tolerant). */
export function parseTleText(text: string): { records: OrbitalRecord[]; errors: ParseError[] } {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim().length > 0);
  const records: OrbitalRecord[] = [];
  const errors: ParseError[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("1 ") && i + 1 < lines.length && lines[i + 1].startsWith("2 ")) {
      const name = i > 0 && !/^[12] /.test(lines[i - 1]) ? lines[i - 1] : "";
      const res = parseTle(l, lines[i + 1], name.replace(/^0 /, ""));
      if (res.ok) records.push(res.record);
      else errors.push(...res.errors.map((e) => ({ ...e, message: `${name ? name + ": " : ""}${e.message}` })));
      i += 2;
    } else {
      if (!(i + 1 < lines.length && lines[i + 1].startsWith("1 "))) errors.push({ line: i + 1, message: `Unrecognised line ${i + 1}: "${l.slice(0, 30)}"` });
      i += 1;
    }
  }
  return { records, errors };
}

export interface OmmJson {
  OBJECT_NAME: string; OBJECT_ID: string; EPOCH: string; MEAN_MOTION: number; ECCENTRICITY: number; INCLINATION: number;
  RA_OF_ASC_NODE: number; ARG_OF_PERICENTER: number; MEAN_ANOMALY: number; NORAD_CAT_ID: number; BSTAR?: number;
  MEAN_MOTION_DOT?: number; MEAN_MOTION_DDOT?: number; CLASSIFICATION_TYPE?: string; ELEMENT_SET_NO?: number; REV_AT_EPOCH?: number; EPHEMERIS_TYPE?: number;
}

/** Parse a CelesTrak-style OMM JSON object (validated field by field). */
export function parseOmm(obj: unknown): { ok: true; record: OrbitalRecord; omm: OmmJson } | { ok: false; errors: ParseError[] } {
  const errors: ParseError[] = [];
  if (!obj || typeof obj !== "object") return { ok: false, errors: [{ message: "OMM must be a JSON object." }] };
  const o = obj as Record<string, unknown>;
  const num = (k: string, required = true) => {
    const v = o[k];
    if (v === undefined || v === null) { if (required) errors.push({ message: `Missing field ${k}.` }); return 0; }
    const n = Number(v);
    if (Number.isNaN(n)) errors.push({ message: `Field ${k} is not numeric.` });
    return n;
  };
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const epochStr = str("EPOCH");
  const epochDate = new Date(epochStr.endsWith("Z") ? epochStr : epochStr + "Z");
  if (!epochStr || Number.isNaN(epochDate.getTime())) errors.push({ message: "EPOCH must be an ISO-8601 UTC timestamp." });
  const mm = num("MEAN_MOTION"), ecc = num("ECCENTRICITY"), inc = num("INCLINATION"), raan = num("RA_OF_ASC_NODE"), argp = num("ARG_OF_PERICENTER"), ma = num("MEAN_ANOMALY"), norad = num("NORAD_CAT_ID");
  if (!(ecc >= 0 && ecc < 1)) errors.push({ message: "ECCENTRICITY must be in [0,1)." });
  if (!(mm > 0 && mm < 20)) errors.push({ message: "MEAN_MOTION must be between 0 and 20 rev/day." });
  if (errors.length) return { ok: false, errors };
  const omm: OmmJson = {
    OBJECT_NAME: str("OBJECT_NAME") || `NORAD ${norad}`, OBJECT_ID: str("OBJECT_ID"), EPOCH: epochStr, MEAN_MOTION: mm, ECCENTRICITY: ecc, INCLINATION: inc,
    RA_OF_ASC_NODE: raan, ARG_OF_PERICENTER: argp, MEAN_ANOMALY: ma, NORAD_CAT_ID: norad, BSTAR: num("BSTAR", false), MEAN_MOTION_DOT: num("MEAN_MOTION_DOT", false),
    MEAN_MOTION_DDOT: num("MEAN_MOTION_DDOT", false), CLASSIFICATION_TYPE: str("CLASSIFICATION_TYPE") || "U", ELEMENT_SET_NO: num("ELEMENT_SET_NO", false), REV_AT_EPOCH: num("REV_AT_EPOCH", false), EPHEMERIS_TYPE: num("EPHEMERIS_TYPE", false),
  };
  return {
    ok: true,
    omm,
    record: derive({
      name: omm.OBJECT_NAME, noradId: norad, intlDesignator: omm.OBJECT_ID, classification: omm.CLASSIFICATION_TYPE ?? "U", epoch: epochDate.toISOString(),
      meanMotionRevPerDay: mm, eccentricity: ecc, inclinationDeg: inc, raanDeg: raan, argPerigeeDeg: argp, meanAnomalyDeg: ma, bstar: omm.BSTAR ?? 0, meanMotionDot: omm.MEAN_MOTION_DOT ?? 0,
      revAtEpoch: omm.REV_AT_EPOCH ?? 0, elementSetNo: omm.ELEMENT_SET_NO ?? 0, line1: "", line2: "", source: "omm",
    }),
  };
}

/** Age of the element set relative to a given time, in days (positive = past epoch). */
export function elementAgeDays(record: OrbitalRecord, at: Date): number {
  return (at.getTime() - new Date(record.epoch).getTime()) / 86400000;
}
