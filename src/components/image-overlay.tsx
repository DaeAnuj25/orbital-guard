"use client";
/**
 * Canvas overlay used by the Detection Lab and Tracking pages.
 * Draws the source image, bounding boxes with labels, optional ground-truth
 * boxes and polyline trajectories, and can export the annotated PNG.
 */
import { useEffect, useRef, useState } from "react";

export interface OverlayBox { bbox: [number, number, number, number]; label: string; color?: string; dashed?: boolean }
export interface OverlayPath { points: Array<{ x: number; y: number; measured?: boolean }>; color: string; label?: string }

interface Props {
  src: string | null;
  width: number;
  height: number;
  boxes?: OverlayBox[];
  paths?: OverlayPath[];
  showLabels?: boolean;
  caption?: string;
  downloadName?: string;
  /** Rendered when src is null (e.g. multi-frame upload without preview). */
  placeholder?: string;
}

const EMPTY_BOXES: OverlayBox[] = [];
const EMPTY_PATHS: OverlayPath[] = [];

export function ImageOverlay({ src, width, height, boxes = EMPTY_BOXES, paths = EMPTY_PATHS, showLabels = true, caption, downloadName = "annotated.png", placeholder }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = width; canvas.height = height;
    const draw = (img: HTMLImageElement | null) => {
      ctx.fillStyle = "#05070f";
      ctx.fillRect(0, 0, width, height);
      if (img) ctx.drawImage(img, 0, 0, width, height);
      const scale = Math.max(1, Math.min(width, height) / 400);
      ctx.lineWidth = 1.2 * scale;
      ctx.font = `${11 * scale}px ui-monospace, monospace`;
      for (const b of boxes) {
        const [x1, y1, x2, y2] = b.bbox;
        ctx.strokeStyle = b.color ?? "#22d3ee";
        ctx.setLineDash(b.dashed ? [4 * scale, 3 * scale] : []);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        if (showLabels && b.label) {
          const tw = ctx.measureText(b.label).width + 6 * scale;
          const ty = y1 - 14 * scale < 0 ? y2 + 2 * scale : y1 - 14 * scale;
          ctx.fillStyle = "rgba(5,7,15,0.8)";
          ctx.fillRect(x1, ty, tw, 13 * scale);
          ctx.fillStyle = b.color ?? "#22d3ee";
          ctx.fillText(b.label, x1 + 3 * scale, ty + 10 * scale);
        }
      }
      ctx.setLineDash([]);
      for (const p of paths) {
        if (!p.points.length) continue;
        ctx.strokeStyle = p.color; ctx.lineWidth = 1.6 * scale;
        ctx.beginPath();
        p.points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
        ctx.stroke();
        p.points.forEach((pt) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (pt.measured === false ? 2 : 3) * scale, 0, Math.PI * 2);
          ctx.fillStyle = pt.measured === false ? "rgba(255,255,255,0.35)" : p.color;
          ctx.fill();
        });
        if (showLabels && p.label) {
          const last = p.points[p.points.length - 1];
          ctx.fillStyle = p.color;
          ctx.fillText(p.label, last.x + 5 * scale, last.y - 5 * scale);
        }
      }
    };
    if (!src) { draw(null); return; }
    const img = new Image();
    img.onload = () => { setError(null); draw(img); };
    img.onerror = () => { setError("Could not load image preview."); draw(null); };
    img.src = src;
  }, [src, width, height, boxes, paths, showLabels]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = downloadName;
    a.click();
  };

  return (
    <figure className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
        <canvas ref={canvasRef} className="block h-auto w-full" role="img" aria-label={caption ?? "Annotated image"} />
        {!src && placeholder && <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">{placeholder}</div>}
      </div>
      <figcaption className="flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>{error ?? caption}</span>
        <button type="button" onClick={download} className="btn-ghost !px-2 !py-1 text-xs">Download annotated PNG</button>
      </figcaption>
    </figure>
  );
}
