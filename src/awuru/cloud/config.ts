/**
 * Stage 1/2 cloud config. Inactive unless the owner attaches a staging project.
 * Never reads DATABASE_URL (that is App Builder Neon).
 * Never reads a service-role key into a VITE_ field — there is no such field.
 *
 * Public/browser-safe: AWURU_SUPABASE_URL, AWURU_SUPABASE_ANON_KEY
 * Server-only:         AWURU_SUPABASE_SERVICE_ROLE_KEY
 * Required for worker: AWURU_CLOUD_ENV=staging, AWURU_ENGINE_VERSION, AWURU_CONTRACT_VERSION
 */

export type CloudClassification = "local" | "development" | "staging" | "production";

export type CloudPublicConfig = {
  classification: CloudClassification;
  enabled: boolean;
  url: string | null;
  anonKeyPresent: boolean;
  plan: "free" | "pro" | "unknown";
};

function classification(): CloudClassification {
  const raw = (typeof process !== "undefined" ? process.env.AWURU_CLOUD_ENV : undefined) ?? "local";
  if (raw === "staging" || raw === "production" || raw === "local" || raw === "development") return raw;
  return "local";
}

/** Public URL + whether an anon key exists. Never returns secrets. */
export function readCloudPublicConfig(): CloudPublicConfig {
  const env = typeof process === "undefined" ? ({} as NodeJS.ProcessEnv) : process.env;
  const url = env.AWURU_SUPABASE_URL?.trim() || null;
  const anon = env.AWURU_SUPABASE_ANON_KEY?.trim() || null;
  return {
    classification: classification(),
    enabled: Boolean(url && anon),
    url,
    anonKeyPresent: Boolean(anon),
    plan: env.AWURU_SUPABASE_PLAN === "pro" ? "pro" : env.AWURU_SUPABASE_PLAN === "free" ? "free" : "unknown",
  };
}

export function assertNoServiceRoleInVite(): void {
  const env = typeof process === "undefined" ? ({} as NodeJS.ProcessEnv) : process.env;
  for (const key of Object.keys(env)) {
    if (/^VITE_.*SERVICE_ROLE/i.test(key) && env[key]) {
      throw new Error(`${key} must never be set — service role is server-only`);
    }
  }
}
