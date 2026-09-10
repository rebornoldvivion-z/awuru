import type { Asset, Venue } from "../domain/constants.ts";
import type { Corroboration, MtfBundle } from "../domain/types.ts";
import { loadMtfBundle } from "./venues.ts";
import { loadSourceSnaps, measureCorroboration } from "./corroboration.ts";

export type DataSource = "server" | "client";

export type LoadedTape = {
  bundle: MtfBundle | null;
  failed: Venue[];
  errors: string[];
  source: DataSource;
  now: number;
  corroboration: Corroboration | null;
};

export async function loadTape(asset: Asset, now: number): Promise<LoadedTape> {
  try {
    const res = await fetch(`/api/bundle?asset=${encodeURIComponent(asset)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`backend HTTP ${res.status}`);
    const data = (await res.json()) as {
      ok?: boolean;
      now?: number;
      bundle?: MtfBundle | null;
      failed?: Venue[];
      errors?: string[];
      error?: string;
      corroboration?: Corroboration | null;
    };
    if (!data.ok) throw new Error(data.error ?? "backend returned no tape");
    return {
      bundle: data.bundle ?? null,
      failed: data.failed ?? [],
      errors: data.errors ?? [],
      source: "server",
      now: typeof data.now === "number" ? data.now : now,
      corroboration: data.corroboration ?? null,
    };
  } catch (err) {
    const [loaded, snaps] = await Promise.all([loadMtfBundle(asset, now), loadSourceSnaps(asset, now)]);
    const msg = err instanceof Error ? err.message : "backend unreachable";
    return {
      bundle: loaded.bundle,
      failed: loaded.failed,
      errors: [`server: ${msg}`, ...loaded.errors],
      source: "client",
      now,
      corroboration: measureCorroboration(snaps, loaded.bundle?.venue ?? null),
    };
  }
}
