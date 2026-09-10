import { DB_NAME, DB_VERSION, DEFAULT_ACCOUNT_ID, DEFAULT_EQUITY } from "../domain/constants.ts";
import type {
  Account,
  AwuruEvent,
  LifecycleEvent,
  MarketSnapshot,
  Mission,
  Note,
  Profile,
  RiskDay,
  SetupRecord,
  Shadow,
  StoredSignal,
  Thesis,
} from "../domain/types.ts";

const STORES = ["profile", "accounts", "signals", "missions", "shadows", "risk_days", "events", "thesis", "lifecycle", "setups", "snapshots", "notes"] as const;
type StoreName = (typeof STORES)[number];

function defaultProfile(): Profile {
  const now = Date.now();
  return {
    id: "profile",
    persona: "Orion",
    equity: DEFAULT_EQUITY,
    goalTarget: null,
    goalDeadline: null,
    createdAt: now,
    updatedAt: now,
  };
}

function defaultAccount(): Account {
  return { id: DEFAULT_ACCOUNT_ID, name: "Primary", persona: "Orion", equity: DEFAULT_EQUITY };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const key =
            name === "profile" || name === "thesis" || name === "snapshots"
              ? "id"
              : name === "signals"
                ? "signalId"
                : name === "risk_days"
                  ? "day"
                  : "id";
          db.createObjectStore(name, { keyPath: key });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function put<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
  db.close();
}

async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  const req = tx.objectStore(store).get(key);
  const value = await new Promise<T | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return value;
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  const req = tx.objectStore(store).getAll();
  const value = await new Promise<T[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return value;
}

export async function loadProfile(): Promise<Profile> {
  const existing = await get<Profile>("profile", "profile");
  if (existing) return existing;
  const p = defaultProfile();
  await put("profile", p);
  const acc = await get<Account>("accounts", DEFAULT_ACCOUNT_ID);
  if (!acc) await put("accounts", defaultAccount());
  return p;
}

export async function saveProfile(p: Profile): Promise<void> {
  await put("profile", { ...p, updatedAt: Date.now() });
}

export async function getSignal(id: string): Promise<StoredSignal | undefined> {
  return get<StoredSignal>("signals", id);
}

export async function putSignal(s: StoredSignal): Promise<boolean> {
  const existing = await getSignal(s.signalId);
  if (existing) return false;
  await put("signals", s);
  return true;
}

export async function listSignals(): Promise<StoredSignal[]> {
  const all = await getAll<StoredSignal>("signals");
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function putMission(m: Mission): Promise<void> {
  await put("missions", m);
}

export async function getMissionBySignal(signalId: string): Promise<Mission | undefined> {
  const all = await listMissions();
  return all.find((m) => m.signalId === signalId);
}

export async function listMissions(): Promise<Mission[]> {
  const all = await getAll<Mission>("missions");
  return all.sort((a, b) => b.confirmedAt - a.confirmedAt);
}

export async function putShadow(s: Shadow): Promise<boolean> {
  const existing = await get<Shadow>("shadows", s.id);
  if (existing) return false;
  await put("shadows", s);
  return true;
}

export async function listShadows(): Promise<Shadow[]> {
  const all = await getAll<Shadow>("shadows");
  return all.sort((a, b) => b.frozenAt - a.frozenAt);
}

export async function saveShadow(s: Shadow): Promise<void> {
  await put("shadows", s);
}

export async function loadRiskDay(day: string): Promise<RiskDay> {
  const existing = await get<RiskDay>("risk_days", day);
  if (existing) return existing;
  const empty = { day, realizedR: 0, openR: 0, trades: 0, consecutiveLosses: 0 };
  await put("risk_days", empty);
  return empty;
}

export async function saveRiskDay(day: RiskDay): Promise<void> {
  await put("risk_days", day);
}

export async function addEvent(e: AwuruEvent): Promise<void> {
  await put("events", e);
}

export async function listEvents(): Promise<AwuruEvent[]> {
  const all = await getAll<AwuruEvent>("events");
  return all.sort((a, b) => b.at - a.at);
}

export async function loadThesis(asset?: string): Promise<Thesis | null> {
  if (asset) {
    const keyed = await get<Thesis>("thesis", `thesis:${asset}`);
    if (keyed) return keyed;
  }
  return (await get<Thesis>("thesis", "thesis")) ?? null;
}

export async function saveThesis(t: Thesis): Promise<void> {
  await put("thesis", { ...t, id: t.id || `thesis:${t.asset}` });
}

export async function saveSnapshot(s: MarketSnapshot): Promise<void> {
  await put("snapshots", s);
}

export async function loadSnapshot(asset: string): Promise<MarketSnapshot | undefined> {
  return get<MarketSnapshot>("snapshots", asset);
}

export async function listSnapshots(): Promise<MarketSnapshot[]> {
  return getAll<MarketSnapshot>("snapshots");
}

export async function putNote(n: Note): Promise<void> {
  await put("notes", n);
}

export async function listNotes(): Promise<Note[]> {
  const all = await getAll<Note>("notes");
  return all.sort((a, b) => b.at - a.at);
}

export async function addLifecycle(e: LifecycleEvent): Promise<void> {
  await put("lifecycle", e);
}

export async function listLifecycle(): Promise<LifecycleEvent[]> {
  const all = await getAll<LifecycleEvent>("lifecycle");
  return all.sort((a, b) => b.at - a.at);
}

export async function saveSetup(s: SetupRecord): Promise<void> {
  await put("setups", s);
}

export async function getSetup(id: string): Promise<SetupRecord | undefined> {
  return get<SetupRecord>("setups", id);
}

export async function listSetups(): Promise<SetupRecord[]> {
  return getAll<SetupRecord>("setups");
}

export async function available(): Promise<boolean> {
  return typeof indexedDB !== "undefined";
}
