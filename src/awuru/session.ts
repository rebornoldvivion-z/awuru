import { create } from "zustand";
import {
  DEFAULT_ACCOUNT_ID,
  ENGINE_VERSION,
  INTERVAL_MS,
  type Asset,
  type Persona,
} from "./constants.ts";
import { decide } from "./engine.ts";
import { newId } from "./ids.ts";
import {
  addEvent,
  addLifecycle,
  available,
  getMissionBySignal,
  listEvents,
  listLifecycle,
  listMissions,
  listShadows,
  listSignals,
  loadProfile,
  loadRiskDay,
  loadThesis,
  putMission,
  putShadow,
  putSignal,
  saveProfile,
  saveRiskDay,
  saveShadow,
  saveThesis,
} from "./persist.ts";
import { applyMissionClose, applyMissionOpen } from "./risk.ts";
import { scoreMissionGeometry, scoreShadow } from "./shadow.ts";
import { utcDayKey } from "./time.ts";
import { loadTape, type DataSource } from "./client-api.ts";
import { compareThesis, describeThesisShift, thesisFrom } from "./engine/thesis.ts";
import type {
  Decision,
  LifecycleEvent,
  Mission,
  MtfBundle,
  Profile,
  RiskDay,
  Shadow,
  StoredSignal,
  Thesis,
} from "./types.ts";
import type { ThesisChange } from "./constants.ts";

type EventRow = { id: string; at: number; type: string; detail: string };

let focusTimer: ReturnType<typeof setTimeout> | null = null;

function nextCloseMs(now: number): number {
  const iv = INTERVAL_MS["15m"];
  return Math.ceil((now + 50) / iv) * iv;
}

type Session = {
  ready: boolean;
  storageOk: boolean;
  profile: Profile | null;
  riskDay: RiskDay | null;
  asset: Asset;
  scanning: boolean;
  error: string | null;
  bundle: MtfBundle | null;
  decision: Decision | null;
  missions: Mission[];
  shadows: Shadow[];
  signals: StoredSignal[];
  events: EventRow[];
  now: number;
  dataSource: DataSource | null;
  thesis: Thesis | null;
  thesisChange: ThesisChange | null;
  changeNote: string | null;
  nextCloseAt: number | null;
  focused: boolean;
  hydrate: () => Promise<void>;
  setAsset: (a: Asset) => void;
  scan: (reason?: string) => Promise<void>;
  confirmRelease: () => Promise<void>;
  savePersona: (p: Persona) => Promise<void>;
  saveGoal: (equity: number, target: number | null, deadline: string | null) => Promise<void>;
  setFocused: (on: boolean) => void;
};

export const useSession = create<Session>((set, get) => ({
  ready: false,
  storageOk: true,
  profile: null,
  riskDay: null,
  asset: "BTC",
  scanning: false,
  error: null,
  bundle: null,
  decision: null,
  missions: [],
  shadows: [],
  signals: [],
  events: [],
  now: 0,
  dataSource: null,
  thesis: null,
  thesisChange: null,
  changeNote: null,
  nextCloseAt: null,
  focused: true,

  hydrate: async () => {
    try {
      const ok = await available();
      const profile = await loadProfile();
      const riskDay = await loadRiskDay(utcDayKey(Date.now()));
      set({
        storageOk: ok,
        profile,
        riskDay,
        missions: await listMissions(),
        shadows: await listShadows(),
        signals: await listSignals(),
        events: await listEvents(),
        thesis: await loadThesis(),
        ready: true,
      });
      void get().scan("open");
    } catch (err) {
      set({
        ready: true,
        storageOk: false,
        error: err instanceof Error ? err.message : "local ledger failed",
        profile: {
          id: "profile",
          persona: "Orion",
          equity: 10_000,
          goalTarget: null,
          goalDeadline: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        riskDay: { day: utcDayKey(Date.now()), realizedR: 0, openR: 0, trades: 0, consecutiveLosses: 0 },
      });
    }
  },

  setAsset: (asset) => {
    set({ asset });
    void get().scan("asset");
  },

  setFocused: (on) => {
    set({ focused: on });
    if (focusTimer) {
      clearTimeout(focusTimer);
      focusTimer = null;
    }
    if (!on) return;
    const fire = () => {
      const { focused, scan } = get();
      if (!focused) return;
      const when = nextCloseMs(Date.now());
      set({ nextCloseAt: when });
      focusTimer = setTimeout(() => {
        if (get().focused) void scan("15m-close");
        fire();
      }, Math.max(250, when - Date.now() + 400));
    };
    fire();
  },

  scan: async (reason = "manual") => {
    const { profile, riskDay, asset } = get();
    if (!profile || !riskDay) return;
    set({ scanning: true, error: null });
    const t = Date.now();
    set({ now: t, nextCloseAt: nextCloseMs(t) });
    try {
      const loaded = await loadTape(asset, t);
      const d = decide({
        bundle: loaded.bundle,
        profile,
        riskDay,
        now: loaded.now,
        accountId: DEFAULT_ACCOUNT_ID,
        corroboration: loaded.corroboration,
      });
      const prev = get().thesis ?? (await loadThesis());
      const nextThesis = thesisFrom(d);
      const change = compareThesis(prev, nextThesis);
      nextThesis.id = "thesis";
      d.thesis = nextThesis;
      d.thesisChange = change;
      await saveThesis(nextThesis);
      if (change !== "UNCHANGED") {
        await addEvent({ id: newId("evt"), at: t, type: "thesis", detail: `${describeThesisShift(prev, nextThesis)} · ${reason}` });
        const lc: LifecycleEvent = {
          id: newId("life"),
          at: t,
          from: prev?.state ?? null,
          to: d.lifecycle,
          reason: d.waitDetail ?? d.userDecision,
          engineVersion: ENGINE_VERSION,
          asset,
          barOpen: d.barOpen,
        };
        await addLifecycle(lc);
      }
      if (loaded.errors.length) {
        await addEvent({ id: newId("evt"), at: t, type: "venue", detail: loaded.errors.join(" · ") });
      }
      if (d.signalId) {
        const created = await putSignal({ signalId: d.signalId, decision: d, createdAt: t });
        if (!created) {
          await addEvent({ id: newId("evt"), at: t, type: "idempotent", detail: `duplicate scan ignored ${d.signalId}` });
        }
      } else if (d.geometry && d.venue && d.symbol && d.barOpen && d.family && d.direction && d.waitCode && d.evidenceGrade) {
        await putShadow({
          id: `${d.venue}|${d.symbol}|${d.barOpen}|${d.family}|${d.persona}|${ENGINE_VERSION}`,
          signalId: d.signalId ?? `${d.venue}|${d.symbol}|${d.barOpen}|shadow`,
          accountId: DEFAULT_ACCOUNT_ID,
          venue: d.venue,
          symbol: d.symbol,
          timeframe: d.timeframe,
          barOpen: d.barOpen,
          direction: d.direction,
          entry: d.geometry.entry,
          stop: d.geometry.stop,
          tp1: d.geometry.tp1,
          tp2: d.geometry.tp2,
          tp3: d.geometry.tp3,
          family: d.family,
          evidenceGrade: d.evidenceGrade,
          persona: d.persona,
          waitCode: d.waitCode,
          engineVersion: ENGINE_VERSION,
          frozenAt: t,
          status: "open",
          scoredAt: null,
          realizedR: null,
        });
      }

      let nextMissions = await listMissions();
      if (loaded.bundle) {
        const later = loaded.bundle.series["15m"].candles;
        const scored = (await listShadows()).map((s) => {
          if (s.venue !== loaded.bundle!.venue || s.symbol !== loaded.bundle!.symbol) {
            if (s.status === "open") return { ...s, status: "unscorable" as const, scoredAt: t };
            return s;
          }
          return scoreShadow(s, later, t);
        });
        for (const s of scored) await saveShadow(s);

        const rebuilt: Mission[] = [];
        for (const m of nextMissions) {
          if (m.status !== "open" || m.venue !== loaded.bundle.venue || m.symbol !== loaded.bundle.symbol) {
            rebuilt.push(m);
            continue;
          }
          const scoredM = scoreMissionGeometry(
            m.direction,
            { stop: m.stop, tp1: m.tp1, tp2: m.tp2, tp3: m.tp3, expiry: m.expiry, barOpen: m.barOpen },
            later.filter((c) => c.openTime > m.barOpen),
            t,
          );
          if (scoredM.status !== "open" && scoredM.status !== "unscorable") {
            const closed: Mission = {
              ...m,
              status: scoredM.status === "sl" ? "sl" : scoredM.status === "expired" ? "expired" : scoredM.status,
              closedAt: t,
              realizedR: scoredM.realizedR,
            };
            await putMission(closed);
            const day = await loadRiskDay(utcDayKey(t));
            await saveRiskDay(applyMissionClose(day, scoredM.realizedR ?? 0));
            rebuilt.push(closed);
          } else {
            rebuilt.push(m);
          }
        }
        nextMissions = rebuilt;
      }

      set({
        bundle: loaded.bundle,
        decision: d,
        missions: nextMissions,
        shadows: await listShadows(),
        signals: await listSignals(),
        events: await listEvents(),
        riskDay: await loadRiskDay(utcDayKey(t)),
        dataSource: loaded.source,
        scanning: false,
        thesis: nextThesis,
        thesisChange: change,
        changeNote: reason === "15m-close" ? `15m closed · ${describeThesisShift(prev, nextThesis)}` : describeThesisShift(prev, nextThesis),
      });
      void listLifecycle();
    } catch (err) {
      set({ scanning: false, error: err instanceof Error ? err.message : "scan failed" });
    }
  },

  confirmRelease: async () => {
    const { decision } = get();
    if (!decision || decision.kind !== "RELEASE" || !decision.signalId || !decision.geometry || !decision.size?.ok) {
      return;
    }
    const existing = await getMissionBySignal(decision.signalId);
    if (existing) return;
    const m: Mission = {
      id: newId("msn"),
      signalId: decision.signalId,
      accountId: DEFAULT_ACCOUNT_ID,
      venue: decision.venue!,
      symbol: decision.symbol!,
      timeframe: decision.timeframe,
      direction: decision.direction!,
      entry: decision.geometry.entry,
      stop: decision.geometry.stop,
      tp1: decision.geometry.tp1,
      tp2: decision.geometry.tp2,
      tp3: decision.geometry.tp3,
      qty: decision.size.qty,
      riskCash: decision.size.riskCash,
      status: "open",
      confirmedAt: Date.now(),
      closedAt: null,
      realizedR: null,
      note: "",
      engineVersion: ENGINE_VERSION,
      barOpen: decision.barOpen ?? 0,
      expiry: decision.geometry.expiry,
    };
    await putMission(m);
    const day = await loadRiskDay(utcDayKey(Date.now()));
    const next = applyMissionOpen(day);
    await saveRiskDay(next);
    await addEvent({
      id: newId("evt"),
      at: Date.now(),
      type: "confirm",
      detail: `manual ${decision.userDecision} ${m.symbol} ${m.direction}`,
    });
    await addLifecycle({
      id: newId("life"),
      at: Date.now(),
      from: "RELEASED",
      to: "CONFIRMED",
      reason: "manual confirmation",
      engineVersion: ENGINE_VERSION,
      asset: decision.asset,
      barOpen: decision.barOpen,
    });
    set({
      riskDay: next,
      missions: await listMissions(),
      events: await listEvents(),
    });
  },

  savePersona: async (persona) => {
    const { profile } = get();
    if (!profile) return;
    const next = { ...profile, persona, updatedAt: Date.now() };
    await saveProfile(next);
    set({ profile: next });
  },

  saveGoal: async (equity, goalTarget, goalDeadline) => {
    const { profile } = get();
    if (!profile) return;
    const next = { ...profile, equity, goalTarget, goalDeadline, updatedAt: Date.now() };
    await saveProfile(next);
    set({ profile: next });
  },
}));
