"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/** Analysis modules (the functional part of the app). */
export const NAV_ITEMS = [
  { href: "/", label: "Mission" },
  { href: "/detection", label: "Detection Lab" },
  { href: "/dataset", label: "Dataset & Model" },
  { href: "/tracking", label: "Tracking" },
  { href: "/orbital", label: "Orbital Analysis" },
  { href: "/conjunction", label: "Close Approach" },
  { href: "/reports", label: "Reports" },
];

/** Documentation destinations, kept in a second cluster so the bar never overflows. */
export const DOC_ITEMS = [
  { href: "/tutorial", label: "Tutorial" },
  { href: "/how-built", label: "How It's Built" },
  { href: "/learn", label: "Learning Centre" },
];

const ALL = [...NAV_ITEMS, ...DOC_ITEMS];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const linkClass = (href: string, base: string) =>
    `${base} rounded-md px-2.5 py-1.5 text-sm transition ${pathname === href ? "bg-cyan-400/15 text-cyan-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`;
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-space-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex flex-none items-center gap-3" aria-label="ORBITAL GUARD home">
          <svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="8" fill="#22d3ee" opacity="0.9" />
            <ellipse cx="24" cy="24" rx="20" ry="8" fill="none" stroke="#67e8f9" strokeWidth="1.5" transform="rotate(-25 24 24)" />
            <ellipse cx="24" cy="24" rx="20" ry="8" fill="none" stroke="#a5b4fc" strokeWidth="1" opacity="0.6" transform="rotate(35 24 24)" />
            <circle cx="41" cy="16" r="2" fill="#f8fafc" />
          </svg>
          <div className="hidden leading-tight sm:block 2xl:block xl:hidden">
            <div className="text-sm font-bold tracking-[0.2em] text-white">ORBITAL GUARD</div>
            <div className="text-[11px] text-cyan-300/80">Space debris detection & collision-risk research</div>
          </div>
        </Link>
        <nav className="hidden flex-none items-center gap-0.5 xl:flex" aria-label="Analysis modules">
          {NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={linkClass(item.href, "whitespace-nowrap !px-2 !text-[13px] 2xl:!px-2.5 2xl:!text-sm")}>{item.label}</Link>)}
        </nav>
        <nav className="hidden flex-none items-center gap-0.5 border-l border-white/10 pl-3 2xl:flex" aria-label="Documentation">
          {DOC_ITEMS.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={linkClass(item.href, "whitespace-nowrap !px-2 !text-xs text-slate-400")}>{item.label}</Link>)}
        </nav>
        <button type="button" className="btn-secondary flex-none 2xl:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" className="border-t border-white/10 px-4 py-2 2xl:hidden" aria-label="All sections">
          <div className="mb-1 px-3 pt-1 text-[11px] uppercase tracking-wider text-slate-500">Analysis modules</div>
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`block rounded-md px-3 py-2 text-sm ${pathname === item.href ? "bg-cyan-400/15 text-cyan-200" : "text-slate-300 hover:bg-white/5"}`}>{item.label}</Link>
          ))}
          <div className="mb-1 mt-2 px-3 text-[11px] uppercase tracking-wider text-slate-500">Documentation</div>
          {DOC_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`block rounded-md px-3 py-2 text-sm ${pathname === item.href ? "bg-cyan-400/15 text-cyan-200" : "text-slate-300 hover:bg-white/5"}`}>{item.label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}
