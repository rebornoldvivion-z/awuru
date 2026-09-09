import {
  ADX_PERIOD,
  ATR_PERIOD,
  BB_PERIOD,
  BB_STD,
  DONCHIAN_PERIOD,
  EMA_FAST,
  EMA_SLOW,
  RSI_PERIOD,
} from "./constants.ts";
import type { Candle, IndicatorSnapshot } from "./types.ts";

function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = NaN;
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (i < period) {
      seed += v;
      if (i === period - 1) {
        prev = seed / period;
        out.push(prev);
      } else {
        out.push(NaN);
      }
    } else {
      prev = v * k + prev * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

export function wilderRsi(closes: number[], period = RSI_PERIOD): number[] {
  const out: number[] = Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function trueRange(candles: Candle[], i: number): number {
  const c = candles[i]!;
  if (i === 0) return c.high - c.low;
  const prev = candles[i - 1]!;
  return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
}

export function wilderAtr(candles: Candle[], period = ATR_PERIOD): number[] {
  const out: number[] = Array(candles.length).fill(NaN);
  if (candles.length < period) return out;
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trueRange(candles, i);
  atr /= period;
  out[period - 1] = atr;
  for (let i = period; i < candles.length; i++) {
    atr = (atr * (period - 1) + trueRange(candles, i)) / period;
    out[i] = atr;
  }
  return out;
}

export function wilderAdx(
  candles: Candle[],
  period = ADX_PERIOD,
): { adx: number[]; plusDi: number[]; minusDi: number[] } {
  const n = candles.length;
  const adx = Array(n).fill(NaN);
  const plusDi = Array(n).fill(NaN);
  const minusDi = Array(n).fill(NaN);
  if (n < period * 2) return { adx, plusDi, minusDi };

  const plusDm: number[] = [];
  const minusDm: number[] = [];
  const tr: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      plusDm.push(0);
      minusDm.push(0);
      tr.push(candles[0]!.high - candles[0]!.low);
      continue;
    }
    const up = candles[i]!.high - candles[i - 1]!.high;
    const down = candles[i - 1]!.low - candles[i]!.low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    tr.push(trueRange(candles, i));
  }

  let smPlus = 0;
  let smMinus = 0;
  let smTr = 0;
  for (let i = 1; i <= period; i++) {
    smPlus += plusDm[i]!;
    smMinus += minusDm[i]!;
    smTr += tr[i]!;
  }
  const dx: number[] = Array(n).fill(NaN);
  plusDi[period] = smTr === 0 ? 0 : (100 * smPlus) / smTr;
  minusDi[period] = smTr === 0 ? 0 : (100 * smMinus) / smTr;
  const diSum = plusDi[period]! + minusDi[period]!;
  dx[period] = diSum === 0 ? 0 : (100 * Math.abs(plusDi[period]! - minusDi[period]!)) / diSum;

  for (let i = period + 1; i < n; i++) {
    smPlus = smPlus - smPlus / period + plusDm[i]!;
    smMinus = smMinus - smMinus / period + minusDm[i]!;
    smTr = smTr - smTr / period + tr[i]!;
    plusDi[i] = smTr === 0 ? 0 : (100 * smPlus) / smTr;
    minusDi[i] = smTr === 0 ? 0 : (100 * smMinus) / smTr;
    const s = plusDi[i]! + minusDi[i]!;
    dx[i] = s === 0 ? 0 : (100 * Math.abs(plusDi[i]! - minusDi[i]!)) / s;
  }

  let adxAcc = 0;
  const start = period;
  const adxSeedEnd = start + period - 1;
  if (adxSeedEnd >= n) return { adx, plusDi, minusDi };
  for (let i = start; i <= adxSeedEnd; i++) adxAcc += dx[i]!;
  adx[adxSeedEnd] = adxAcc / period;
  for (let i = adxSeedEnd + 1; i < n; i++) {
    adx[i] = (adx[i - 1]! * (period - 1) + dx[i]!) / period;
  }
  return { adx, plusDi, minusDi };
}

export function bollinger(closes: number[], period = BB_PERIOD, k = BB_STD) {
  const mid = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1 || !Number.isFinite(mid[i]!)) {
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }
    let sumSq = 0;
    const m = mid[i]!;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j]! - m;
      sumSq += d * d;
    }
    const sd = Math.sqrt(sumSq / period);
    upper.push(m + k * sd);
    lower.push(m - k * sd);
  }
  return { mid, upper, lower };
}

export function donchian(candles: Candle[], period = DONCHIAN_PERIOD) {
  const high: number[] = [];
  const low: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      high.push(NaN);
      low.push(NaN);
      continue;
    }
    let h = -Infinity;
    let l = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      h = Math.max(h, candles[j]!.high);
      l = Math.min(l, candles[j]!.low);
    }
    high.push(h);
    low.push(l);
  }
  return { high, low };
}

export function snapshot(candles: Candle[]): IndicatorSnapshot | null {
  if (candles.length < EMA_SLOW + 2) return null;
  const closes = candles.map((c) => c.close);
  const rsi = wilderRsi(closes);
  const atr = wilderAtr(candles);
  const dmi = wilderAdx(candles);
  const emaF = ema(closes, EMA_FAST);
  const emaS = ema(closes, EMA_SLOW);
  const bb = bollinger(closes);
  const dc = donchian(candles);
  const i = candles.length - 1;
  const vals = [
    rsi[i],
    atr[i],
    dmi.adx[i],
    dmi.plusDi[i],
    dmi.minusDi[i],
    emaF[i],
    emaS[i],
    bb.mid[i],
    bb.upper[i],
    bb.lower[i],
    dc.high[i],
    dc.low[i],
  ];
  if (vals.some((v) => !Number.isFinite(v))) return null;
  return {
    rsi: rsi[i]!,
    atr: atr[i]!,
    adx: dmi.adx[i]!,
    plusDi: dmi.plusDi[i]!,
    minusDi: dmi.minusDi[i]!,
    emaFast: emaF[i]!,
    emaSlow: emaS[i]!,
    bbMid: bb.mid[i]!,
    bbUpper: bb.upper[i]!,
    bbLower: bb.lower[i]!,
    donchianHigh: dc.high[i]!,
    donchianLow: dc.low[i]!,
  };
}

export function priorDonchian(candles: Candle[], period = DONCHIAN_PERIOD): { high: number; low: number } | null {
  if (candles.length < period + 1) return null;
  const prev = candles.slice(0, -1);
  const dc = donchian(prev, period);
  const i = prev.length - 1;
  const h = dc.high[i];
  const l = dc.low[i];
  if (!Number.isFinite(h) || !Number.isFinite(l)) return null;
  return { high: h!, low: l! };
}

export function lastFinite(arr: number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i]!;
  }
  return null;
}
