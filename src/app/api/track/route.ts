/**
 * POST /api/track — multi-frame tracking in image coordinates.
 *
 * Input: multipart/form-data with several `frames` files in temporal order, or
 * JSON { sequenceId, params } for a synthetic demonstration sequence.
 * Pipeline: classical detection per frame -> Kalman/nearest-neighbour tracker.
 * For synthetic sequences the known trajectories are returned too, and a simple
 * recovery score (fraction of visible truth positions covered by a confirmed
 * moving track within 4 px) is computed.
 */
import { NextResponse } from "next/server";
import { decodeImage, ImageDecodeError, MAX_UPLOAD_BYTES, type GrayImage } from "@/lib/vision/image";
import { detect, DETECTOR_INFO, type Detection, type DetectorParams } from "@/lib/vision/detector";
import { trackFrames, DEFAULT_TRACKER, type TrackerParams } from "@/lib/vision/tracker";
import { generateSequence, getSampleSequence, type TruthTrack } from "@/lib/vision/synthetic";
import { saveRun } from "@/lib/runs";
import { jsonError, num, withErrorBoundary } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const MAX_FRAMES = 30;

const LIMITATIONS = [
  "Tracks are in IMAGE coordinates (pixels per frame). They are not orbits: converting them needs the plate solution (pixel -> sky direction), accurate exposure timestamps, the observer location and an orbit-determination step.",
  "In sidereal tracking mode stationary tracks are stars; moving tracks are candidate resident space objects (or aircraft/meteors). A motion signature is not an identification.",
  "Greedy nearest-neighbour association can swap identities when trajectories cross; missed detections longer than maxMisses frames split a track.",
];

function parseTrackerParams(raw: unknown): Partial<TrackerParams> & { kSigma: number } {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    gatePx: num(p.gatePx, DEFAULT_TRACKER.gatePx, 2, 200),
    maxMisses: Math.round(num(p.maxMisses, DEFAULT_TRACKER.maxMisses, 0, 20)),
    minHits: Math.round(num(p.minHits, DEFAULT_TRACKER.minHits, 1, 20)),
    stationarySpeedPx: num(p.stationarySpeedPx, DEFAULT_TRACKER.stationarySpeedPx, 0, 20),
    kSigma: num(p.kSigma, 4, 1.5, 20),
  };
}

function recoveryScore(tracks: ReturnType<typeof trackFrames>["tracks"], truth: TruthTrack[]) {
  const moving = tracks.filter((t) => t.confirmed && t.kind === "moving");
  let visible = 0, covered = 0;
  const idsPerTruth: number[] = [];
  for (const tt of truth) {
    const ids = new Set<number>();
    for (const p of tt.points) {
      if (!p.visible) continue;
      visible++;
      const hit = moving.find((t) => t.points.some((q) => q.frame === p.frame && Math.hypot(q.x - p.x, q.y - p.y) <= 4));
      if (hit) { covered++; ids.add(hit.id); }
    }
    idsPerTruth.push(ids.size);
  }
  return { visibleTruthPoints: visible, coveredByMovingTracks: covered, coverage: visible ? Number((covered / visible).toFixed(3)) : 0, fragmentsPerTruthTrack: idsPerTruth, movingTracksFound: moving.length, truthMovingObjects: truth.length };
}

export const POST = withErrorBoundary("track", async (req: Request) => {
  const contentType = req.headers.get("content-type") ?? "";
  let frames: GrayImage[] = [];
  let truthTracks: TruthTrack[] | null = null;
  let input: Record<string, unknown>;
  let rawParams: unknown = {};
  let dataOrigin: "synthetic-demo" | "user-upload";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const files = form.getAll("frames").filter((f): f is File => f instanceof File);
    if (files.length < 2) return jsonError("Upload at least two frames (field name 'frames'), in temporal order.");
    if (files.length > MAX_FRAMES) return jsonError(`At most ${MAX_FRAMES} frames are supported.`);
    const names: string[] = [];
    for (const f of files) {
      if (f.size > MAX_UPLOAD_BYTES) return jsonError(`${f.name}: file larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
      try { frames.push(decodeImage(Buffer.from(await f.arrayBuffer())).gray); } catch (err) {
        if (err instanceof ImageDecodeError) return jsonError(`${f.name}: ${err.message}`, 415);
        throw err;
      }
      names.push(f.name.slice(0, 80));
    }
    const sizes = new Set(frames.map((f) => `${f.width}x${f.height}`));
    if (sizes.size > 1) return jsonError("All frames must have the same dimensions.");
    const p = form.get("params");
    if (typeof p === "string") { try { rawParams = JSON.parse(p); } catch { return jsonError("params must be valid JSON."); } }
    input = { files: names, frames: frames.length, width: frames[0].width, height: frames[0].height };
    dataOrigin = "user-upload";
  } else {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const seq = getSampleSequence(String(body.sequenceId ?? ""));
    if (!seq) return jsonError("Unknown sequenceId.", 404);
    const gen = generateSequence(seq.opts);
    frames = gen.frames.map((f) => f.image);
    truthTracks = gen.truthTracks;
    input = { sequenceId: seq.id, title: seq.title, frames: frames.length, width: seq.opts.width, height: seq.opts.height, synthetic: true, options: seq.opts };
    rawParams = body.params ?? {};
    dataOrigin = "synthetic-demo";
  }

  const params = parseTrackerParams(rawParams);
  const detParams: Partial<DetectorParams> = { kSigma: params.kSigma };
  const perFrame: Detection[][] = frames.map((img) => detect(img, detParams).detections);
  const result = trackFrames(perFrame, params);
  const recovery = truthTracks ? recoveryScore(result.tracks, truthTracks) : undefined;

  const runId = await saveRun({
    kind: "tracking", title: `Tracking — ${(input.title as string) ?? `${frames.length} uploaded frames`}`, dataOrigin,
    modelName: `${DETECTOR_INFO.name}+kalman-nn-tracker`, modelVersion: DETECTOR_INFO.version, params: { ...params },
    input, output: { tracks: result.tracks, summary: result.summary, detectionsPerFrame: perFrame.map((d) => d.length) }, metrics: recovery ?? {}, limitations: LIMITATIONS,
  });

  return NextResponse.json({ ok: true, ...result, detectionsPerFrame: perFrame, truthTracks, recovery, image: { width: frames[0].width, height: frames[0].height, frames: frames.length }, limitations: LIMITATIONS, runId, dataOrigin });
});
