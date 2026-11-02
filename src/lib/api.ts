/**
 * Shared API-route helpers: consistent JSON error envelopes that never leak
 * stack traces or paths, plus small input coercion utilities.
 */
import { NextResponse } from "next/server";
import { log } from "./log";

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

/** Wrap a handler so unexpected exceptions become a generic 500 (logged server-side). */
export function withErrorBoundary<T extends unknown[]>(name: string, fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      log.error(`${name} failed`, { error: (err as Error).message });
      return jsonError("The server could not complete this request. Please check your input and try again.", 500);
    }
  };
}

export const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
