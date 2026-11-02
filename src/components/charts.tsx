"use client";
/**
 * Thin Recharts wrappers with the dashboard's dark styling. Everything is a
 * client component because Recharts renders SVG through React state.
 */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, ScatterChart, Scatter, ReferenceLine } from "recharts";

const AXIS = { stroke: "#64748b", fontSize: 11 } as const;
const GRID = { stroke: "rgba(255,255,255,0.06)" } as const;
const TOOLTIP = { contentStyle: { background: "#0a0f22", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#67e8f9" } } as const;
export const SERIES_COLORS = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#60a5fa", "#fb7185", "#facc15"];

export interface SeriesSpec { key: string; name?: string; color?: string; dashed?: boolean }

export function LineSeriesChart({ data, x, series, height = 260, yLabel, xLabel, yDomain, refY, refLabel, logY }: { data: Array<Record<string, unknown>>; x: string; series: SeriesSpec[]; height?: number; yLabel?: string; xLabel?: string; yDomain?: [number | "auto", number | "auto"]; refY?: number; refLabel?: string; logY?: boolean }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey={x} {...AXIS} label={xLabel ? { value: xLabel, position: "insideBottom", offset: -10, fill: "#94a3b8", fontSize: 11 } : undefined} />
          <YAxis {...AXIS} domain={yDomain} scale={logY ? "log" : "auto"} allowDataOverflow={logY} label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 } : undefined} />
          <Tooltip {...TOOLTIP} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {refY !== undefined && <ReferenceLine y={refY} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: refLabel, fill: "#f59e0b", fontSize: 11 }} />}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name ?? s.key} stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={1.8} dot={false} strokeDasharray={s.dashed ? "5 4" : undefined} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarSeriesChart({ data, x, series, height = 240, yDomain }: { data: Array<Record<string, unknown>>; x: string; series: SeriesSpec[]; height?: number; yDomain?: [number, number] }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey={x} {...AXIS} />
          <YAxis {...AXIS} domain={yDomain} />
          <Tooltip {...TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name ?? s.key} fill={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]} radius={[3, 3, 0, 0]} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ground track: longitude vs latitude scatter (a flat world view without basemap tiles). */
export function GroundTrackChart({ points, height = 300 }: { points: Array<{ lon: number; lat: number }>; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis type="number" dataKey="lon" domain={[-180, 180]} ticks={[-180, -120, -60, 0, 60, 120, 180]} {...AXIS} label={{ value: "Longitude (°)", position: "insideBottom", offset: -10, fill: "#94a3b8", fontSize: 11 }} />
          <YAxis type="number" dataKey="lat" domain={[-90, 90]} ticks={[-90, -45, 0, 45, 90]} {...AXIS} label={{ value: "Latitude (°)", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
          <Tooltip {...TOOLTIP} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
          <Scatter data={points} fill="#22d3ee" line={false} isAnimationActive={false} shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={1.6} fill="#22d3ee" />} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
