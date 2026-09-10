import type {
  Asset,
  DecisionKind,
  EvidenceGrade,
  Family,
  MarketClass,
  Persona,
  QualityState,
  Timeframe,
  Venue,
  WaitCode,
} from "./constants.ts";

export type Direction = "long" | "short";

export type Candle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  confirm?: "0" | "1";
};

export type SeriesId = {
  venue: Venue;
  symbol: string;
  quote: string;
  timeframe: Timeframe;
  instrument: string;
  marketClass: MarketClass;
  asset: Asset;
};

export type Series = SeriesId & {
  candles: Candle[];
  live: Candle | null;
};

export type InstrumentFilters = {
  venue: Venue;
  symbol: string;
  base: string;
  quote: string;
  tickSize: number;
  qtyStep: number;
  minQty: number;
  minNotional: number | null;
  status: string;
  tradable: boolean;
  instrument: string;
  marketClass: MarketClass;
};

export type Quality = {
  state: QualityState;
  venue: Venue | null;
  reason: string;
  lastClosedOpen: number | null;
  ageMs: number | null;
  now: number;
};

export type FamilyEvidence = {
  family: Family;
  eligible: boolean;
  direction: Direction | null;
  grade: EvidenceGrade;
  score: number;
  reasons: string[];
  invalidation: string | null;
  whyNow: string;
  whyNot: string;
};

export type Geometry = {
  direction: Direction;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number | null;
  tp3: number | null;
  targetCount: 1 | 2 | 3;
  riskPerUnit: number;
  rr: number;
  expiry: number;
  invalidatorPrice: number;
  stopSource: string;
  tp1Source: string;
};

export type SizeResult =
  | {
      ok: true;
      qty: number;
      riskCash: number;
      notional: number;
      entry: number;
      stop: number;
    }
  | { ok: false; reason: WaitCode; detail: string };

export type RiskDay = {
  day: string;
  realizedR: number;
  openR: number;
  trades: number;
  consecutiveLosses: number;
};

export type Decision = {
  kind: DecisionKind;
  waitCode: WaitCode | null;
  waitDetail: string | null;
  signalId: string | null;
  accountId: string;
  asset: Asset;
  venue: Venue | null;
  symbol: string | null;
  quote: string | null;
  instrument: string | null;
  marketClass: import("./constants.ts").MarketClass | null;
  timeframe: Timeframe;
  barOpen: number | null;
  direction: Direction | null;
  family: Family | null;
  families: FamilyEvidence[];
  geometry: Geometry | null;
  size: SizeResult | null;
  persona: Persona;
  quality: Quality;
  htf: {
    h1Bias: Direction | "neutral";
    h4Bias: Direction | "neutral";
    h1ClosedOpen: number | null;
    h4ClosedOpen: number | null;
    h1: TfContext | null;
    h4: TfContext | null;
  };
  evidenceGrade: EvidenceGrade | null;
  engineVersion: string;
  decidedAt: number;
  userDecision: import("./constants.ts").UserDecision;
  candidates: Candidate[];
  best: Candidate | null;
  secondary: Candidate | null;
  watch: Candidate | null;
  regime: Regime | null;
  structure: Structure | null;
  htfStance: { h1: import("./constants.ts").HtfStance; h4: import("./constants.ts").HtfStance };
  corroboration: Corroboration | null;
  thesis: Thesis | null;
  thesisChange: import("./constants.ts").ThesisChange | null;
  lifecycle: import("./constants.ts").LifecycleState;
  trigger: string | null;
  invalidation: string | null;
  blockedByRisk: boolean;
  whyNow: string | null;
  whyNot: string | null;
};

export type StoredSignal = {
  signalId: string;
  decision: Decision;
  createdAt: number;
};

export type MissionStatus =
  | "open"
  | "tp1"
  | "tp2"
  | "tp3"
  | "sl"
  | "expired"
  | "cancelled";

export type Mission = {
  id: string;
  signalId: string;
  accountId: string;
  venue: Venue;
  symbol: string;
  timeframe: Timeframe;
  direction: Direction;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  qty: number;
  riskCash: number;
  status: MissionStatus;
  confirmedAt: number;
  closedAt: number | null;
  realizedR: number | null;
  note: string;
  engineVersion: string;
  barOpen: number;
  expiry: number;
};

export type ShadowStatus = "open" | "tp1" | "tp2" | "tp3" | "sl" | "expired" | "unscorable";

export type Shadow = {
  id: string;
  signalId: string;
  accountId: string;
  venue: Venue;
  symbol: string;
  timeframe: Timeframe;
  barOpen: number;
  direction: Direction;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  family: Family;
  evidenceGrade: EvidenceGrade;
  persona: Persona;
  waitCode: WaitCode;
  engineVersion: string;
  frozenAt: number;
  status: ShadowStatus;
  scoredAt: number | null;
  realizedR: number | null;
};

export type Profile = {
  id: "profile";
  persona: Persona;
  equity: number;
  goalTarget: number | null;
  goalDeadline: string | null;
  createdAt: number;
  updatedAt: number;
};

export type Account = {
  id: string;
  name: string;
  persona: Persona;
  equity: number;
};

export type AwuruEvent = {
  id: string;
  at: number;
  type: string;
  detail: string;
};

export type MtfBundle = {
  venue: Venue;
  asset: Asset;
  symbol: string;
  quote: string;
  instrument: string;
  marketClass: MarketClass;
  series: Record<Timeframe, Series>;
  filters: InstrumentFilters;
  switched: boolean;
  failedVenues: Venue[];
};

export type IndicatorSnapshot = {
  rsi: number;
  atr: number;
  adx: number;
  plusDi: number;
  minusDi: number;
  emaFast: number;
  emaSlow: number;
  bbMid: number;
  bbUpper: number;
  bbLower: number;
  donchianHigh: number;
  donchianLow: number;
};

export type SwingPoint = {
  openTime: number;
  price: number;
  kind: "high" | "low";
};

export type Structure = {
  lastSwingHigh: SwingPoint | null;
  lastSwingLow: SwingPoint | null;
  priorSwingHigh: SwingPoint | null;
  priorSwingLow: SwingPoint | null;
  pattern: "hh_hl" | "lh_ll" | "hh_ll" | "lh_hl" | "undefined";
  read: import("./constants.ts").StructureRead;
  rangeHigh: number | null;
  rangeLow: number | null;
  breakout: "none" | "wick" | "close";
  breakoutDir: Direction | null;
  reclaim: boolean;
  reasons: string[];
};

export type Regime = {
  kind: import("./constants.ts").RegimeKind;
  direction: Direction | "neutral";
  volatility: "compressed" | "normal" | "expanded";
  adx: number;
  bbWidthPct: number;
  atrPct: number;
  reasons: string[];
};

export type SourceSnap = {
  venue: import("./constants.ts").Venue;
  ok: boolean;
  lastClosedOpen: number | null;
  lastClose: number | null;
  ms: number;
  error?: string;
};

export type Corroboration = {
  status: import("./constants.ts").CorroborationState;
  primary: import("./constants.ts").Venue | null;
  snaps: SourceSnap[];
  spreadPct: number | null;
  timestampDeltaMs: number | null;
  reason: string;
};

export type TfContext = {
  bias: Direction | "neutral";
  adx: number;
  structureRead: import("./constants.ts").StructureRead;
  regime: import("./constants.ts").RegimeKind;
  role: string;
};

export type Candidate = {
  family: import("./constants.ts").Family;
  direction: Direction;
  state: import("./constants.ts").LifecycleState;
  grade: EvidenceGrade;
  score: number;
  rank: number;
  regimeFit: boolean;
  h1: import("./constants.ts").HtfStance;
  h4: import("./constants.ts").HtfStance;
  trigger: string;
  invalidation: string;
  invalidatorPrice: number | null;
  blockers: string[];
  reasons: string[];
  geometry: Geometry | null;
  whyNow: string;
  whyNot: string;
  structureRead: import("./constants.ts").StructureRead | null;
  setupId: string | null;
  zone: { origin: string; low: number; high: number; type: string } | null;
  retraceNote: string | null;
  triggerType: import("./constants.ts").TriggerType | null;
  qualityGrade: import("./constants.ts").QualityGrade | null;
};

export type Thesis = {
  id: string;
  asset: import("./constants.ts").Asset;
  at: number;
  barOpen: number | null;
  venue: import("./constants.ts").Venue | null;
  regime: import("./constants.ts").RegimeKind | null;
  userDecision: import("./constants.ts").UserDecision;
  direction: Direction | null;
  family: import("./constants.ts").Family | null;
  state: import("./constants.ts").LifecycleState;
  evidence: string;
  invalidation: string | null;
  sourceQuality: string;
  engineVersion: string;
  structureRead: import("./constants.ts").StructureRead | null;
  whyNow: string | null;
  whyNot: string | null;
};

export type SetupRecord = {
  id: string;
  asset: import("./constants.ts").Asset;
  venue: import("./constants.ts").Venue;
  instrument: string;
  family: import("./constants.ts").Family;
  direction: Direction;
  zoneOrigin: string;
  zoneLow: number;
  zoneHigh: number;
  state: import("./constants.ts").LifecycleState;
  createdAt: number;
  updatedAt: number;
  barOpen: number;
  engineVersion: string;
  triggerType: import("./constants.ts").TriggerType;
  invalidation: string;
};

export type LifecycleEvent = {
  id: string;
  at: number;
  from: import("./constants.ts").LifecycleState | null;
  to: import("./constants.ts").LifecycleState;
  reason: string;
  engineVersion: string;
  asset: import("./constants.ts").Asset;
  barOpen: number | null;
};

