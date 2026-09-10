import { create } from "zustand";
import {
  ASSETS,
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
  listNotes,
  listShadows,
  listSignals,
  listSnapshots,
  loadProfile,
  loadRiskDay,
  loadThesis,
  putMission,
  putNote,
  putShadow,
  putSignal,
  saveProfile,
  saveRiskDay,
  saveShadow,
  saveSnapshot,
  saveThesis,
  saveSetup,
  getSetup,
} from "./persist.ts";
import { applyMissionClose, applyMissionOpen } from "./risk.ts";
import { scoreMissionGeometry, scoreShadow } from "./shadow.ts";
import { utcDayKey } from "./time.ts";
import { loadTape, type DataSource } from "./client-api.ts";
import { compareThesis, describeThesisShift, thesisFrom, thesisIdFor } from "./engine/thesis.ts";
import type {
  Decision,
  LifecycleEvent,
  MarketSnapshot,
  Mission,
  MtfBundle,
  Note,
  Profile,
  RiskDay,
  Shadow,
  StoredSignal,
  Thesis,
} from "./types.ts";
import type { ThesisChange } from "./constants.ts";

type EventRow = { id: string; at: number; type: string; detail: string };

let focusTimer: ReturnType<typeof setTimeout> | null = null;

export function nextCloseMs(now: number): number {
  const iv = INTERVAL_MS["15m"];
  return Math.ceil((now + 50) / iv) * iv;
}

export type DeskCard = {
  asset: Asset;
  decision: Decision | null;
  bundle: MtfBundle | null;
  thesis: Thesis | null;
  change: ThesisChange | null;
  changeNote: string | null;
  snapshot: MarketSnapshot | null;
  lastObserved: boolean;
  error: string | null;
};

function cardFrom(d: Decision, bundle: MtfBundle | null, thesis: Thesis | null, change: ThesisChange | null, note: string, lastObserved: boolean): DeskCard {
  const last = bundle?.series["15m"]?.candles.at(-1);
  return {
    asset: d.asset,
    decision: d,
    bundle,
    thesis,
    change,
    changeNote: note,
    lastObserved,
    error: null,
    snapshot: {
      id: d.asset,
      asset: d.asset,
      at: d.decidedAt,
      userDecision: d.userDecision,
      quality: d.quality.state,
      regime: d.regime?.kind ?? null,
      structure: d.structure?.read ?? null,
      family: d.family,
      research: d.researchStatus.qualification,
      waitCode: d.waitCode,
      waitDetail: d.waitDetail,
      instrument: d.instrument,
      marketClass: d.marketClass,
      venue: d.venue,
      lastClosedOpen: last?.openTime ?? d.barOpen,
      lastClose: last?.close ?? null,
      trigger: d.trigger,
      invalidation: d.invalidation,
      changeNote: note,
      lifecycle: d.lifecycle,
    },
  };
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
  notes: Note[];
  lifecycle: LifecycleEvent[];
  now: number;
  dataSource: DataSource | null;
  thesis: Thesis | null;
  thesisChange: ThesisChange | null;
  changeNote: string | null;
  nextCloseAt: number | null;
  focused: boolean;
  lastObserved: boolean;
  pulse: number;
  cards: Record<Asset, DeskCard | null>;
  hydrate: () => Promise<void>;
  setAsset: (a: Asset) => void;
  scan: (reason?: string) => Promise<void>;
  scanDesk: (reason?: string) => Promise<void>;
  confirmRelease: () => Promise<void>;
  savePersona: (p: Persona) => Promise<void>;
  saveGoal: (equity: number, target: number | null, deadline: string | null) => Promise<void>;
  setFocused: (on: boolean) => void;
  addNote: (body: string) => Promise<void>;
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
  notes: [],
  lifecycle: [],
  now: 0,
  dataSource: null,
  thesis: null,
  thesisChange: null,
  changeNote: null,
  nextCloseAt: null,
  focused: true,
  lastObserved: false,
  pulse: 0,
  cards: { BTC: null, ETH: null, GOLD: null },

  hydrate: async () => {
    try {
      const ok = await available();
      const profile = await loadProfile();
      const riskDay = await loadRiskDay(utcDayKey(Date.now()));
      const snaps = await listSnapshots();
      const cards: Record<Asset, DeskCard | null> = { BTC: null, ETH: null, GOLD: null };
      for (const s of snaps) {
        cards[s.asset] = {
          asset: s.asset,
          decision: null,
          bundle: null,
          thesis: await loadThesis(s.asset),
          change: null,
          changeNote: s.changeNote,
          snapshot: s,
          lastObserved: true,
          error: null,
        };
      }
      set({
        storageOk: ok,
        profile,
        riskDay,
        missions: await listMissions(),
        shadows: await listShadows(),
        signals: await listSignals(),
        events: await listEvents(),
        notes: await listNotes(),
        lifecycle: await listLifecycle(),
        thesis: await loadThesis("BTC"),
        cards,
        lastObserved: snaps.length > 0,
        ready: true,
        nextCloseAt: nextCloseMs(Date.now()),
      });
      void get().scanDesk("open");
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
    const card = get().cards[asset];
    set({
      asset,
      decision: card?.decision ?? null,
      bundle: card?.bundle ?? null,
      thesis: card?.thesis ?? null,
      thesisChange: card?.change ?? null,
      changeNote: card?.changeNote ?? null,
      lastObserved: card?.lastObserved ?? false,
    });
  },

  setFocused: (on) => {
    set({ focused: on });
    if (focusTimer) {
      clearTimeout(focusTimer);
      focusTimer = null;
    }
    if (!on) return;
    const fire = () => {
      const { focused, scanDesk } = get();
      if (!focused) return;
      const when = nextCloseMs(Date.now());
      set({ nextCloseAt: when });
      focusTimer = setTimeout(() => {
        if (get().focused) void scanDesk("15m-close");
        fire();
      }, Math.max(250, when - Date.now() + 400));
    };
    fire();
  },

  scan: async (reason = "manual") => {
    await get().scanDesk(reason);
  },

  scanDesk: async (reason = "manual") => {
    const { profile, riskDay } = get();
    if (!profile || !riskDay) return;
    set({ scanning: true, error: null, now: Date.now(), nextCloseAt: nextCloseMs(Date.now()) });
    const t = Date.now();
    try {
      const results = await Promise.all(
        ASSETS.map(async (asset) => {
          const loaded = await loadTape(asset, t);
          const d = decide({
            bundle: loaded.bundle,
            profile,
            riskDay,
            now: loaded.now,
            accountId: DEFAULT_ACCOUNT_ID,
            corroboration: loaded.corroboration,
          });
          const prev = (await loadThesis(asset)) ?? get().cards[asset]?.thesis ?? null;
          const nextThesis = thesisFrom(d, prev);
          const change = compareThesis(prev, nextThesis);
          nextThesis.change = change;
          nextThesis.changeReason = describeThesisShift(prev, nextThesis);
          d.thesis = nextThesis;
          d.thesisChange = change;
          await saveThesis(nextThesis);
          const note = reason === "15m-close" ? `15m closed · ${nextThesis.changeReason}` : nextThesis.changeReason ?? "";
          const card = cardFrom(d, loaded.bundle, nextThesis, change, note, false);
          if (card.snapshot) await saveSnapshot(card.snapshot);
          const best = d.best;
          if (best?.setupId && d.venue && best.zone && d.family && d.direction && d.instrument) {
            const sid = `${d.asset}|${d.venue}|${best.family}|${best.direction}|${best.setupId}|${ENGINE_VERSION}`;
            const prevSetup = await getSetup(sid);
            await saveSetup({
              id: sid,
              asset: d.asset,
              venue: d.venue,
              instrument: d.instrument,
              family: best.family,
              direction: best.direction,
              zoneOrigin: best.zone.origin,
              zoneLow: best.zone.low,
              zoneHigh: best.zone.high,
              state: prevSetup?.state === "INVALIDATED" ? "INVALIDATED" : d.kind === "RELEASE" ? "CANDIDATE" : best.state,
              createdAt: prevSetup?.createdAt ?? t,
              updatedAt: t,
              barOpen: d.barOpen ?? 0,
              engineVersion: ENGINE_VERSION,
              triggerType: best.triggerType ?? "none",
              invalidation: best.invalidation,
            });
          }
          if (change !== "UNCHANGED") {
            await addEvent({ id: newId("evt"), at: t, type: "thesis", detail: `${asset} ${describeThesisShift(prev, nextThesis)} · ${reason}` });
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
          if (d.signalId) {
            await putSignal({ signalId: d.signalId, decision: d, createdAt: t });
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
              tp2: d.geometry.tp2 ?? d.geometry.tp1,
              tp3: d.geometry.tp3 ?? d.geometry.tp2 ?? d.geometry.tp1,
              family: d.family,
              evidenceGrade: d.evidenceGrade,
              persona: d.persona,
              waitCode: d.waitCode,
              engineVersion: ENGINE_VERSION,
              frozenAt: t,
              status: "open",
              scoredAt: null,
              realizedR: null,
              maeR: null,
              mfeR: null,
            });
          }
          if (loaded.bundle) {
            const later = loaded.bundle.series["15m"].candles;
            const scored = (await listShadows()).map((s) => {
              if (s.venue !== loaded.bundle!.venue || s.symbol !== loaded.bundle!.symbol) return s;
              return scoreShadow(s, later, t);
            });
            for (const s of scored) await saveShadow(s);
          }
          return { asset, card, loaded, d };
        }),
      );

      const cards = { ...get().cards };
      for (const r of results) cards[r.asset] = r.card;
      const focus = get().asset;
      const focused = results.find((r) => r.asset === focus) ?? results[0]!;

      let nextMissions = await listMissions();
      if (focused.loaded.bundle) {
        const later = focused.loaded.bundle.series["15m"].candles;
        const rebuilt: Mission[] = [];
        for (const m of nextMissions) {
          if (m.status !== "open" || m.venue !== focused.loaded.bundle.venue || m.symbol !== focused.loaded.bundle.symbol) {
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
          } else rebuilt.push(m);
        }
        nextMissions = rebuilt;
      }

      set({
        cards,
        bundle: focused.card.bundle,
        decision: focused.card.decision,
        thesis: focused.card.thesis,
        thesisChange: focused.card.change,
        changeNote: focused.card.changeNote,
        lastObserved: false,
        pulse: reason === "15m-close" ? t : get().pulse,
        missions: nextMissions,
        shadows: await listShadows(),
        signals: await listSignals(),
        events: await listEvents(),
        notes: await listNotes(),
        lifecycle: await listLifecycle(),
        riskDay: await loadRiskDay(utcDayKey(t)),
        dataSource: focused.loaded.source,
        scanning: false,
        now: t,
        nextCloseAt: nextCloseMs(t),
      });
    } catch (err) {
      set({ scanning: false, error: err instanceof Error ? err.message : "scan failed" });
    }
  },

  confirmRelease: async () => {
    const { decision } = get();
    if (!decision || decision.kind !== "RELEASE" || !decision.signalId || !decision.geometry || !decision.size?.ok) {
      return;
    }
    if (decision.researchStatus && !decision.researchStatus.actionable) return;
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
      tp2: decision.geometry.tp2 ?? decision.geometry.tp1,
      tp3: decision.geometry.tp3 ?? decision.geometry.tp2 ?? decision.geometry.tp1,
      qty: decision.size.qty,
      riskCash: decision.size.riskCash,
      status: "open",
      confirmedAt: Date.now(),
      closedAt: null,
      realizedR: null,
      note: "unvalidated candidate — manual confirm",
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
      detail: `manual ${decision.userDecision} ${m.symbol} ${m.direction} (unvalidated)`,
    });
    await addLifecycle({
      id: newId("life"),
      at: Date.now(),
      from: "CANDIDATE",
      to: "CONFIRMED",
      reason: "manual confirmation of unvalidated candidate",
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

  addNote: async (body) => {
    const { asset, thesis } = get();
    const n: Note = { id: newId("note"), at: Date.now(), asset, thesisId: thesis?.id ?? thesisIdFor(asset), body };
    await putNote(n);
    set({ notes: await listNotes() });
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
