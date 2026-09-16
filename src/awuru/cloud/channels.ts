import type { Asset } from "../domain/constants.ts";

/**
 * Prepared Realtime topics. Not activated in Stage 1.
 * Broadcast later; never stream raw candles, trades, or books.
 */
export const SYSTEM_HEALTH_CHANNEL = "system:health";

export function marketChannel(asset: Asset): `market:${Asset}` {
  return `market:${asset}`;
}

export function userChannel(userId: string): `user:${string}` {
  if (!userId) throw new Error("user channel requires auth.uid()");
  return `user:${userId}`;
}

export const PREPARED_CHANNELS = ["market:BTC", "market:ETH", "market:GOLD", "system:health", "user:{uid}"] as const;
