import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "ORBITAL GUARD — AI-Powered Space Debris Detection and Collision Risk Analysis",
  description: "Research prototype: optical detection of space objects, multi-frame tracking, SGP4 orbital propagation and preliminary close-approach screening.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-cyan-500 focus:px-3 focus:py-1 focus:text-space-950">Skip to content</a>
        <Nav />
        <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
          ORBITAL GUARD research prototype · Not an operational space-situational-awareness system · Results are preliminary and for learning purposes
        </footer>
      </body>
    </html>
  );
}
