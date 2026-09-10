import type { Venue } from "../domain/constants.ts";
import type { InstrumentFilters } from "../domain/types.ts";
import { num } from "./candles.ts";

function filterOf(filters: unknown[], type: string): Record<string, unknown> | null {
  for (const f of filters) {
    if (f && typeof f === "object" && (f as { filterType?: string }).filterType === type) {
      return f as Record<string, unknown>;
    }
  }
  return null;
}

export function parseBinanceFilters(
  info: unknown,
  symbol: string,
): InstrumentFilters | { error: string } {
  const root = info as { symbols?: unknown[] };
  const symbols = root.symbols ?? [];
  const row = symbols.find((s) => (s as { symbol?: string }).symbol === symbol) as
    | {
        symbol: string;
        status: string;
        baseAsset: string;
        quoteAsset: string;
        filters: unknown[];
      }
    | undefined;
  if (!row) return { error: `exchangeInfo missing ${symbol}` };
  const price = filterOf(row.filters, "PRICE_FILTER");
  const lot = filterOf(row.filters, "LOT_SIZE");
  const notional = filterOf(row.filters, "NOTIONAL") ?? filterOf(row.filters, "MIN_NOTIONAL");
  if (!price || !lot) return { error: `${symbol} missing PRICE_FILTER or LOT_SIZE` };
  const tickSize = num(price.tickSize);
  const qtyStep = num(lot.stepSize);
  const minQty = num(lot.minQty);
  const minNotional = notional ? num(notional.minNotional) : null;
  if (!(tickSize > 0 && qtyStep > 0 && minQty > 0)) {
    return { error: `${symbol} unusable tick/step/minQty` };
  }
  return {
    venue: "binance",
    symbol,
    base: row.baseAsset,
    quote: row.quoteAsset,
    tickSize,
    qtyStep,
    minQty,
    minNotional: minNotional && minNotional > 0 ? minNotional : null,
    status: row.status,
    tradable: row.status === "TRADING",
  };
}

export function parseKrakenFilters(
  info: unknown,
  native: string,
): InstrumentFilters | { error: string } {
  const result = (info as { result?: Record<string, unknown> }).result ?? {};
  let row: Record<string, unknown> | undefined;
  for (const [k, v] of Object.entries(result)) {
    const rec = v as Record<string, unknown>;
    if (k === native || rec.altname === native || rec.wsname === native) {
      row = rec;
      row._key = k;
      break;
    }
  }
  if (!row) return { error: `AssetPairs missing ${native}` };
  const tickSize = num(row.tick_size);
  const lotDecimals = num(row.lot_decimals);
  const qtyStep = Number.isFinite(lotDecimals) ? 10 ** -lotDecimals : NaN;
  const minQty = num(row.ordermin);
  const costmin = num(row.costmin);
  if (!(tickSize > 0 && qtyStep > 0 && minQty > 0)) {
    return { error: `${native} unusable Kraken filters` };
  }
  const status = String(row.status ?? "");
  return {
    venue: "kraken",
    symbol: native,
    base: String(row.base ?? ""),
    quote: String(row.quote ?? ""),
    tickSize,
    qtyStep,
    minQty,
    minNotional: costmin > 0 ? costmin : null,
    status,
    tradable: status === "online" || status === "",
  };
}

export function parseOkxFilters(
  info: unknown,
  instId: string,
): InstrumentFilters | { error: string } {
  const data = (info as { data?: unknown[] }).data ?? [];
  const row = data.find((d) => (d as { instId?: string }).instId === instId) as
    | {
        instId: string;
        baseCcy: string;
        quoteCcy: string;
        tickSz: string;
        lotSz: string;
        minSz: string;
        state: string;
      }
    | undefined;
  if (!row) return { error: `instruments missing ${instId}` };
  const tickSize = num(row.tickSz);
  const qtyStep = num(row.lotSz);
  const minQty = num(row.minSz);
  if (!(tickSize > 0 && qtyStep > 0 && minQty > 0)) {
    return { error: `${instId} unusable OKX filters` };
  }
  return {
    venue: "okx",
    symbol: instId,
    base: row.baseCcy,
    quote: row.quoteCcy,
    tickSize,
    qtyStep,
    minQty,
    minNotional: null,
    status: row.state,
    tradable: row.state === "live",
  };
}

export function parseFilters(
  venue: Venue,
  info: unknown,
  symbol: string,
): InstrumentFilters | { error: string } {
  if (venue === "binance") return parseBinanceFilters(info, symbol);
  if (venue === "kraken") return parseKrakenFilters(info, symbol);
  return parseOkxFilters(info, symbol);
}
