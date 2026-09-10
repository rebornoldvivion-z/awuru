import {
  DEFAULT_ACCOUNT_ID,
  ENGINE_VERSION,
  LOOKBACK,
  PERSONA_POLICY,
  PRIMARY_TF,
  TIMEFRAMES,
  type Asset,
  type Persona,
  type UserDecision,
} from "../domain/constants.ts";
import type {
  Candidate,
  Corroboration,
  Decision,
  Direction,
  Geometry,
  MtfBundle,
  Profile,
  Quality,
  RiskDay,
  TfContext,
} from "../domain/types.ts";
import { lastClosed } from "../market/candles.ts";
import { disagreement, evaluateFamilies, htfBiasFrom, pickPrimary } from "./families.ts";
import { geometryFromBars } from "./geometry.ts";
import { signalId } from "./ids.ts";
import { snapshot, priorDonchian } from "./indicators.ts";
import { assessSeries, combineQuality, releaseAllowed, waitCodeForQuality } from "../market/quality.ts";
import { checkRisk, goalConstraint } from "../risk/risk.ts";
import { sizePosition } from "../risk/sizing.ts";
import { readStructure } from "./structure.ts";
import { classifyRegime } from "./regime.ts";
import { buildCandidates, pickSlots } from "./candidates.ts";
import { isActionableFamily, quarantinedEligible, researchStatusFor } from "./honesty.ts";

const intel = {
  userDecision: "WAIT" as UserDecision,
  candidates: [] as Candidate[],
  best: null as Candidate | null,
  secondary: null as Candidate | null,
  watch: null as Candidate | null,
  regime: null as Decision["regime"],
  structure: null as Decision["structure"],
  htfStance: { h1: "NEUTRAL" as const, h4: "NEUTRAL" as const },
  corroboration: null as Corroboration | null,
  thesis: null as Decision["thesis"],
  thesisChange: null as Decision["thesisChange"],
  lifecycle: "OBSERVING" as Decision["lifecycle"],
  trigger: null as string | null,
  invalidation: null as string | null,
  blockedByRisk: false,
  whyNow: null as string | null,
  whyNot: null as string | null,
  researchStatus: researchStatusFor(null),
};

function waitDecision(partial: Partial<Decision>): Decision {
  return {
    waitCode: null,
    waitDetail: null,
    signalId: null,
    accountId: DEFAULT_ACCOUNT_ID,
    asset: "BTC",
    venue: null,
    symbol: null,
    quote: null,
    instrument: null,
    marketClass: null,
    timeframe: PRIMARY_TF,
    barOpen: null,
    direction: null,
    family: null,
    families: [],
    geometry: null,
    size: null,
    persona: "Orion",
    quality: { state: "UNAVAILABLE", venue: null, reason: "", lastClosedOpen: null, ageMs: null, now: 0 },
    htf: emptyHtf(),
    evidenceGrade: null,
    decidedAt: 0,
    ...intel,
    ...partial,
    kind: "WAIT",
    engineVersion: ENGINE_VERSION,
  };
}

function emptyHtf() {
  return {
    h1Bias: "neutral" as const,
    h4Bias: "neutral" as const,
    h1ClosedOpen: null as number | null,
    h4ClosedOpen: null as number | null,
    h1: null,
    h4: null,
  };
}

function qualityDecision(
  quality: Quality,
  args: { asset: Asset; persona: Persona; accountId: string; now: number; corroboration?: Corroboration | null },
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
    instrument: null,
    marketClass: null,
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
    userDecision: "WAIT",
    corroboration: args.corroboration ?? null,
    lifecycle: "OBSERVING",
  });
}

function userOf(kind: Decision["kind"], direction: Direction | null, watch: Candidate | null, best: Candidate | null): UserDecision {
  if (kind === "RELEASE" && direction === "long") return "BUY";
  if (kind === "RELEASE" && direction === "short") return "SELL";
  const c = watch ?? best;
  if (c && (c.state === "WATCH" || c.state === "TRIGGERED" || c.state === "FORMING" || c.state === "QUALIFIED")) return "WATCH";
  return "WAIT";
}

export function decide(args: {
  bundle: MtfBundle | null;
  qualityOverride?: Quality;
  profile: Profile;
  riskDay: RiskDay;
  now: number;
  accountId?: string;
  corroboration?: Corroboration | null;
}): Decision {
  const accountId = args.accountId ?? DEFAULT_ACCOUNT_ID;
  const persona = args.profile.persona;
  const now = args.now;
  const corroboration = args.corroboration ?? null;

  if (!args.bundle) {
    const quality: Quality = args.qualityOverride ?? {
      state: "UNAVAILABLE",
      venue: null,
      reason: "all venues failed",
      lastClosedOpen: null,
      ageMs: null,
      now,
    };
    return qualityDecision(quality, { asset: "BTC", persona, accountId, now, corroboration });
  }

  const bundle = args.bundle;
  for (const tf of TIMEFRAMES) {
    const series = bundle.series[tf];
    if (!series || series.venue !== bundle.venue || series.instrument !== bundle.instrument) {
      return qualityDecision(
        {
          state: "INVALID",
          venue: bundle.venue,
          reason: "mixed-venue MTF is forbidden",
          lastClosedOpen: null,
          ageMs: null,
          now,
        },
        { asset: bundle.asset, persona, accountId, now, corroboration },
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
    instrument: bundle.instrument,
    marketClass: bundle.marketClass,
    timeframe: PRIMARY_TF,
    persona,
    quality,
    decidedAt: now,
    corroboration,
  };

  if (!releaseAllowed(quality.state)) {
    return qualityDecision(quality, { asset: bundle.asset, persona, accountId, now, corroboration });
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
      { asset: bundle.asset, persona, accountId, now, corroboration },
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
      userDecision: "WAIT",
    });
  }

  const prior = priorDonchian(s15.candles);
  const structure = readStructure(s15.candles, prior);
  const regime = classifyRegime(last15, ind15, s15.candles, structure);
  const st1 = readStructure(s1h.candles);
  const st4 = readStructure(s4h.candles);
  const rg1 = last1h && ind1h ? classifyRegime(last1h, ind1h, s1h.candles, st1) : null;
  const rg4 = last4h && ind4h ? classifyRegime(last4h, ind4h, s4h.candles, st4) : null;
  const h1Bias = htfBiasFrom(ind1h, last1h);
  const h4Bias = htfBiasFrom(ind4h, last4h);
  const h1ctx: TfContext | null =
    ind1h && rg1
      ? { bias: h1Bias, adx: ind1h.adx, structureRead: st1.read, regime: rg1.kind, role: "continuation context" }
      : null;
  const h4ctx: TfContext | null =
    ind4h && rg4
      ? { bias: h4Bias, adx: ind4h.adx, structureRead: st4.read, regime: rg4.kind, role: "higher-timeframe structure" }
      : null;
  const htf = {
    h1Bias,
    h4Bias,
    h1ClosedOpen: last1h.openTime,
    h4ClosedOpen: last4h.openTime,
    h1: h1ctx,
    h4: h4ctx,
  };

  const families = evaluateFamilies(s15.candles, last15, ind15, h1Bias, h4Bias, structure, regime);
  const geoFn = (direction: Direction, inv: number | null): Geometry | null => {
    if (inv == null) return null;
    const g = geometryFromBars({
      direction,
      candles: s15.candles,
      last: last15,
      ind: ind15,
      filters: bundle.filters,
      timeframe: PRIMARY_TF,
      structure,
      invalidatorPrice: inv,
    });
    return "error" in g ? null : g;
  };
  const candidates = buildCandidates(families, h1Bias, h4Bias, regime, geoFn);
  const slots = pickSlots(candidates);
  const intelPack = {
    candidates,
    best: slots.best,
    secondary: slots.secondary,
    watch: slots.watch,
    regime,
    structure,
    htfStance: {
      h1: slots.best ? slots.best.h1 : ("NEUTRAL" as const),
      h4: slots.best ? slots.best.h4 : ("NEUTRAL" as const),
    },
  };

  const finishWait = (extra: Partial<Decision> & { waitCode: Decision["waitCode"]; waitDetail: string }): Decision => {
    const direction = extra.direction ?? slots.best?.direction ?? null;
    const watch = slots.watch ?? (slots.best && slots.best.state !== "RELEASED" ? slots.best : null);
    const d = waitDecision({
      ...base,
      ...intelPack,
      signalId: null,
      barOpen: last15.openTime,
      direction,
      family: extra.family ?? slots.best?.family ?? null,
      families,
      geometry: extra.geometry ?? slots.best?.geometry ?? null,
      size: extra.size ?? null,
      htf,
      evidenceGrade: extra.evidenceGrade ?? slots.best?.grade ?? null,
      waitCode: extra.waitCode,
      waitDetail: extra.waitDetail,
      lifecycle: extra.lifecycle ?? watch?.state ?? "OBSERVING",
      trigger: watch?.trigger ?? slots.best?.trigger ?? extra.trigger ?? null,
      invalidation: watch?.invalidation ?? slots.best?.invalidation ?? extra.invalidation ?? null,
      userDecision: "WAIT",
      blockedByRisk: extra.blockedByRisk ?? false,
      whyNow: extra.whyNow ?? watch?.whyNow ?? slots.best?.whyNow ?? null,
      whyNot: extra.whyNot ?? extra.waitDetail ?? watch?.whyNot ?? slots.best?.whyNot ?? null,
    });
    d.userDecision = userOf("WAIT", d.direction, d.watch, d.best);
    d.researchStatus = researchStatusFor(d.family);
    if (extra.waitCode === "WAIT_QUARANTINE") {
      d.userDecision = "WAIT";
      d.researchStatus = researchStatusFor(extra.family ?? d.family);
    }
    if (d.lifecycle === "TRIGGERED" && d.userDecision === "WATCH") d.lifecycle = "QUALIFIED";
    return d;
  };

  if (corroboration?.status === "SOURCE_DIVERGENCE") {
    return finishWait({
      waitCode: "WAIT_DIVERGENCE",
      waitDetail: corroboration.reason,
    });
  }

  if (disagreement(families)) {
    return finishWait({
      waitCode: "WAIT_DISAGREEMENT",
      waitDetail: "families eligible in opposite directions — both kept as candidates, none released",
    });
  }

  const primary = pickPrimary(families) ?? (slots.best && isActionableFamily(slots.best.family) ? slots.best : null);
  if (!primary || !("family" in primary) || !primary.direction) {
    const q = quarantinedEligible(families);
    if (q) {
      return finishWait({
        waitCode: "WAIT_QUARANTINE",
        waitDetail: researchStatusFor(q.family).note,
        direction: q.direction,
        family: q.family,
        evidenceGrade: q.grade,
      });
    }
    return finishWait({
      waitCode: "WAIT_REGIME",
      waitDetail: `regime ${regime.kind}. ${regime.reasons[0] ?? "no family eligible on closed 15m"}`,
    });
  }

  const dir = primary.direction;
  const cand = candidates.find((c) => c.family === primary.family && c.direction === dir) ?? slots.best;

  if (cand && cand.h4 === "OPPOSING") {
    return finishWait({
      waitCode: "WAIT_HTF",
      waitDetail: `4h ${h4Bias} opposes ${dir}. Candidate kept as WATCH. Invalid if: ${cand.invalidation}`,
      direction: dir,
      family: cand.family,
      evidenceGrade: cand.grade,
    });
  }
  if (cand && cand.h1 === "OPPOSING") {
    return finishWait({
      waitCode: "WAIT_HTF",
      waitDetail: `1h ${h1Bias} opposes ${dir}. Waiting for 1h alignment. Invalid if: ${cand.invalidation}`,
      direction: dir,
      family: cand.family,
      evidenceGrade: cand.grade,
    });
  }

  if (cand && cand.state !== "TRIGGERED") {
    return finishWait({
      waitCode: "WAIT_TRIGGER",
      waitDetail: `${cand.family} ${dir} is ${cand.state}. Trigger: ${cand.trigger}. ${cand.blockers[0] ?? ""}`.trim(),
      direction: dir,
      family: cand.family,
      evidenceGrade: cand.grade,
    });
  }

  const geo = geometryFromBars({
    direction: dir,
    candles: s15.candles,
    last: last15,
    ind: ind15,
    filters: bundle.filters,
    timeframe: PRIMARY_TF,
    structure,
    invalidatorPrice: cand?.invalidatorPrice ?? 0,
  });
  if (!cand?.invalidatorPrice || "error" in geo) {
    const geoErr = "error" in geo ? geo.error : "no invalidator price — stop cannot be derived from thesis";
    return finishWait({
      waitCode: "WAIT_GEOMETRY",
      waitDetail: !cand?.invalidatorPrice ? "no invalidator price — stop cannot be derived from thesis" : geoErr,
      direction: dir,
      family: primary.family,
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
    return finishWait({
      waitCode: goal.wait.code,
      waitDetail: goal.wait.detail,
      direction: dir,
      family: primary.family,
      geometry: geo,
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
    return finishWait({
      waitCode: risk.code,
      waitDetail: `VALID SETUP — BLOCKED BY RISK. ${risk.detail}`,
      direction: dir,
      family: primary.family,
      geometry: geo,
      evidenceGrade: primary.grade,
      blockedByRisk: true,
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
    return finishWait({
      waitCode: size.reason,
      waitDetail: `VALID SETUP — BLOCKED BY SIZE. ${size.detail}`,
      direction: dir,
      family: primary.family,
      geometry: geo,
      size,
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

  const released: Decision = {
    kind: "RELEASE",
    waitCode: null,
    waitDetail: null,
    signalId: sid,
    accountId,
    asset: bundle.asset,
    venue: bundle.venue,
    symbol: bundle.symbol,
    quote: bundle.quote,
    instrument: bundle.instrument,
    marketClass: bundle.marketClass,
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
    ...intelPack,
    corroboration,
    thesis: null,
    thesisChange: null,
    trigger: cand?.trigger ?? "closed trigger held",
    invalidation: cand?.invalidation ?? null,
    blockedByRisk: false,
    userDecision: dir === "long" ? "BUY" : "SELL",
    best: cand ? { ...cand, state: "RELEASED", geometry: geo } : slots.best,
    whyNow: cand?.whyNow || cand?.reasons[0] || "closed continuation trigger held",
    whyNot: null,
    researchStatus: researchStatusFor("trend"),
    lifecycle: "CANDIDATE",
  };
  return released;
}
