import { DEFAULT_ACCOUNT_ID, DEFAULT_EQUITY } from "../domain/constants.ts";
import type {
  Account,
  AwuruEvent,
  Mission,
  Profile,
  RiskDay,
  Shadow,
  StoredSignal,
} from "../domain/types.ts";

type Ledger = {
  profile: Profile | null;
  accounts: Map<string, Account>;
  signals: Map<string, StoredSignal>;
  missions: Map<string, Mission>;
  shadows: Map<string, Shadow>;
  riskDays: Map<string, RiskDay>;
  events: Map<string, AwuruEvent>;
};

export function createMemoryLedger() {
  const db: Ledger = {
    profile: null,
    accounts: new Map(),
    signals: new Map(),
    missions: new Map(),
    shadows: new Map(),
    riskDays: new Map(),
    events: new Map(),
  };

  function defaultProfile(): Profile {
    return {
      id: "profile",
      persona: "Orion",
      equity: DEFAULT_EQUITY,
      goalTarget: null,
      goalDeadline: null,
      createdAt: 1,
      updatedAt: 1,
    };
  }

  return {
    loadProfile(): Profile {
      if (!db.profile) {
        db.profile = defaultProfile();
        db.accounts.set(DEFAULT_ACCOUNT_ID, {
          id: DEFAULT_ACCOUNT_ID,
          name: "Primary",
          persona: "Orion",
          equity: DEFAULT_EQUITY,
        });
      }
      return db.profile;
    },
    saveProfile(p: Profile) {
      db.profile = { ...p, updatedAt: p.updatedAt };
    },
    putSignal(s: StoredSignal): boolean {
      if (db.signals.has(s.signalId)) return false;
      db.signals.set(s.signalId, s);
      return true;
    },
    getSignal(id: string) {
      return db.signals.get(id);
    },
    listSignals() {
      return [...db.signals.values()].sort((a, b) => b.createdAt - a.createdAt);
    },
    putMission(m: Mission) {
      db.missions.set(m.id, m);
    },
    getMissionBySignal(signalId: string) {
      return [...db.missions.values()].find((m) => m.signalId === signalId);
    },
    listMissions() {
      return [...db.missions.values()].sort((a, b) => b.confirmedAt - a.confirmedAt);
    },
    putShadow(s: Shadow): boolean {
      if (db.shadows.has(s.id)) return false;
      db.shadows.set(s.id, s);
      return true;
    },
    saveShadow(s: Shadow) {
      db.shadows.set(s.id, s);
    },
    listShadows() {
      return [...db.shadows.values()].sort((a, b) => b.frozenAt - a.frozenAt);
    },
    loadRiskDay(day: string): RiskDay {
      const existing = db.riskDays.get(day);
      if (existing) return existing;
      const empty = { day, realizedR: 0, openR: 0, trades: 0, consecutiveLosses: 0 };
      db.riskDays.set(day, empty);
      return empty;
    },
    saveRiskDay(day: RiskDay) {
      db.riskDays.set(day.day, day);
    },
    addEvent(e: AwuruEvent) {
      db.events.set(e.id, e);
    },
    listEvents() {
      return [...db.events.values()].sort((a, b) => b.at - a.at);
    },
  };
}
