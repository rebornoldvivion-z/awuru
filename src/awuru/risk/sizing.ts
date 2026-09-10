import type { InstrumentFilters, SizeResult } from "../domain/types.ts";

export function decimalsOf(step: number): number {
  const s = step.toString();
  if (s.includes("e-")) {
    const exp = Number(s.split("e-")[1]);
    return Number.isFinite(exp) ? exp : 0;
  }
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

export function roundToDecimals(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function roundToTick(price: number, tick: number): number {
  if (!(tick > 0)) return price;
  return roundToDecimals(Math.round(price / tick) * tick, decimalsOf(tick));
}

export function floorToStep(qty: number, step: number): number {
  if (!(step > 0)) return qty;
  const floored = Math.floor((qty + 1e-12) / step) * step;
  return roundToDecimals(floored, decimalsOf(step));
}

export function sizePosition(args: {
  equity: number;
  riskPct: number;
  entry: number;
  stop: number;
  filters: InstrumentFilters;
}): SizeResult {
  const { equity, riskPct, filters } = args;
  if (!filters.tradable) {
    return { ok: false, reason: "WAIT_UNSIZEABLE", detail: `symbol status ${filters.status}` };
  }
  if (!(filters.tickSize > 0 && filters.qtyStep > 0 && filters.minQty > 0)) {
    return { ok: false, reason: "WAIT_UNSIZEABLE", detail: "missing instrument filters" };
  }
  const entry = roundToTick(args.entry, filters.tickSize);
  const stop = roundToTick(args.stop, filters.tickSize);
  const dist = Math.abs(entry - stop);
  if (!(dist > 0) || !(entry > 0)) {
    return { ok: false, reason: "WAIT_UNSIZEABLE", detail: "entry equals stop" };
  }
  const riskCash = equity * riskPct;
  if (!(riskCash > 0)) {
    return { ok: false, reason: "WAIT_UNSIZEABLE", detail: "risk cash is zero" };
  }
  const rawQty = riskCash / dist;
  const qty = floorToStep(rawQty, filters.qtyStep);
  if (qty < filters.minQty) {
    return {
      ok: false,
      reason: "WAIT_UNSIZEABLE",
      detail: `qty ${qty} < minQty ${filters.minQty} (will not round up)`,
    };
  }
  const notional = qty * entry;
  if (filters.minNotional != null && notional < filters.minNotional) {
    return {
      ok: false,
      reason: "WAIT_UNSIZEABLE",
      detail: `notional ${notional} < minNotional ${filters.minNotional} (will not round up)`,
    };
  }
  return { ok: true, qty, riskCash, notional, entry, stop };
}
