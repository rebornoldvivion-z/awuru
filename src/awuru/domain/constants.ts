export const ENGINE_VERSION = "7.3.0";
export const BUILD_ID = "cc-9f61d40.1";
export const SURFACE = "command-center";
export const APP_NAME = "AWURU v7 — Discipline Desk";
export const DB_NAME = "awuru-v7";
export const DB_VERSION = 4;

export const ASSETS = ["BTC", "ETH", "GOLD"] as const;
export type Asset = (typeof ASSETS)[number];

export const POST_V7_MARKETS = ["SOL", "OIL"] as const;

export const TIMEFRAMES = ["15m", "1h", "4h"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const VENUES = ["binance", "kraken", "okx"] as const;
export type Venue = (typeof VENUES)[number];

export const INTERVAL_MS: Record<Timeframe, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
};

export const LOOKBACK: Record<Timeframe, number> = {
  "15m": 80,
  "1h": 60,
  "4h": 40,
};

export const FETCH_LIMIT: Record<Timeframe, number> = {
  "15m": 500,
  "1h": 500,
  "4h": 300,
};

export const AGE_DELAYED_MULT = 1.5;
export const AGE_STALE_MULT = 3;

export const RSI_PERIOD = 14;
export const ATR_PERIOD = 14;
export const ADX_PERIOD = 14;
export const EMA_FAST = 21;
export const EMA_SLOW = 50;
export const BB_PERIOD = 20;
export const BB_STD = 2;
export const DONCHIAN_PERIOD = 20;

export const PRIMARY_TF: Timeframe = "15m";

export const PERSONAS = ["Apex", "Orion", "Aegis"] as const;
export type Persona = (typeof PERSONAS)[number];

export const FAMILIES = ["trend", "breakout", "mean_reversion"] as const;
export type Family = (typeof FAMILIES)[number];

export const EVIDENCE_GRADES = ["weak", "mixed", "strong"] as const;
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];

export const GRADE_RANK: Record<EvidenceGrade, number> = {
  weak: 1,
  mixed: 2,
  strong: 3,
};

export const QUALITY_STATES = [
  "LIVE",
  "DELAYED",
  "STALE",
  "PARTIAL",
  "INVALID",
  "UNAVAILABLE",
  "SOURCE_SWITCH",
] as const;
export type QualityState = (typeof QUALITY_STATES)[number];

export const WAIT_CODES = [
  "WAIT_DATA",
  "WAIT_HTF",
  "WAIT_DISAGREEMENT",
  "WAIT_RISK",
  "WAIT_UNSIZEABLE",
  "WAIT_SOURCE_TRANSITION",
  "WAIT_REGIME",
  "WAIT_GEOMETRY",
  "WAIT_EVIDENCE",
  "WAIT_GOAL",
  "WAIT_DIVERGENCE",
  "WAIT_TRIGGER",
  "WAIT_QUARANTINE",
] as const;
export type WaitCode = (typeof WAIT_CODES)[number];

export const DECISION_KINDS = ["WAIT", "RELEASE"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const USER_DECISIONS = ["BUY", "SELL", "WATCH", "WAIT"] as const;
export type UserDecision = (typeof USER_DECISIONS)[number];

export const LIFECYCLE_STATES = [
  "OBSERVING",
  "FORMING",
  "WATCH",
  "TRIGGERED",
  "QUALIFIED",
  "CANDIDATE",
  "RELEASED",
  "CONFIRMED",
  "DEGRADED",
  "EXPIRED",
  "INVALIDATED",
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const REGIME_KINDS = ["TREND", "RANGE", "COMPRESSION", "EXPANSION"] as const;
export type RegimeKind = (typeof REGIME_KINDS)[number];

export const HTF_STANCES = ["SUPPORTIVE", "NEUTRAL", "OPPOSING"] as const;
export type HtfStance = (typeof HTF_STANCES)[number];

export const CORROBORATION_STATES = [
  "SOURCE_AGREEMENT",
  "SOURCE_DIVERGENCE",
  "PRIMARY_ONLY",
  "INSUFFICIENT",
] as const;
export type CorroborationState = (typeof CORROBORATION_STATES)[number];

export const THESIS_CHANGES = [
  "UNCHANGED",
  "STRENGTHENED",
  "WEAKENED",
  "INVALIDATED",
  "REVERSED",
  "NEW_SETUP",
] as const;
export type ThesisChange = (typeof THESIS_CHANGES)[number];

export const BINANCE_VISION = "https://data-api.binance.vision";
export const KRAKEN_PUBLIC = "https://api.kraken.com/0/public";
export const OKX_PUBLIC = "https://www.okx.com/api/v5";

export const MARKET_CLASSES = ["CRYPTO_SPOT", "TOKENIZED_GOLD_PROXY", "XAUUSD_SPOT"] as const;
export type MarketClass = (typeof MARKET_CLASSES)[number];

export const GOLD_INSTRUMENTS = ["PAXGUSDT", "PAXGUSD", "PAXG-USDT", "XAUUSD_SPOT"] as const;
export type GoldInstrument = (typeof GOLD_INSTRUMENTS)[number];

export const VENUE_SYMBOLS: Record<
  Venue,
  Record<Asset, { native: string; quote: string; base: string; instrument: string; marketClass: MarketClass }>
> = {
  binance: {
    BTC: { native: "BTCUSDT", quote: "USDT", base: "BTC", instrument: "BTCUSDT", marketClass: "CRYPTO_SPOT" },
    ETH: { native: "ETHUSDT", quote: "USDT", base: "ETH", instrument: "ETHUSDT", marketClass: "CRYPTO_SPOT" },
    GOLD: { native: "PAXGUSDT", quote: "USDT", base: "PAXG", instrument: "PAXGUSDT", marketClass: "TOKENIZED_GOLD_PROXY" },
  },
  kraken: {
    BTC: { native: "XBTUSD", quote: "USD", base: "XBT", instrument: "XBTUSD", marketClass: "CRYPTO_SPOT" },
    ETH: { native: "ETHUSD", quote: "USD", base: "ETH", instrument: "ETHUSD", marketClass: "CRYPTO_SPOT" },
    GOLD: { native: "PAXGUSD", quote: "USD", base: "PAXG", instrument: "PAXGUSD", marketClass: "TOKENIZED_GOLD_PROXY" },
  },
  okx: {
    BTC: { native: "BTC-USDT", quote: "USDT", base: "BTC", instrument: "BTC-USDT", marketClass: "CRYPTO_SPOT" },
    ETH: { native: "ETH-USDT", quote: "USDT", base: "ETH", instrument: "ETH-USDT", marketClass: "CRYPTO_SPOT" },
    GOLD: { native: "PAXG-USDT", quote: "USDT", base: "PAXG", instrument: "PAXG-USDT", marketClass: "TOKENIZED_GOLD_PROXY" },
  },
};

export function seriesIdentity(asset: Asset, venue: Venue, instrument: string, tf: Timeframe): string {
  return `${asset.toLowerCase()}:${venue}:${instrument}:${tf}`;
}

export function marketCaption(asset: Asset, instrument: string | null, marketClass: MarketClass | null): string {
  if (asset !== "GOLD") return asset;
  if (!instrument || marketClass === "XAUUSD_SPOT") return "GOLD · XAUUSD UNAVAILABLE";
  if (marketClass === "TOKENIZED_GOLD_PROXY" || instrument.startsWith("PAXG")) return `GOLD PROXY · ${instrument}`;
  return `GOLD · ${instrument}`;
}

export const BINANCE_INTERVAL: Record<Timeframe, string> = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
};

export const KRAKEN_INTERVAL: Record<Timeframe, number> = {
  "15m": 15,
  "1h": 60,
  "4h": 240,
};

export const OKX_BAR: Record<Timeframe, string> = {
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
};

export const FETCH_TIMEOUT_MS = 12_000;

export const PERSONA_POLICY: Record<
  Persona,
  {
    riskPct: number;
    minEvidence: EvidenceGrade;
    dailyR: number;
    maxOpenR: number;
    maxTrades: number;
    maxConsecutiveLosses: number;
  }
> = {
  Apex: {
    riskPct: 0.01,
    minEvidence: "weak",
    dailyR: 3,
    maxOpenR: 2,
    maxTrades: 5,
    maxConsecutiveLosses: 3,
  },
  Orion: {
    riskPct: 0.005,
    minEvidence: "mixed",
    dailyR: 2,
    maxOpenR: 1.5,
    maxTrades: 3,
    maxConsecutiveLosses: 2,
  },
  Aegis: {
    riskPct: 0.0025,
    minEvidence: "strong",
    dailyR: 1,
    maxOpenR: 1,
    maxTrades: 2,
    maxConsecutiveLosses: 1,
  },
};

export const DEFAULT_EQUITY = 10_000;
export const DEFAULT_ACCOUNT_ID = "primary";
export const LEVERAGE = 1;

export const STRUCTURE_READS = [
  "BULLISH_STRUCTURE",
  "BEARISH_STRUCTURE",
  "EXPANDING_RANGE",
  "RANGE_TRANSITION",
  "UNKNOWN",
] as const;
export type StructureRead = (typeof STRUCTURE_READS)[number];

export const ZONE_TYPES = ["SWING_SUPPORT", "SWING_RESISTANCE", "RANGE_HIGH", "RANGE_LOW", "DONCHIAN"] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export const RETRACE_PHASES = ["NONE", "IMPULSE", "RETRACING", "IN_ZONE", "REACTED", "TRIGGERED"] as const;
export type RetracePhase = (typeof RETRACE_PHASES)[number];

export const TRIGGER_TYPES = ["none", "rejection_close", "reclaim_close", "closed_breakout"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const QUALITY_GRADES = ["weak", "mixed", "good", "strong"] as const;
export type QualityGrade = (typeof QUALITY_GRADES)[number];

export const MIN_RELEASE_RR = 1.2;
export const SETUP_TTL_BARS = 16;
export const AGREE_SPREAD_PCT = 0.0015;
export const DIVERGE_SPREAD_PCT = 0.005;
export const AGREE_TS_MS = INTERVAL_MS["15m"];
