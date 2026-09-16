/**
 * Model C staging observation worker.
 * Writes canonical closed candles to hosted Supabase. Does not become production authority.
 */
import {
  ASSETS,
  BINANCE_VISION,
  ENGINE_VERSION,
  INTERVAL_MS,
  KRAKEN_PUBLIC,
  OKX_PUBLIC,
  TIMEFRAMES,
  VENUE_SYMBOLS,
  type Asset,
  type Timeframe,
} from "../domain/constants.ts";
import type { Candle } from "../domain/types.ts";
import { loadMtfBundle, parseKrakenOhlc, parseOkxCandles } from "../market/venues.ts";
import { splitLive } from "../market/candles.ts";
import { incomingToCandle, type IncomingKline } from "../observe/ingest.ts";
import { CONTRACT_VERSION } from "../engine/canonical.ts";
import { assertModelCInfrastructureReady, type EnvMap } from "./gate.ts";
import { supabaseJson } from "./rest.ts";
import { ACTIVE_GOLD_SOURCE } from "./gold-source.ts";

export type WorkerLiveStatus =
  | "not_provisioned"
  | "reconciling"
  | "observing"
  | "reconnecting"
  | "degraded"
  | "data_gap"
  | "database_unavailable"
  | "stopped";

export type IngestCounts = {
  inserted: number;
  unchanged: number;
  conflict: number;
  ignored: number;
  failed: number;
};

const BACKFILL: Record<Timeframe, number> = { "15m": 120, "1h": 80, "4h": 40 };
export const LEASE_MS = 45_000;
const HEARTBEAT_MS = 15_000;
const BINANCE_WS = "wss://stream.binance.com:9443/stream";

function envMap(): EnvMap {
  return process.env;
}

function ownerId(): string {
  return `staging-observer-${process.pid}`;
}

async function ingestClosed(
  url: string,
  key: string,
  args: {
    venue: string;
    symbol: string;
    timeframe: Timeframe;
    candle: Candle;
    asset: Asset;
  },
): Promise<"inserted" | "unchanged" | "conflict" | "failed"> {
  const meta = VENUE_SYMBOLS.binance[args.asset];
  const body = {
    p_venue: args.venue,
    p_symbol: args.symbol,
    p_timeframe: args.timeframe,
    p_open_time: args.candle.openTime,
    p_close_time: args.candle.closeTime,
    p_open: args.candle.open,
    p_high: args.candle.high,
    p_low: args.candle.low,
    p_close: args.candle.close,
    p_volume: args.candle.volume,
    p_confirm: args.candle.confirm ?? "1",
    p_asset: args.asset,
    p_instrument: meta.instrument,
    p_market_class: meta.marketClass,
  };
  const res = await supabaseJson<string>(url, key, "rpc/ingest_closed_candle", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const value = typeof res.data === "string" ? res.data.replace(/"/g, "") : "";
  if (value === "inserted" || value === "unchanged" || value === "conflict") return value;
  return "failed";
}

export async function writeHealth(
  url: string,
  key: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const res = await supabaseJson(url, key, "system_health?id=eq.awuru", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res.ok;
}

export function leaseDecision(args: {
  now: number;
  heartbeatMs: number;
  owner: string;
  mine: string;
  leaseMs?: number;
}): "acquire" | "refuse" {
  const window = args.leaseMs ?? LEASE_MS;
  if (args.heartbeatMs && args.now - args.heartbeatMs < window && args.owner && args.owner !== args.mine) {
    return "refuse";
  }
  return "acquire";
}

export async function acquireLease(
  url: string,
  key: string,
  now = Date.now(),
): Promise<{ ok: boolean; reason: string }> {
  const got = await supabaseJson<
    Array<{ worker_heartbeat: string | null; feed_status: Record<string, unknown> | null }>
  >(url, key, "system_health?id=eq.awuru&select=worker_heartbeat,feed_status", { method: "GET" });
  if (!got.ok || !got.data?.[0]) return { ok: false, reason: "health_row_missing" };
  const row = got.data[0];
  const beat = row.worker_heartbeat ? Date.parse(row.worker_heartbeat) : 0;
  const owner = typeof row.feed_status?.owner === "string" ? row.feed_status.owner : "";
  const mine = ownerId();
  if (leaseDecision({ now, heartbeatMs: beat, owner, mine }) === "refuse") {
    return { ok: false, reason: `lease_held_by_${owner}` };
  }
  const ok = await writeHealth(url, key, {
    worker_status: "reconciling",
    worker_heartbeat: new Date(now).toISOString(),
    database_status: "connected",
    engine_version: ENGINE_VERSION,
    feed_status: { owner: mine, pid: process.pid, acquiredAt: now },
    note: "Stage 2 observation worker. Not production authority.",
  });
  return ok ? { ok: true, reason: "acquired" } : { ok: false, reason: "lease_write_failed" };
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
}

export async function backfillPrimary(url: string, key: string, now = Date.now()): Promise<IngestCounts> {
  const counts: IngestCounts = { inserted: 0, unchanged: 0, conflict: 0, ignored: 0, failed: 0 };
  const jobs: Array<{ asset: Asset; timeframe: Timeframe; candle: Candle; symbol: string }> = [];
  for (const asset of ASSETS) {
    const loaded = await loadMtfBundle(asset, now);
    if (!loaded.bundle || loaded.bundle.venue !== "binance") {
      counts.failed += 1;
      continue;
    }
    for (const tf of TIMEFRAMES) {
      const series = loaded.bundle.series[tf];
      const closed = series.candles.slice(-BACKFILL[tf]);
      for (const candle of closed) {
        jobs.push({ asset, timeframe: tf, candle, symbol: series.symbol });
      }
    }
  }
  await pool(jobs, 6, async (job) => {
    const result = await ingestClosed(url, key, {
      venue: "binance",
      symbol: job.symbol,
      timeframe: job.timeframe,
      candle: job.candle,
      asset: job.asset,
    });
    counts[result === "failed" ? "failed" : result] += 1;
  });
  return counts;
}

async function snapshotVenue(
  url: string,
  key: string,
  asset: Asset,
  venue: "kraken" | "okx",
  now: number,
): Promise<void> {
  const meta = VENUE_SYMBOLS[venue][asset];
  try {
    const fetchUrl =
      venue === "kraken"
        ? `${KRAKEN_PUBLIC}/OHLC?pair=${meta.native}&interval=15`
        : `${OKX_PUBLIC}/market/candles?instId=${meta.native}&bar=15m&limit=3`;
    const res = await fetch(fetchUrl, { cache: "no-store" });
    const raw = await res.json();
    const parsed = venue === "kraken" ? parseKrakenOhlc(raw, "15m") : parseOkxCandles(raw, "15m");
    const split = splitLive(parsed, INTERVAL_MS["15m"], now, venue);
    const last = split.closed[split.closed.length - 1];
    await supabaseJson(url, key, "source_snapshots", {
      method: "POST",
      body: JSON.stringify({
        asset,
        venue,
        symbol: meta.native,
        timeframe: "15m",
        observed_at: new Date(now).toISOString(),
        source_timestamp: last?.openTime ?? null,
        health: last ? "LIVE" : "UNAVAILABLE",
        bar_status: last ? "closed" : "missing",
        last_closed_open: last?.openTime ?? null,
        last_close: last?.close ?? null,
        source_role: "corroboration",
        ok: Boolean(last),
        reason: last ? "closed" : "no closed bar",
      }),
    });
  } catch (err) {
    await supabaseJson(url, key, "source_snapshots", {
      method: "POST",
      body: JSON.stringify({
        asset,
        venue,
        symbol: meta.native,
        timeframe: "15m",
        observed_at: new Date(now).toISOString(),
        health: "UNAVAILABLE",
        bar_status: "missing",
        source_role: "corroboration",
        ok: false,
        reason: err instanceof Error ? err.message.slice(0, 180) : "error",
      }),
    });
  }
}

export async function corroborateLatest(url: string, key: string, now = Date.now()): Promise<void> {
  for (const asset of ASSETS) {
    for (const venue of ["kraken", "okx"] as const) {
      await snapshotVenue(url, key, asset, venue, now);
    }
  }
}

function assetForBinanceSymbol(symbol: string): Asset | null {
  const s = symbol.toUpperCase();
  if (s === "BTCUSDT") return "BTC";
  if (s === "ETHUSDT") return "ETH";
  if (s === "PAXGUSDT") return "GOLD";
  return null;
}

export type BinanceKlineKind = "forming" | "closed" | "ignored";

export function classifyBinanceMessage(msg: unknown): { kind: BinanceKlineKind; kline: IncomingKline | null } {
  const data = (msg as { data?: { k?: Record<string, unknown> } }).data ?? (msg as { k?: Record<string, unknown> });
  const k = (data as { k?: Record<string, unknown> }).k;
  if (!k) return { kind: "ignored", kline: null };
  const symbol = String(k.s ?? "");
  const asset = assetForBinanceSymbol(symbol);
  const interval = String(k.i ?? "");
  if (!asset || (interval !== "15m" && interval !== "1h" && interval !== "4h")) {
    return { kind: "ignored", kline: null };
  }
  if (k.x !== true) return { kind: "forming", kline: null };
  return {
    kind: "closed",
    kline: {
      venue: "binance",
      symbol,
      timeframe: interval,
      openTime: Number(k.t),
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
      volume: Number(k.v),
      closed: true,
      confirm: "1",
    },
  };
}

export function closedKlineFromBinance(msg: unknown, _now?: number): IncomingKline | null {
  const classified = classifyBinanceMessage(msg);
  return classified.kind === "closed" ? classified.kline : null;
}

export async function persistEvent(
  url: string,
  key: string,
  event: {
    type:
      | "CANDLE_CLOSED"
      | "CANDLE_CONFLICT"
      | "SOURCE_CONNECTED"
      | "SOURCE_DISCONNECTED"
      | "WORKER_HEARTBEAT"
      | "SYSTEM_FAILURE";
    asset?: Asset;
    detail: string;
    payload?: Record<string, unknown>;
  },
): Promise<boolean> {
  const id = `evt:${event.type}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const res = await supabaseJson(url, key, "events", {
    method: "POST",
    body: JSON.stringify({
      id,
      asset: event.asset ?? null,
      type: event.type,
      actor: "system",
      detail: event.detail,
      engine_version: ENGINE_VERSION,
      payload: event.payload ?? {},
    }),
  });
  return res.ok;
}

export async function persistIncoming(
  url: string,
  key: string,
  kline: IncomingKline,
  _now: number,
): Promise<"inserted" | "unchanged" | "conflict" | "ignored" | "failed"> {
  const candle = incomingToCandle(kline);
  if (!candle) return "ignored";
  const asset = assetForBinanceSymbol(kline.symbol);
  if (!asset) return "ignored";
  if (asset === "GOLD" && VENUE_SYMBOLS.binance.GOLD.instrument !== ACTIVE_GOLD_SOURCE.instrument) return "ignored";
  const result = await ingestClosed(url, key, {
    venue: kline.venue,
    symbol: kline.symbol,
    timeframe: kline.timeframe,
    candle,
    asset,
  });
  if (result === "inserted") {
    await persistEvent(url, key, {
      type: "CANDLE_CLOSED",
      asset,
      detail: `${kline.venue}|${kline.symbol}|${kline.timeframe}|${kline.openTime}`,
      payload: { venue: kline.venue, symbol: kline.symbol, timeframe: kline.timeframe, openTime: kline.openTime },
    });
  } else if (result === "conflict") {
    await persistEvent(url, key, {
      type: "CANDLE_CONFLICT",
      asset,
      detail: `conflict ${kline.venue}|${kline.symbol}|${kline.timeframe}|${kline.openTime}`,
      payload: { venue: kline.venue, symbol: kline.symbol, timeframe: kline.timeframe, openTime: kline.openTime },
    });
  }
  return result;
}

function streamUrl(): string {
  const streams = (["btcusdt", "ethusdt", "paxgusdt"] as const).flatMap((s) =>
    TIMEFRAMES.map((tf) => `${s}@kline_${tf}`),
  );
  return `${BINANCE_WS}?streams=${streams.join("/")}`;
}

export type ObserverReport = {
  ok: boolean;
  mode: "once" | "loop";
  lease: string;
  backfill: IngestCounts;
  gold: { instrument: string; marketClass: string };
  workerStatus: WorkerLiveStatus;
};

export async function runObserverOnce(): Promise<ObserverReport> {
  const ready = assertModelCInfrastructureReady(envMap());
  if (ready.engineVersion !== ENGINE_VERSION || ready.contractVersion !== CONTRACT_VERSION) {
    throw new Error("worker version mismatch");
  }
  const url = ready.url;
  const key = envMap().AWURU_SUPABASE_SERVICE_ROLE_KEY!.trim();
  const lease = await acquireLease(url, key);
  if (!lease.ok) {
    return {
      ok: false,
      mode: "once",
      lease: lease.reason,
      backfill: { inserted: 0, unchanged: 0, conflict: 0, ignored: 0, failed: 0 },
      gold: { instrument: ACTIVE_GOLD_SOURCE.instrument, marketClass: ACTIVE_GOLD_SOURCE.marketClass },
      workerStatus: "stopped",
    };
  }
  const now = Date.now();
  let backfill: IngestCounts;
  try {
    backfill = await backfillPrimary(url, key, now);
    await corroborateLatest(url, key, now);
    await persistEvent(url, key, { type: "WORKER_HEARTBEAT", detail: "observer once complete" });
    await writeHealth(url, key, {
      worker_status: "observing",
      worker_heartbeat: new Date().toISOString(),
      last_valid_market_event: new Date().toISOString(),
      database_status: "connected",
      feed_status: {
        owner: ownerId(),
        primary: "binance",
        corroboration: ["kraken", "okx"],
        gold: ACTIVE_GOLD_SOURCE.id,
        vision: BINANCE_VISION,
        lastBackfill: backfill,
      },
      note: "Stage 2 REST reconciliation complete. Render.com not provisioned.",
    });
  } catch (err) {
    await writeHealth(url, key, {
      worker_status: "degraded",
      worker_heartbeat: new Date().toISOString(),
      database_status: "connected",
      note: err instanceof Error ? err.message.slice(0, 200) : "backfill failed",
    });
    throw err;
  }
  return {
    ok: backfill.failed === 0 && backfill.inserted + backfill.unchanged > 0,
    mode: "once",
    lease: lease.reason,
    backfill,
    gold: { instrument: ACTIVE_GOLD_SOURCE.instrument, marketClass: ACTIVE_GOLD_SOURCE.marketClass },
    workerStatus: "observing",
  };
}

export async function runObserverLoop(signal?: AbortSignal): Promise<void> {
  const report = await runObserverOnce();
  if (!report.ok) throw new Error(`observer once failed: ${report.lease}`);
  const ready = assertModelCInfrastructureReady(envMap());
  const url = ready.url;
  const key = envMap().AWURU_SUPABASE_SERVICE_ROLE_KEY!.trim();

  let ws: WebSocket | null = null;
  let reconnects = 0;

  const heartbeat = setInterval(() => {
    void writeHealth(url, key, { worker_heartbeat: new Date().toISOString() });
  }, HEARTBEAT_MS);

  const connect = () => {
    if (signal?.aborted) return;
    ws = new WebSocket(streamUrl());
    ws.addEventListener("open", () => {
      reconnects = 0;
      void persistEvent(url, key, { type: "SOURCE_CONNECTED", detail: "binance combined kline stream" });
      void writeHealth(url, key, { worker_status: "observing", worker_heartbeat: new Date().toISOString() });
    });
    ws.addEventListener("message", (ev) => {
      const now = Date.now();
      try {
        const payload = JSON.parse(String(ev.data)) as unknown;
        const kline = closedKlineFromBinance(payload, now);
        if (!kline) return;
        void persistIncoming(url, key, kline, now).then((result) => {
          if (result === "inserted" || result === "unchanged" || result === "conflict") {
            void writeHealth(url, key, {
              last_valid_market_event: new Date(now).toISOString(),
              last_closed_candle: {
                venue: kline.venue,
                symbol: kline.symbol,
                timeframe: kline.timeframe,
                openTime: kline.openTime,
                result,
              },
            });
          }
        });
      } catch {
        /* ignore malformed */
      }
    });
    ws.addEventListener("close", () => {
      if (signal?.aborted) return;
      reconnects += 1;
      void persistEvent(url, key, { type: "SOURCE_DISCONNECTED", detail: `reconnect ${reconnects}` });
      void writeHealth(url, key, { worker_status: "reconnecting" });
      void backfillPrimary(url, key, Date.now());
      setTimeout(connect, Math.min(15_000, 1000 * 2 ** reconnects));
    });
    ws.addEventListener("error", () => {
      try {
        ws?.close();
      } catch {
        /* */
      }
    });
  };

  connect();
  await new Promise<void>((resolve) => {
    const stop = () => {
      clearInterval(heartbeat);
      try {
        ws?.close();
      } catch {
        /* */
      }
      void writeHealth(url, key, { worker_status: "stopped", worker_heartbeat: new Date().toISOString() });
      resolve();
    };
    if (signal) {
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
    }
  });
}

export type RecoveryReport = {
  ok: boolean;
  websocket: "connected" | "failed";
  formingIgnored: number;
  closedSeen: number;
  ignoredOther: number;
  gapFill: IngestCounts | null;
  render: "not_provisioned";
};

function openStream(url: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* */
      }
      reject(new Error("websocket timeout"));
    }, timeoutMs);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve(ws);
    });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      reject(new Error("websocket error"));
    });
  });
}

export async function proveWebsocketRecovery(waitMs = 12_000): Promise<RecoveryReport> {
  const ready = assertModelCInfrastructureReady(envMap());
  const url = ready.url;
  const key = envMap().AWURU_SUPABASE_SERVICE_ROLE_KEY!.trim();
  const report: RecoveryReport = {
    ok: false,
    websocket: "failed",
    formingIgnored: 0,
    closedSeen: 0,
    ignoredOther: 0,
    gapFill: null,
    render: "not_provisioned",
  };

  const endpoints = [streamUrl(), streamUrl().replace("stream.binance.com:9443", "data-stream.binance.vision")];
  let ws: WebSocket | null = null;
  for (const endpoint of endpoints) {
    try {
      ws = await openStream(endpoint, 8_000);
      break;
    } catch {
      ws = null;
    }
  }
  if (!ws) {
    await writeHealth(url, key, { worker_status: "degraded", note: "websocket connect failed during recovery proof" });
    return report;
  }

  report.websocket = "connected";
  await persistEvent(url, key, { type: "SOURCE_CONNECTED", detail: "binance combined kline stream" });
  await writeHealth(url, key, { worker_status: "observing", worker_heartbeat: new Date().toISOString() });

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, waitMs);
    ws!.addEventListener("message", (ev) => {
      try {
        const payload = JSON.parse(String(ev.data)) as unknown;
        const kind = classifyBinanceMessage(payload).kind;
        if (kind === "forming") report.formingIgnored += 1;
        else if (kind === "closed") report.closedSeen += 1;
        else report.ignoredOther += 1;
        if (report.formingIgnored >= 3) {
          clearTimeout(timer);
          resolve();
        }
      } catch {
        report.ignoredOther += 1;
      }
    });
  });

  try {
    ws.close();
  } catch {
    /* */
  }
  await persistEvent(url, key, { type: "SOURCE_DISCONNECTED", detail: "recovery proof closed the stream" });
  await writeHealth(url, key, { worker_status: "reconnecting", worker_heartbeat: new Date().toISOString() });
  report.gapFill = await backfillPrimary(url, key, Date.now());
  await writeHealth(url, key, {
    worker_status: "observing",
    worker_heartbeat: new Date().toISOString(),
    note: "Stage 2 recovery proof complete. Render.com not provisioned.",
  });
  report.ok = report.websocket === "connected" && report.formingIgnored > 0 && report.gapFill.failed === 0;
  return report;
}

export async function proveLeaseRefusal(): Promise<{
  first: { ok: boolean; reason: string };
  second: { ok: boolean; reason: string };
}> {
  const ready = assertModelCInfrastructureReady(envMap());
  const url = ready.url;
  const key = envMap().AWURU_SUPABASE_SERVICE_ROLE_KEY!.trim();
  await writeHealth(url, key, {
    worker_heartbeat: new Date().toISOString(),
    feed_status: { owner: "staging-observer-hold", pid: 0, acquiredAt: Date.now() },
    worker_status: "observing",
  });
  const second = await acquireLease(url, key);
  return { first: { ok: true, reason: "hold_planted" }, second };
}
