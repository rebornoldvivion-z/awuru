import type { Decision, Direction } from "../domain/types.ts";

export type WalkRow = {
  now: number;
  user: Decision["userDecision"];
  wait: Decision["waitCode"];
  state: Decision["lifecycle"];
  family: Decision["family"];
  structure: string | null;
  released: boolean;
};

export function summarizeWalk(rows: WalkRow[]): {
  n: number;
  watch: number;
  wait: number;
  buy: number;
  sell: number;
  releaseRate: number;
} {
  const n = rows.length;
  const watch = rows.filter((r) => r.user === "WATCH").length;
  const wait = rows.filter((r) => r.user === "WAIT").length;
  const buy = rows.filter((r) => r.user === "BUY").length;
  const sell = rows.filter((r) => r.user === "SELL").length;
  return { n, watch, wait, buy, sell, releaseRate: n ? (buy + sell) / n : 0 };
}

/** Same-bar: if both SL and TP trade, SL first. */
export function pathOutcome(
  direction: Direction,
  entry: number,
  stop: number,
  tp1: number,
  future: Array<{ high: number; low: number; close: number }>,
): "sl" | "tp1" | "expired" {
  for (const b of future) {
    const hitSl = direction === "long" ? b.low <= stop : b.high >= stop;
    const hitTp = direction === "long" ? b.high >= tp1 : b.low <= tp1;
    if (hitSl && hitTp) return "sl";
    if (hitSl) return "sl";
    if (hitTp) return "tp1";
  }
  return "expired";
}
