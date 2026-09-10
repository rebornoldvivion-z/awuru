import {
  DEFAULT_ACCOUNT_ID,
  ENGINE_VERSION,
  LOOKBACK,
  PERSONA_POLICY,
  PRIMARY_TF,
  TIMEFRAMES,
  type Asset,
  type Persona,
} from "../domain/constants.ts";
import type { Decision, MtfBundle, Profile, Quality, RiskDay } from "../domain/types.ts";
import { lastClosed } from "../market/candles.ts";
import { evaluateFamilies, disagreement, htfBiasFrom, pickPrimary } from "./families.ts";
import { geometryFromBars } from "./geometry.ts";
import { signalId } from "./ids.ts";
import { snapshot } from "./indicators.ts";
import { assessSeries, combineQuality, releaseAllowed, waitCodeForQuality } from "../market/quality.ts";
import { checkRisk, goalConstraint } from "../risk/risk.ts";
import { sizePosition } from "../risk/sizing.ts";

function waitDecision(
  partial: Omit<Decision, "kind" | "engineVersion"> & { kind?: Decision["kind"] },
): Decision {
  return {
    ...partial,
    kind: "WAIT",
    engineVersion: ENGINE_VERSION,
  };
}

function emptyHtf() {
  return { h1Bias: "neutral" as const, h4Bias: "neutral" as const, h1ClosedOpen: null, h4ClosedOpen: null };
}

function qualityDecision(
  quality: Quality,
  args: { asset: Asset; persona: Persona; accountId: string; now: number },
): Decision {
  const code = waitCodeForQuality(quality.state);
  return waitDecision({
    kind: "WAIT",
    waitCode: code,
    waitDetail: quality.reason,
    signalId: null,
    accountId: args.accountId,
    asset: args.asset,
    venue: quality.venue,
    symbol: null,
    quote: null,
    timeframe: PRIMARY_TF,
    barOpen: quality.lastClosedOpen,
    direction: null,
    family: null,
    families: [],
    geometry: null,
    size: null,
    persona: args.persona,
    quality,
    htf: emptyHtf(),
    evidenceGrade: null,
    decidedAt: args.now,
  });
}

export function decide(args: {
  bundle: MtfBundle | null;
  qualityOverride?: Quality;
  profile: Profile;
  riskDay: RiskDay;
  now: number;
  accountId?: string;
}): Decision {
  const accountId = args.accountId ?? DEFAULT_ACCOUNT_ID;
  const persona = args.profile.persona;
  const now = args.now;

  if (!args.bundle) {
    const quality: Quality = args.qualityOverride ?? {
      state: "UNAVAILABLE",
      venue: null,
      reason: "all venues failed",
      lastClosedOpen: null,
      ageMs: null,
      now,
    };
    return qualityDecision(quality, { asset: "BTC", persona, accountId, now });
  }

  const bundle = args.bundle;
  for (const tf of TIMEFRAMES) {
    const series = bundle.series[tf];
    if (!series || series.venue !== bundle.venue) {
      return qualityDecision(
        {
          state: "INVALID",
          venue: bundle.venue,
          reason: "mixed-venue MTF is forbidden",
          lastClosedOpen: null,
          ageMs: null,
          now,
        },
        { asset: bundle.asset, persona, accountId, now },
      );
    }
  }
  const parts = TIMEFRAMES.map((tf) => {
    const series = bundle.series[tf];
    const assessed = assessSeries(series, now, LOOKBACK[tf]);
    return { tf, ...assessed };
  });
  const quality = combineQuality(parts, bundle.venue, now, bundle.switched);

  const base = {
    accountId,
    asset: bundle.asset,
    venue: bundle.venue,
    symbol: bundle.symbol,
    quote: bundle.quote,
    timeframe: PRIMARY_TF,
    persona,
    quality,
    decidedAt: now,
  };

  if (!releaseAllowed(quality.state)) {
    return qualityDecision(quality, { asset: bundle.asset, persona, accountId, now });
  }

  const s15 = bundle.series["15m"];
  const s1h = bundle.series["1h"];
  const s4h = bundle.series["4h"];
  const last15 = lastClosed(s15.candles);
  const last1h = lastClosed(s1h.candles);
  const last4h = lastClosed(s4h.candles);
  if (!last15 || !last1h || !last4h) {
    return qualityDecision(
      { ...quality, state: "PARTIAL", reason: "missing last closed MTF bar" },
      { asset: bundle.asset, persona, accountId, now },
    );
  }

  const ind15 = snapshot(s15.candles);
  const ind1h = snapshot(s1h.candles);
  const ind4h = snapshot(s4h.candles);
  if (!ind15) {
    return waitDecision({
      ...base,
      waitCode: "WAIT_DATA",
      waitDetail: "15m indicators not ready",
      signalId: null,
      barOpen: last15.openTime,
      direction: null,
      family: null,
      families: [],
      geometry: null,
      size: null,
      htf: emptyHtf(),
      evidenceGrade: null,
    });
  }

  const h1Bias = htfBiasFrom(ind1h, last1h);
  const h4Bias = htfBiasFrom(ind4h, last4h);
  const htf = {
    h1Bias,
    h4Bias,
    h1ClosedOpen: last1h.openTime,
    h4ClosedOpen: last4h.openTime,
  };

  const families = evaluateFamilies(s15.candles, last15, ind15, h1Bias, h4Bias);

  if (disagreement(families)) {
    return waitDecision({
      ...base,
      waitCode: "WAIT_DISAGREEMENT",
      waitDetail: "families eligible in opposite directions",
      signalId: null,
      barOpen: last15.openTime,
      direction: null,
      family: null,
      families,
      geometry: null,
      size: null,
      htf,
      evidenceGrade: null,
    });
  }

  const primary = pickPrimary(families);
  if (!primary || !primary.direction) {
    return waitDecision({
      ...base,
      waitCode: "WAIT_REGIME",
      waitDetail: "no family is eligible on closed 15m",
      signalId: null,
      barOpen: last15.openTime,
      direction: null,
      family: null,
      families,
      geometry: null,
      size: null,
      htf,
      evidenceGrade: null,
    });
  }

  const dir = primary.direction;
  if (h4Bias !== "neutral" && h4Bias !== dir) {
    return waitDecision({
      ...base,
      waitCode: "WAIT_HTF",
      waitDetail: `4h bias ${h4Bias} opposes ${dir} (4h closed ${new Date(last4h.openTime).toISOString()})`,
      signalId: null,
      barOpen: last15.openTime,
      direction: dir,
      family: primary.family,
      families,
      geometry: null,
      size: null,
      htf,
      evidenceGrade: primary.grade,
    });
  }
  if (h1Bias !== "neutral" && h1Bias !== dir) {
    return waitDecision({
      ...base,
      waitCode: "WAIT_HTF",
      waitDetail: `1h bias ${h1Bias} opposes ${dir} (1h closed ${new Date(last1h.openTime).toISOString()})`,
      signalId: null,
      barOpen: last15.openTime,
      direction: dir,
      family: primary.family,
      families,
      geometry: null,
      size: null,
      htf,
      evidenceGrade: primary.grade,
    });
  }

  const geo = geometryFromBars({
    direction: dir,
    candles: s15.candles,
    last: last15,
    ind: ind15,
    filters: bundle.filters,
    timeframe: PRIMARY_TF,
  });
  if ("error" in geo) {
    return waitDecision({
      ...base,
      waitCode: "WAIT_GEOMETRY",
      waitDetail: geo.error,
      signalId: null,
      barOpen: last15.openTime,
      direction: dir,
      family: primary.family,
      families,
      geometry: null,
      size: null,
      htf,
      evidenceGrade: primary.grade,
    });
  }

  const policy = PERSONA_POLICY[persona];
  const goal = goalConstraint({
    equity: args.profile.equity,
    target: args.profile.goalTarget,
    deadline: args.profile.goalDeadline,
    nowMs: now,
    evidence: primary.grade,
    riskPct: policy.riskPct,
  });
  if (goal.wait) {
    return waitDecision({
      ...base,
      waitCode: goal.wait.code,
      waitDetail: goal.wait.detail,
      signalId: null,
      barOpen: last15.openTime,
      direction: dir,
      family: primary.family,
      families,
      geometry: geo,
      size: null,
      htf,
      evidenceGrade: primary.grade,
    });
  }

  const risk = checkRisk({
    persona,
    day: args.riskDay,
    evidence: goal.evidence,
    requiredR: 1,
  });
  if (!risk.ok) {
    return waitDecision({
      ...base,
      waitCode: risk.code,
      waitDetail: risk.detail,
      signalId: null,
      barOpen: last15.openTime,
      direction: dir,
      family: primary.family,
      families,
      geometry: geo,
      size: null,
      htf,
      evidenceGrade: primary.grade,
    });
  }

  const size = sizePosition({
    equity: args.profile.equity,
    riskPct: goal.riskPct,
    entry: geo.entry,
    stop: geo.stop,
    filters: bundle.filters,
  });
  if (!size.ok) {
    return waitDecision({
      ...base,
      waitCode: size.reason,
      waitDetail: size.detail,
      signalId: null,
      barOpen: last15.openTime,
      direction: dir,
      family: primary.family,
      families,
      geometry: geo,
      size,
      htf,
      evidenceGrade: primary.grade,
    });
  }

  const sid = signalId({
    accountId,
    venue: bundle.venue,
    symbol: bundle.symbol,
    timeframe: PRIMARY_TF,
    barOpen: last15.openTime,
    family: primary.family,
    persona,
  });

  return {
    kind: "RELEASE",
    waitCode: null,
    waitDetail: null,
    signalId: sid,
    accountId,
    asset: bundle.asset,
    venue: bundle.venue,
    symbol: bundle.symbol,
    quote: bundle.quote,
    timeframe: PRIMARY_TF,
    barOpen: last15.openTime,
    direction: dir,
    family: primary.family,
    families,
    geometry: { ...geo, entry: size.entry, stop: size.stop },
    size,
    persona,
    quality,
    htf,
    evidenceGrade: primary.grade,
    engineVersion: ENGINE_VERSION,
    decidedAt: now,
  };
}


