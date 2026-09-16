/**
 * Model C stage status.
 * Paid Render workers are rejected. Observation is a scheduled Free-web cycle.
 * Cloud is not production-authoritative.
 */

export const MODEL_C_STATUS = {
  stage0: "pass",
  stage1: "pass",
  stage2: "in_progress",
  gateA: "pass",
  gateBFree: "in_progress",
  hostedSupabase: "attached",
  render: "free_web_pending",
  renderWorker: "rejected_no_budget",
  observerMode: "scheduled",
  workerStatus: "not_provisioned",
  cloudAuthoritative: false,
  parity: "in_progress",
  production: "model-b",
  engine: "7.3.0",
} as const;

export type ModelCStatus = typeof MODEL_C_STATUS;
