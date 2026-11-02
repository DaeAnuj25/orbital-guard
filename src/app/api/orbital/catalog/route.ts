/** GET /api/orbital/catalog?source=bundled|live — element sets with parsed, validated parameters. */
import { NextResponse } from "next/server";
import { getCatalog, liveEnabled } from "@/lib/orbital/catalog";
import { withErrorBoundary } from "@/lib/api";
import { PROPAGATION_MODEL, COORDINATE_FRAME } from "@/lib/orbital/propagate";

export const dynamic = "force-dynamic";

export const GET = withErrorBoundary("catalog", async (req: Request) => {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") === "live" ? "live" : "bundled";
  const catalog = await getCatalog(source);
  return NextResponse.json({ ok: true, ...catalog, liveEnabled: liveEnabled(), model: PROPAGATION_MODEL, frame: COORDINATE_FRAME, now: new Date().toISOString() });
});
