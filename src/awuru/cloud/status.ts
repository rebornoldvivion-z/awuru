/**
 * Model C stage status.
 * Gate A is hosted-verified. Render.com is not provisioned from this workbench.
 * Cloud is not production-authoritative.
 */

export const MODEL_C_STATUS = {
  stage0: "pass",
  stage1: "pass",
  stage2: "in_progress",
  gateA: "pass",
  hostedSupabase: "attached",
  render: "not_provisioned",
  workerStatus: "not_provisioned",
  cloudAuthoritative: false,
  parity: "in_progress",
  production: "model-b",
  engine: "7.3.0",
} as const;

export type ModelCStatus = typeof MODEL_C_STATUS;
