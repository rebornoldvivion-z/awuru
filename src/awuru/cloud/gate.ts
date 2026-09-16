import { ENGINE_VERSION } from "../domain/constants.ts";
import { CONTRACT_VERSION } from "../engine/canonical.ts";
import { assertNoServiceRoleInVite } from "./config.ts";
import { MODEL_C_STATUS } from "./status.ts";

export type EnvMap = Record<string, string | undefined>;

export type ModelCEnvironment = "development" | "staging" | "production";

export const PUBLIC_ENV_KEYS = ["AWURU_SUPABASE_URL", "AWURU_SUPABASE_ANON_KEY"] as const;
export const SERVER_ENV_KEYS = ["AWURU_SUPABASE_SERVICE_ROLE_KEY"] as const;
export const REQUIRED_WORKER_ENV_KEYS = [
  "AWURU_CLOUD_ENV",
  "AWURU_SUPABASE_URL",
  "AWURU_SUPABASE_SERVICE_ROLE_KEY",
  "AWURU_ENGINE_VERSION",
  "AWURU_CONTRACT_VERSION",
] as const;

export type ModelCInfraConfig = {
  environment: "staging";
  url: string;
  serviceRolePresent: boolean;
  anonKeyPresent: boolean;
  engineVersion: string;
  contractVersion: string;
  workerStatus: typeof MODEL_C_STATUS.workerStatus;
};

function readEnv(env?: EnvMap): EnvMap {
  if (env) return env;
  if (typeof process === "undefined") {
    throw new Error("Model C infrastructure is server-only");
  }
  return process.env;
}

export function readModelCEnvironment(env?: EnvMap): ModelCEnvironment | null {
  const raw = readEnv(env).AWURU_CLOUD_ENV?.trim();
  if (!raw) return null;
  if (raw === "local" || raw === "development") return "development";
  if (raw === "staging" || raw === "production") return raw;
  throw new Error(`AWURU_CLOUD_ENV is invalid: ${raw}`);
}

export function isHostedStagingAttached(env?: EnvMap): boolean {
  const e = readEnv(env);
  return Boolean(e.AWURU_SUPABASE_URL?.trim() && e.AWURU_SUPABASE_SERVICE_ROLE_KEY?.trim() && readModelCEnvironment(e) === "staging");
}

/**
 * Fail-closed boot check for future Model C infrastructure.
 * Model B must never call this.
 * Staging only. Production is refused until cutover.
 */
export function assertModelCInfrastructureReady(env?: EnvMap): ModelCInfraConfig {
  const e = readEnv(env);
  assertNoServiceRoleInVite();

  for (const key of Object.keys(e)) {
    if (/^VITE_.*SERVICE_ROLE/i.test(key) && e[key]) {
      throw new Error(`${key} must never be set — service role is server-only`);
    }
  }

  const environment = readModelCEnvironment(e);
  if (!environment) {
    throw new Error("Model C infrastructure refuses to start: AWURU_CLOUD_ENV missing");
  }
  if (environment === "production") {
    throw new Error("Model C worker refuses production until cutover authorization. Staging only.");
  }
  if (environment !== "staging") {
    throw new Error(`Model C infrastructure refuses to start: environment=${environment}. Staging only.`);
  }

  const url = e.AWURU_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error("Model C infrastructure refuses to start: AWURU_SUPABASE_URL missing");
  }

  const service = e.AWURU_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!service) {
    throw new Error("Model C infrastructure refuses to start: AWURU_SUPABASE_SERVICE_ROLE_KEY missing");
  }

  const engineVersion = e.AWURU_ENGINE_VERSION?.trim();
  if (!engineVersion) {
    throw new Error("Model C infrastructure refuses to start: AWURU_ENGINE_VERSION missing");
  }
  if (engineVersion !== ENGINE_VERSION) {
    throw new Error(`Model C engine version mismatch: env=${engineVersion} code=${ENGINE_VERSION}`);
  }

  const contractVersion = e.AWURU_CONTRACT_VERSION?.trim();
  if (!contractVersion) {
    throw new Error("Model C infrastructure refuses to start: AWURU_CONTRACT_VERSION missing");
  }
  if (contractVersion !== CONTRACT_VERSION) {
    throw new Error(`Model C contract version mismatch: env=${contractVersion} code=${CONTRACT_VERSION}`);
  }

  return {
    environment: "staging",
    url,
    serviceRolePresent: true,
    anonKeyPresent: Boolean(e.AWURU_SUPABASE_ANON_KEY?.trim()),
    engineVersion,
    contractVersion,
    workerStatus: MODEL_C_STATUS.workerStatus,
  };
}
