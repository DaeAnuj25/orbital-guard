/**
 * GET    /api/reports/:id?format=json|csv|md   — download one run
 * DELETE /api/reports/:id                      — remove it
 */
import { NextResponse } from "next/server";
import { deleteRun, getRun, runToCsv, runToMarkdown } from "@/lib/runs";
import { jsonError, withErrorBoundary } from "@/lib/api";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withErrorBoundary("report", async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError("Invalid report id.", 400);
  const run = await getRun(id);
  if (!run) return jsonError("Report not found.", 404);
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const base = `orbital-guard-${run.kind}-${run.id.slice(0, 8)}`;
  if (format === "csv") return new Response(runToCsv(run), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  if (format === "md") return new Response(runToMarkdown(run), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${base}-report.md"` } });
  return new Response(JSON.stringify({ report: { generatedAt: new Date().toISOString(), tool: "ORBITAL GUARD research prototype" }, run }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${base}.json"` } });
});

export const DELETE = withErrorBoundary("report-delete", async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError("Invalid report id.", 400);
  const ok = await deleteRun(id);
  return NextResponse.json({ ok });
});
