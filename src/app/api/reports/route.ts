/** GET /api/reports — list saved runs (newest first), optionally filtered by ?kind= and ?origin=. */
import { NextResponse } from "next/server";
import { listRuns } from "@/lib/runs";
import { withErrorBoundary } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withErrorBoundary("reports", async (req: Request) => {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind"), origin = url.searchParams.get("origin");
  const all = await listRuns();
  const filtered = all.filter((r) => (!kind || r.kind === kind) && (!origin || r.dataOrigin === origin));
  return NextResponse.json({ ok: true, runs: filtered.map(({ output: _o, ...rest }) => rest), count: filtered.length });
});
