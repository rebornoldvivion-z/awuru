import { ENGINE_VERSION } from "../domain/constants.ts";
import type {
  Corroboration,
  Decision,
  MtfBundle,
  Profile,
  RiskDay,
  SourceSnap,
} from "../domain/types.ts";

/** Architecture contract. Not an engine-math version. */
export const CONTRACT_VERSION = "c-1";
export const DATA_CONTRACT_VERSION = "tape-1";
export const GEOMETRY_VERSION = "g-7.3.0";
export const SOURCE_SET = "binance+kraken+okx";

export type CanonicalInput = {
  bundle: MtfBundle | null;
  corroboration: Corroboration | null;
  profile: Pick<Profile, "persona" | "equity" | "goalTarget" | "goalDeadline">;
  riskDay: RiskDay;
  now: number;
};

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function stable(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(obj).sort()) {
      const v = obj[k];
      if (v === undefined) continue;
      out[k] = stable(v);
    }
    return out;
  }
  return String(value);
}

function snapsForHash(snaps: SourceSnap[]): Json {
  return [...snaps]
    .sort((a, b) => a.venue.localeCompare(b.venue))
    .map((s) =>
      stable({
        venue: s.venue,
        ok: s.ok,
        lastClosedOpen: s.lastClosedOpen,
        lastClose: s.lastClose,
      }),
    );
}

function seriesForHash(bundle: MtfBundle): Json {
  const tfs = Object.keys(bundle.series).sort();
  const out: { [k: string]: Json } = {};
  for (const tf of tfs) {
    const s = bundle.series[tf as keyof typeof bundle.series];
    if (!s) continue;
    out[tf] = stable({
      venue: s.venue,
      symbol: s.symbol,
      timeframe: s.timeframe,
      instrument: s.instrument,
      marketClass: s.marketClass,
      asset: s.asset,
      candles: s.candles.map((c) => ({
        openTime: c.openTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        confirm: c.confirm ?? null,
      })),
    });
  }
  return out;
}

/** Deterministic JSON of the exact decide() inputs. Forming/live bars are excluded. */
export function canonicalPayload(input: CanonicalInput): string {
  const bundle = input.bundle;
  const body = stable({
    engineVersion: ENGINE_VERSION,
    contractVersion: CONTRACT_VERSION,
    dataContractVersion: DATA_CONTRACT_VERSION,
    geometryVersion: GEOMETRY_VERSION,
    sourceSet: SOURCE_SET,
    now: input.now,
    profile: {
      persona: input.profile.persona,
      equity: input.profile.equity,
      goalTarget: input.profile.goalTarget,
      goalDeadline: input.profile.goalDeadline,
    },
    riskDay: {
      day: input.riskDay.day,
      realizedR: input.riskDay.realizedR,
      openR: input.riskDay.openR,
      trades: input.riskDay.trades,
      consecutiveLosses: input.riskDay.consecutiveLosses,
    },
    corroboration: input.corroboration
      ? {
          status: input.corroboration.status,
          primary: input.corroboration.primary,
          spreadPct: input.corroboration.spreadPct,
          timestampDeltaMs: input.corroboration.timestampDeltaMs,
          snaps: snapsForHash(input.corroboration.snaps),
        }
      : null,
    bundle: bundle
      ? {
          venue: bundle.venue,
          asset: bundle.asset,
          symbol: bundle.symbol,
          quote: bundle.quote,
          instrument: bundle.instrument,
          marketClass: bundle.marketClass,
          switched: bundle.switched,
          filters: {
            tickSize: bundle.filters.tickSize,
            qtyStep: bundle.filters.qtyStep,
            minQty: bundle.filters.minQty,
            minNotional: bundle.filters.minNotional,
            tradable: bundle.filters.tradable,
          },
          series: seriesForHash(bundle),
        }
      : null,
  });
  return JSON.stringify(body);
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function inputHash(input: CanonicalInput): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPayload(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hex(digest);
}

export async function decisionHash(d: Decision | ParitySlice): Promise<string> {
  const slice = "researchQualification" in d && !("researchStatus" in d) ? d : paritySlice(d as Decision);
  const bytes = new TextEncoder().encode(JSON.stringify(stable(slice)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hex(digest);
}

export type ParitySlice = {
  engineVersion: string;
  userDecision: Decision["userDecision"];
  waitCode: Decision["waitCode"];
  lifecycle: Decision["lifecycle"];
  family: Decision["family"];
  researchQualification: Decision["researchStatus"]["qualification"];
  regimeKind: string | null;
  structureRead: string | null;
  direction: Decision["direction"];
};

export function paritySlice(d: Decision): ParitySlice {
  return {
    engineVersion: d.engineVersion,
    userDecision: d.userDecision,
    waitCode: d.waitCode,
    lifecycle: d.lifecycle,
    family: d.family,
    researchQualification: d.researchStatus.qualification,
    regimeKind: d.regime?.kind ?? null,
    structureRead: d.structure?.read ?? null,
    direction: d.direction,
  };
}

export function parityDiff(a: ParitySlice, b: ParitySlice): string[] {
  const diffs: string[] = [];
  for (const k of Object.keys(a) as (keyof ParitySlice)[]) {
    if (a[k] !== b[k]) diffs.push(`${k}: ${String(a[k])} ≠ ${String(b[k])}`);
  }
  return diffs;
}
