/**
 * Small presentational building blocks shared by every page. Kept dependency-free
 * and server-compatible (no hooks) except for DownloadButton, which needs the DOM.
 */
import type { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({ title, subtitle, badge, children }: { title: string; subtitle?: string; badge?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-2 max-w-3xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="panel-title">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "info" | "ok" | "warn" | "danger" | "demo" | "measured" | "neutral";
const TONES: Record<Tone, string> = {
  info: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  danger: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  demo: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  measured: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  neutral: "border-white/15 bg-white/5 text-slate-300",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TONES[tone]}`}>{children}</span>;
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div role={tone === "danger" || tone === "warn" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}>
      {title && <div className="mb-1 font-semibold">{title}</div>}
      <div className="text-slate-200/90">{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-white">{value}</div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function Spinner({ label = "Working…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-cyan-200" role="status" aria-live="polite">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" /><path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      {label}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 px-4 py-8 text-center">
      <div className="text-sm font-medium text-slate-200">{title}</div>
      {children && <div className="mt-1 text-xs text-slate-500">{children}</div>}
    </div>
  );
}

export function LimitationsList({ items, title = "Limitations & assumptions" }: { items: string[]; title?: string }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-200">{title}</div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-300">{items.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

export function ModuleLink({ href, title, description, status }: { href: string; title: string; description: string; status: ReactNode }) {
  return (
    <Link href={href} className="card group block p-5 transition hover:border-cyan-400/40 hover:bg-space-800/70">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-white group-hover:text-cyan-200">{title}</h3>
        {status}
      </div>
      <p className="text-sm text-slate-400">{description}</p>
    </Link>
  );
}

export function DataTable({ columns, rows, emptyText = "No rows" }: { columns: Array<{ key: string; label: string; align?: "left" | "right" }>; rows: Array<Record<string, ReactNode>>; emptyText?: string }) {
  if (!rows.length) return <EmptyState title={emptyText} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-xs">
        <thead className="bg-white/5 text-left text-slate-300">
          <tr>{columns.map((c) => <th key={c.key} className={`px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/5 hover:bg-white/5">
              {columns.map((c) => <td key={c.key} className={`px-3 py-1.5 font-mono text-slate-200 ${c.align === "right" ? "text-right" : ""}`}>{r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Trigger a client-side download of text/JSON content. */
export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsvClient(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

export const fmt = (v: number | undefined | null, d = 3) => (v === undefined || v === null || Number.isNaN(v) ? "—" : Number(v).toFixed(d));
export const pct = (v: number | undefined | null) => (v === undefined || v === null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(1)}%`);
