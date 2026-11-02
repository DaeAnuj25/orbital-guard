import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Tutorial } from "@/components/tutorial";

export const metadata = {
  title: "Step-by-Step Tutorial — ORBITAL GUARD",
  description: "Detailed walkthrough of every feature: detection engines and parameters, dataset and model laboratory, tracking, TLE/OMM import and SGP4 propagation, close-approach screening, reports and the REST API.",
};

const PATHS = [
  { who: "I have 10 minutes", path: "Quick start → Detection Lab (sample + classical engine) → Reports.", href: "#start" },
  { who: "I want to see the AI work", path: "Detection Lab (ONNX engine) → Dataset & Model Lab (measured experiments + benchmark).", href: "#detection" },
  { who: "I am writing the report", path: "Dataset & Model Lab → Reports (Markdown export) → Learning Centre §6 for metric definitions.", href: "#dataset" },
  { who: "I care about orbital mechanics", path: "Orbital Analysis (paste a TLE) → Close-Approach Analysis → Learning Centre §8.", href: "#orbital" },
  { who: "I want to extend the code", path: "Dataset & Model Lab (add your own dataset) → Using the REST API → Extending the project.", href: "#api" },
  { who: "I want to know how it was built", path: "How It's Built → build phases, tools and versions, decisions, training runs, verification log.", href: "/how-built" },
];

export default function TutorialPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Step-by-Step Tutorial"
        subtitle="A hands-on guide to every feature of ORBITAL GUARD: what each control does, what the defaults are, how to read each number, what to export, and how to fix the errors you will actually meet. Tick guides off as you go — progress is saved in your browser."
        badge={<Badge tone="info">Interactive guide</Badge>}
      >
        <Link href="/learn" className="btn-secondary">Concepts &amp; theory →</Link>
      </PageHeader>

      <Card title="Pick a path">
        <ul className="grid gap-2 sm:grid-cols-2">
          {PATHS.map((p) => (
            <li key={p.who}>
              <a href={p.href} className="block rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-cyan-400/40 hover:bg-white/10">
                <span className="block text-sm font-semibold text-cyan-200">{p.who}</span>
                <span className="mt-0.5 block text-xs text-slate-300">{p.path}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          This tutorial covers the <em>how</em>. The <Link href="/learn" className="text-cyan-300 underline">Learning Centre</Link> covers the <em>why</em>
          (debris, orbits, detection metrics, tracking, TLEs and conjunction analysis), and the{" "}
          <Link href="/how-built" className="text-cyan-300 underline">How It&rsquo;s Built</Link> records the build process, every tool and version used, and the verification results, and <code>README.md</code> in the project root is the reference for installation, architecture, the API and troubleshooting.
        </p>
      </Card>

      <Tutorial />
    </div>
  );
}
