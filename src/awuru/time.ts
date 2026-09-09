import { INTERVAL_MS, type Timeframe } from "./constants.ts";

export function parentOpen(childOpenMs: number, parentIntervalMs: number): number {
  return Math.floor(childOpenMs / parentIntervalMs) * parentIntervalMs;
}

export function isAligned(openMs: number, intervalMs: number): boolean {
  return openMs % intervalMs === 0;
}

export function intervalMs(tf: Timeframe): number {
  return INTERVAL_MS[tf];
}

export function scheduledCloseTime(openMs: number, intervalMsValue: number): number {
  return openMs + intervalMsValue - 1;
}

export function isTimeClosed(openMs: number, intervalMsValue: number, nowMs: number): boolean {
  return nowMs >= openMs + intervalMsValue;
}

export function latestClosedOpen(nowMs: number, intervalMsValue: number): number {
  return Math.floor(nowMs / intervalMsValue) * intervalMsValue - intervalMsValue;
}

export function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function formatUtc(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function coerceMs(value: number): number {
  if (value < 1e12) return value * 1000;
  return value;
}

export function daysUntil(deadlineIso: string, nowMs: number): number {
  const end = Date.parse(`${deadlineIso}T23:59:59.000Z`);
  return (end - nowMs) / (24 * 60 * 60 * 1000);
}
