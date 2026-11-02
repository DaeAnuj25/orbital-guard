/**
 * Minimal structured logger. Writes JSON lines to stdout/stderr so logs are
 * easy to grep locally and to ship to any log collector later. Level is set
 * with ORBITAL_GUARD_LOG_LEVEL (debug | info | warn | error; default info).
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const current = (): Level => {
  const l = (process.env.ORBITAL_GUARD_LOG_LEVEL ?? "info").toLowerCase() as Level;
  return l in ORDER ? l : "info";
};
function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[current()]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}
export const log = {
  debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
};
