import { describe, expect, it } from "vitest";
import { parseTle, parseTleText, tleChecksum, parseOmm } from "@/lib/orbital/tle";
import { propagateWindow } from "@/lib/orbital/propagate";
import { screenConjunction } from "@/lib/orbital/conjunction";
import { getBundledCatalog } from "@/lib/orbital/catalog";

const ISS1 = "1 25544U 98067A   26294.04791053  .00009575  00000+0  18188-3 0  9996";
const ISS2 = "2 25544  51.6327  37.2623 0006759 289.5321  70.4938 15.48967427591263";

describe("TLE parsing", () => {
  it("validates checksums and extracts elements", () => {
    expect(tleChecksum(ISS1)).toBe(6);
    const r = parseTle(ISS1, ISS2, "ISS (ZARYA)");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.noradId).toBe(25544);
      expect(r.record.inclinationDeg).toBeCloseTo(51.6327);
      expect(r.record.regime).toBe("LEO");
      expect(r.record.perigeeAltKm).toBeGreaterThan(380);
      expect(r.record.apogeeAltKm).toBeLessThan(450);
      expect(r.record.epoch.startsWith("2026-10-21")).toBe(true);
    }
  });
  it("rejects a corrupted checksum", () => {
    const bad = ISS1.slice(0, 68) + "1";
    const r = parseTle(bad, ISS2);
    expect(r.ok).toBe(false);
  });
  it("parses 3-line text blocks and the bundled catalogue", () => {
    expect(parseTleText(`ISS\n${ISS1}\n${ISS2}\n`).records).toHaveLength(1);
    expect(getBundledCatalog().objects.length).toBeGreaterThanOrEqual(10);
  });
  it("parses OMM JSON", () => {
    const r = parseOmm({ OBJECT_NAME: "ISS (ZARYA)", OBJECT_ID: "1998-067A", EPOCH: "2026-10-21T01:08:59.469792", MEAN_MOTION: 15.48967427, ECCENTRICITY: 0.00067597, INCLINATION: 51.6327, RA_OF_ASC_NODE: 37.2623, ARG_OF_PERICENTER: 289.5321, MEAN_ANOMALY: 70.4938, NORAD_CAT_ID: 25544, BSTAR: 0.00018187691, MEAN_MOTION_DOT: 9.575e-5 });
    expect(r.ok).toBe(true);
  });
});

describe("SGP4 propagation", () => {
  const rec = (() => { const r = parseTle(ISS1, ISS2, "ISS"); if (!r.ok) throw new Error("bad tle"); return r.record; })();
  it("gives ISS-like altitude and speed near epoch", () => {
    const { samples } = propagateWindow(rec, { start: new Date(rec.epoch), durationSeconds: 3600, stepSeconds: 60 });
    expect(samples).toHaveLength(61);
    for (const s of samples) { expect(s.altitudeKm).toBeGreaterThan(380); expect(s.altitudeKm).toBeLessThan(450); expect(s.speedKmS).toBeGreaterThan(7.5); expect(s.speedKmS).toBeLessThan(7.8); }
  });
  it("refuses windows far from the epoch", () => {
    expect(() => propagateWindow(rec, { start: new Date("2030-01-01T00:00:00Z"), durationSeconds: 600, stepSeconds: 60 })).toThrow();
  });
});

describe("conjunction screening", () => {
  it("finds a refined minimum between two debris fragments and reports RIC components", () => {
    const cat = getBundledCatalog();
    const debris = cat.objects.filter((o) => o.group === "cosmos-2251-debris");
    const start = new Date(debris[0].epoch);
    const res = screenConjunction({ a: debris[0], b: debris[1], start, durationHours: 6, stepSeconds: 60, reportThresholdKm: 50 });
    expect(res.closest.missDistanceKm).toBeGreaterThan(0);
    expect(res.closest.missDistanceKm).toBeLessThanOrEqual(Math.min(...res.series.map((s) => s.separationKm)) + 1e-6);
    expect(res.closest.relativeSpeedKmS).toBeGreaterThan(0);
    const ricNorm = Math.hypot(res.closest.ricKm.radial, res.closest.ricKm.inTrack, res.closest.ricKm.crossTrack);
    expect(ricNorm).toBeCloseTo(res.closest.missDistanceKm, 1);
    expect(res.assumptions.length).toBeGreaterThan(2);
  });
});
