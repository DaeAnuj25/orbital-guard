/**
 * GET /api/samples/:id            -> PNG of a synthetic single-frame sample
 * GET /api/samples/:id?frame=N    -> frame N of a synthetic tracking sequence
 * GET /api/samples/list           -> JSON list of available samples/sequences
 *
 * Images are rendered deterministically from a seed on every request (cheap,
 * reproducible, and nothing binary has to live in the repository).
 */
import { NextResponse } from "next/server";
import { encodeGrayPng } from "@/lib/vision/image";
import { getSampleScene, getSampleSequence, renderFrame, generateSequence, SAMPLE_SCENES, SAMPLE_SEQUENCES } from "@/lib/vision/synthetic";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === "list") {
    return NextResponse.json({
      ok: true,
      images: SAMPLE_SCENES.map((s) => ({ id: s.id, title: s.title, description: s.description, width: s.opts.width, height: s.opts.height, url: `/api/samples/${s.id}` })),
      sequences: SAMPLE_SEQUENCES.map((s) => ({ id: s.id, title: s.title, description: s.description, frames: s.opts.frames, width: s.opts.width, height: s.opts.height })),
      notice: "All samples are synthetic demonstration data generated from a seed. They are not real telescope images.",
    });
  }
  const url = new URL(req.url);
  const frameParam = url.searchParams.get("frame");
  const headers = { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" };
  if (frameParam !== null) {
    const seq = getSampleSequence(id);
    if (!seq) return NextResponse.json({ ok: false, error: "Unknown sequence." }, { status: 404 });
    const f = Math.max(0, Math.min(seq.opts.frames - 1, Number(frameParam) || 0));
    const { frames } = generateSequence(seq.opts);
    return new Response(new Uint8Array(encodeGrayPng(frames[f].image)), { headers });
  }
  const scene = getSampleScene(id);
  if (!scene) return NextResponse.json({ ok: false, error: "Unknown sample." }, { status: 404 });
  return new Response(new Uint8Array(encodeGrayPng(renderFrame(scene.opts).image)), { headers });
}
