/**
 * Experiment / analysis run log.
 *
 * One table is enough for this prototype: every module (detection, tracking,
 * benchmark, propagation, conjunction) stores a self-describing record with its
 * inputs, parameters, outputs and limitations so the Reports page can list,
 * export (JSON/CSV/Markdown) and reproduce it. `data_origin` is the field that
 * keeps demonstration data separate from experimental data.
 */
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type RunKind = "detection" | "tracking" | "evaluation" | "propagation" | "conjunction";
export type DataOrigin = "synthetic-demo" | "user-upload" | "bundled-catalog" | "live-catalog" | "user-import";

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<RunKind>().notNull(),
  title: text("title").notNull(),
  dataOrigin: text("data_origin").$type<DataOrigin>().notNull(),
  modelName: text("model_name"),
  modelVersion: text("model_version"),
  params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
  input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().default({}),
  limitations: jsonb("limitations").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
