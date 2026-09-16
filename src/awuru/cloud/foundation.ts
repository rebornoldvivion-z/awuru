/**
 * Stage 1 identity + realtime foundation.
 * Not activated. Command Center stays guest IndexedDB.
 * Cloud is not authoritative until a later migration stage.
 */

export const AUTH_FOUNDATION = {
  loginMandatory: false,
  guestStore: "indexeddb",
  authenticatedStore: "supabase+indexeddb-cache",
  cloudAuthoritative: false,
  preferredRoute: "magic-link",
  provider: "supabase-auth",
} as const;

export const REALTIME_AUTHORIZATION = {
  activated: false,
  transport: "broadcast",
  publicTopics: ["market:BTC", "market:ETH", "market:GOLD", "system:health"],
  privateTopicPattern: "user:{uid}",
  neverStream: ["raw-candles", "trades", "order-book", "ticks"],
  privateRule: "jwt.sub === uid",
} as const;

/** Canonical until a real worker is running. Do not invent HEALTHY. */
export const WORKER_STATUS_CANONICAL = "not_provisioned" as const;
