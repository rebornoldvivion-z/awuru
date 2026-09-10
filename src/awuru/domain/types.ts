import type {
  Asset,
  DecisionKind,
  EvidenceGrade,
  Family,
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
};

export type Geometry = {
  direction: Direction;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskPerUnit: number;
  rr: number;
  expiry: number;
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
  };
  evidenceGrade: EvidenceGrade | null;
  engineVersion: string;
  decidedAt: number;
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
