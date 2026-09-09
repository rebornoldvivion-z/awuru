import { GRADE_RANK, PERSONA_POLICY, type EvidenceGrade, type Persona, type WaitCode } from "./constants.ts";
import type { RiskDay } from "./types.ts";
import { daysUntil } from "./time.ts";

export function emptyRiskDay(day: string): RiskDay {
  return { day, realizedR: 0, openR: 0, trades: 0, consecutiveLosses: 0 };
}

export function checkRisk(args: {
  persona: Persona;
  day: RiskDay;
  evidence: EvidenceGrade;
  requiredR: number;
}): { ok: true } | { ok: false; code: WaitCode; detail: string } {
  const p = PERSONA_POLICY[args.persona];
  if (GRADE_RANK[args.evidence] < GRADE_RANK[p.minEvidence]) {
    return {
      ok: false,
      code: "WAIT_EVIDENCE",
      detail: `${args.persona} requires ${p.minEvidence} evidence, have ${args.evidence}`,
    };
  }
  if (args.day.trades >= p.maxTrades) {
    return { ok: false, code: "WAIT_RISK", detail: `daily trade cap ${p.maxTrades} reached` };
  }
  if (args.day.consecutiveLosses >= p.maxConsecutiveLosses) {
    return {
      ok: false,
      code: "WAIT_RISK",
      detail: `consecutive-loss cap ${p.maxConsecutiveLosses} reached`,
    };
  }
  if (args.day.realizedR + args.day.openR <= -p.dailyR) {
    return { ok: false, code: "WAIT_RISK", detail: `daily R cap ${p.dailyR} reached` };
  }
  if (args.day.openR + args.requiredR > p.maxOpenR) {
    return {
      ok: false,
      code: "WAIT_RISK",
      detail: `open R ${args.day.openR} + 1 would exceed ${p.maxOpenR}`,
    };
  }
  return { ok: true };
}

export function goalConstraint(args: {
  equity: number;
  target: number | null;
  deadline: string | null;
  nowMs: number;
  evidence: EvidenceGrade;
  riskPct: number;
}): { evidence: EvidenceGrade; riskPct: number; wait?: { code: WaitCode; detail: string } } {
  let evidence = args.evidence;
  let riskPct = args.riskPct;
  if (args.target == null || args.deadline == null) return { evidence, riskPct };
  const days = daysUntil(args.deadline, args.nowMs);
  const progress = args.target > 0 ? args.equity / args.target : 1;
  if (days <= 2) {
    riskPct = args.riskPct * 0.5;
    if (GRADE_RANK[evidence] < GRADE_RANK.strong) {
      return {
        evidence,
        riskPct,
        wait: {
          code: "WAIT_GOAL",
          detail: "deadline within 2 days — only Strong evidence is allowed; size is not increased",
        },
      };
    }
  } else if (days <= 7 && progress < 0.5) {
    if (evidence === "weak") {
      return {
        evidence,
        riskPct,
        wait: {
          code: "WAIT_GOAL",
          detail: "behind target with a near deadline — Weak evidence blocked; size is not increased",
        },
      };
    }
  }
  return { evidence, riskPct };
}

export function applyMissionOpen(day: RiskDay): RiskDay {
  return { ...day, trades: day.trades + 1, openR: day.openR + 1 };
}

export function applyMissionClose(day: RiskDay, realizedR: number): RiskDay {
  const consecutiveLosses = realizedR < 0 ? day.consecutiveLosses + 1 : 0;
  return {
    ...day,
    openR: Math.max(0, day.openR - 1),
    realizedR: day.realizedR + realizedR,
    consecutiveLosses,
  };
}
