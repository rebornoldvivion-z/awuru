import type { Candle, Direction, Shadow, ShadowStatus } from "../domain/types.ts";

export function scoreShadow(shadow: Shadow, laterClosed: Candle[], nowMs: number): Shadow {
  if (shadow.status === "unscorable") return shadow;
  const after = laterClosed.filter((c) => c.openTime > shadow.barOpen);
  let status: ShadowStatus = "open";
  let realizedR: number | null = null;

  for (const bar of after) {
    const hit = firstTouch(shadow.direction, shadow, bar);
    if (hit === "sl") {
      status = "sl";
      realizedR = -1;
      break;
    }
    if (hit === "tp3") {
      status = "tp3";
      realizedR = 3;
      break;
    }
    if (hit === "tp2") {
      status = "tp2";
      realizedR = 2;
      break;
    }
    if (hit === "tp1") {
      status = "tp1";
      realizedR = 1;
      break;
    }
  }

  if (status === "open" && nowMs >= shadow.frozenAt && after.length > 0) {
    const last = after[after.length - 1]!;
    if (last.openTime + (last.closeTime - last.openTime + 1) >= expiryOf(shadow)) {
      status = "expired";
      realizedR = 0;
    }
  }

  if (status === "open") {
    const last = after[after.length - 1];
    if (last && last.openTime >= expiryOf(shadow)) {
      status = "expired";
      realizedR = 0;
    }
  }

  return { ...shadow, status, realizedR, scoredAt: nowMs };
}

function expiryOf(shadow: Shadow): number {
  return shadow.barOpen + 16 * 15 * 60 * 1000;
}

function firstTouch(
  direction: Direction,
  g: Pick<Shadow, "stop" | "tp1" | "tp2" | "tp3">,
  bar: Candle,
): "sl" | "tp1" | "tp2" | "tp3" | null {
  if (direction === "long") {
    const sl = bar.low <= g.stop;
    const tp3 = bar.high >= g.tp3;
    const tp2 = bar.high >= g.tp2;
    const tp1 = bar.high >= g.tp1;
    if (sl && (tp1 || tp2 || tp3)) return "sl";
    if (sl) return "sl";
    if (tp3) return "tp3";
    if (tp2) return "tp2";
    if (tp1) return "tp1";
    return null;
  }
  const sl = bar.high >= g.stop;
  const tp3 = bar.low <= g.tp3;
  const tp2 = bar.low <= g.tp2;
  const tp1 = bar.low <= g.tp1;
  if (sl && (tp1 || tp2 || tp3)) return "sl";
  if (sl) return "sl";
  if (tp3) return "tp3";
  if (tp2) return "tp2";
  if (tp1) return "tp1";
  return null;
}

export function scoreMissionGeometry(
  direction: Direction,
  g: { stop: number; tp1: number; tp2: number; tp3: number; expiry: number; barOpen: number },
  laterClosed: Candle[],
  nowMs: number,
): { status: ShadowStatus; realizedR: number | null } {
  const fake: Shadow = {
    id: "tmp",
    signalId: "",
    accountId: "",
    venue: "binance",
    symbol: "",
    timeframe: "15m",
    barOpen: g.barOpen,
    direction,
    entry: 0,
    stop: g.stop,
    tp1: g.tp1,
    tp2: g.tp2,
    tp3: g.tp3,
    family: "trend",
    evidenceGrade: "weak",
    persona: "Orion",
    waitCode: "WAIT_REGIME",
    engineVersion: "",
    frozenAt: g.barOpen,
    status: "open",
    scoredAt: null,
    realizedR: null,
  };
  const scored = scoreShadow(fake, laterClosed, nowMs);
  return { status: scored.status, realizedR: scored.realizedR };
}
