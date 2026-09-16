export const OBSERVER_STATUSES = [
  "HEALTHY",
  "DEGRADED",
  "STALE",
  "FAILED",
  "LEASE_BLOCKED",
  "RECOVERING",
] as const;
export type ObserverStatus = (typeof OBSERVER_STATUSES)[number];

export const INTERVAL_15M_MS = 15 * 60 * 1000;
export const STALE_AFTER_MS = 20 * 60 * 1000;
export const CRON_OFFSET_MS = 3 * 60 * 1000;

export type ObserverHealth = {
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_closed_candle_at: string | null;
  last_decision_at: string | null;
  scheduler_received_at: string | null;
  scheduler_lag_seconds: number;
  data_age_seconds: number | null;
  observation_duration_ms: number;
  missed_intervals: number;
  consecutive_failures: number;
  observer_status: ObserverStatus;
  lease_status: string;
  last_error_code: string | null;
};

export function iso(ms: number | null | undefined): string | null {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function schedulerLagSeconds(now: number, intervalMs = INTERVAL_15M_MS, offsetMs = CRON_OFFSET_MS): number {
  const slot = Math.floor((now - offsetMs) / intervalMs) * intervalMs + offsetMs;
  return Math.max(0, Math.round((now - slot) / 1000));
}

export function missedIntervals(now: number, lastSuccessAt: number | null, intervalMs = INTERVAL_15M_MS): number {
  if (!lastSuccessAt) return 0;
  return Math.max(0, Math.floor((now - lastSuccessAt) / intervalMs) - 1);
}

export function computeObserverHealth(args: {
  now: number;
  lastAttemptAt: number;
  lastSuccessAt: number | null;
  lastClosedCloseTime: number | null;
  lastDecisionAt: number | null;
  durationMs: number;
  consecutiveFailures: number;
  leaseStatus: string;
  lastErrorCode: string | null;
  cycleFailed: boolean;
  recovering: boolean;
  leaseBlocked: boolean;
  degraded?: boolean;
}): ObserverHealth {
  const dataAge =
    args.lastClosedCloseTime != null ? Math.max(0, Math.round((args.now - args.lastClosedCloseTime) / 1000)) : null;
  const missed = missedIntervals(args.now, args.lastSuccessAt);
  let observer_status: ObserverStatus = "HEALTHY";
  if (args.leaseBlocked) observer_status = "LEASE_BLOCKED";
  else if (args.cycleFailed) observer_status = "FAILED";
  else if (args.recovering) observer_status = "RECOVERING";
  else if (args.lastSuccessAt && args.now - args.lastSuccessAt > STALE_AFTER_MS) observer_status = "STALE";
  else if (args.degraded) observer_status = "DEGRADED";
  if (args.cycleFailed && observer_status === "HEALTHY") observer_status = "FAILED";
  return {
    last_attempt_at: iso(args.lastAttemptAt),
    last_success_at: iso(args.lastSuccessAt),
    last_closed_candle_at: iso(args.lastClosedCloseTime),
    last_decision_at: iso(args.lastDecisionAt),
    scheduler_received_at: iso(args.lastAttemptAt),
    scheduler_lag_seconds: schedulerLagSeconds(args.now),
    data_age_seconds: dataAge,
    observation_duration_ms: args.durationMs,
    missed_intervals: missed,
    consecutive_failures: args.consecutiveFailures,
    observer_status,
    lease_status: args.leaseStatus,
    last_error_code: args.lastErrorCode,
  };
}

export function shouldAdvanceCheckpoint(args: {
  ingestFailed: boolean;
  decideFailed: boolean;
  persistFailed: boolean;
}): boolean {
  return !args.ingestFailed && !args.decideFailed && !args.persistFailed;
}
