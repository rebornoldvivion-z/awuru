import { timingSafeEqual } from "node:crypto";
import type { EnvMap } from "./gate.ts";

export function observerSecretFromEnv(env: EnvMap = process.env): string | null {
  const secret = env.AWURU_OBSERVER_SECRET?.trim();
  return secret ? secret : null;
}

export function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function authorizeObserver(
  headerValue: string | null | undefined,
  env: EnvMap = process.env,
): { ok: true } | { ok: false; status: 401 | 503; code: "SECRET_MISSING" | "UNAUTHORIZED" } {
  const expected = observerSecretFromEnv(env);
  if (!expected) {
    return { ok: false, status: 503, code: "SECRET_MISSING" };
  }
  const raw = headerValue?.trim() ?? "";
  const provided = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
  if (!provided || !secretsEqual(provided, expected)) {
    return { ok: false, status: 401, code: "UNAUTHORIZED" };
  }
  return { ok: true };
}
