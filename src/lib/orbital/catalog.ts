/**
 * Orbital element catalogue access.
 *
 * Two sources, always labelled so the user knows the data freshness:
 *   * "bundled"  - real CelesTrak element sets frozen into the repo (see bundled-tles.ts).
 *   * "live"     - fetched on demand from CelesTrak's GP API, cached in memory for
 *                  2 hours (CelesTrak asks users not to poll more often than that).
 *
 * Live access can be disabled with ORBITAL_GUARD_LIVE_TLE=0 (air-gapped labs).
 * Failures fall back to the bundled snapshot with an explicit notice.
 */
import { BUNDLED_FETCHED_AT, BUNDLED_TLE_TEXT } from "./bundled-tles";
import { parseTleText, type OrbitalRecord } from "./tle";

export type CatalogSource = "bundled" | "live";

export interface CatalogObject extends OrbitalRecord { group: string }
export interface Catalog {
  source: CatalogSource;
  fetchedAt: string;
  provider: string;
  objects: CatalogObject[];
  notice?: string;
}

export const CELESTRAK_GROUPS = ["stations", "science", "cosmos-2251-debris", "fengyun-1c-debris", "iridium-33-debris"] as const;
const LIVE_GROUP_LIMIT: Record<string, number> = { stations: 12, science: 12, "cosmos-2251-debris": 12, "fengyun-1c-debris": 12, "iridium-33-debris": 12 };
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

function groupFor(name: string): string {
  if (/COSMOS 2251/.test(name)) return "cosmos-2251-debris";
  if (/FENGYUN 1C/.test(name)) return "fengyun-1c-debris";
  if (/IRIDIUM 33/.test(name)) return "iridium-33-debris";
  if (/^HST/.test(name)) return "science";
  return "stations";
}

let bundledCache: Catalog | null = null;
export function getBundledCatalog(): Catalog {
  if (bundledCache) return bundledCache;
  const { records } = parseTleText(BUNDLED_TLE_TEXT);
  bundledCache = {
    source: "bundled",
    fetchedAt: BUNDLED_FETCHED_AT,
    provider: "CelesTrak GP data (snapshot bundled with the project)",
    objects: records.map((r) => ({ ...r, group: groupFor(r.name) })),
  };
  return bundledCache;
}

let liveCache: { at: number; catalog: Catalog } | null = null;

export function liveEnabled(): boolean {
  return process.env.ORBITAL_GUARD_LIVE_TLE !== "0";
}

async function fetchGroup(group: string): Promise<OrbitalRecord[]> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "ORBITAL-GUARD student research prototype" }, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const { records } = parseTleText(text);
    return records.slice(0, LIVE_GROUP_LIMIT[group] ?? 10);
  } finally {
    clearTimeout(timer);
  }
}

export async function getLiveCatalog(): Promise<Catalog> {
  if (!liveEnabled()) return { ...getBundledCatalog(), notice: "Live CelesTrak access is disabled by configuration (ORBITAL_GUARD_LIVE_TLE=0); showing the bundled snapshot." };
  if (liveCache && Date.now() - liveCache.at < CACHE_TTL_MS) return liveCache.catalog;
  try {
    const groups = await Promise.all(CELESTRAK_GROUPS.map(async (g) => (await fetchGroup(g)).map((r) => ({ ...r, group: g }))));
    const objects = groups.flat();
    if (!objects.length) throw new Error("empty response");
    const catalog: Catalog = { source: "live", fetchedAt: new Date().toISOString(), provider: "CelesTrak GP data API (live, cached up to 2 h)", objects };
    liveCache = { at: Date.now(), catalog };
    return catalog;
  } catch {
    return { ...getBundledCatalog(), notice: "Live CelesTrak fetch failed (offline or rate-limited); showing the bundled snapshot instead." };
  }
}

export async function getCatalog(source: CatalogSource): Promise<Catalog> {
  return source === "live" ? getLiveCatalog() : getBundledCatalog();
}

export async function findObject(noradId: number, source: CatalogSource): Promise<CatalogObject | null> {
  const cat = await getCatalog(source);
  return cat.objects.find((o) => o.noradId === noradId) ?? getBundledCatalog().objects.find((o) => o.noradId === noradId) ?? null;
}
