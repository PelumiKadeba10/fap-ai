"use client";
// BROWSER ONLY: button taps made without signal, kept in IndexedDB (they survive closing the tab) and sent in order when the phone is back online.
import { useEffect, useMemo, useSyncExternalStore } from "react";

export type Tap = {
  id: string;
  /** The page's secret token: each page only sees and sends its own taps. */
  scope: string;
  /** Where to POST it, e.g. /api/b/act. */
  endpoint: string;
  /** What the server needs, e.g. { token, intent, trip, stop }. */
  payload: Record<string, string | number>;
  /** When it was tapped (ISO). The server records this, not the time it arrives. */
  at: string;
  /** What the person sees in the waiting list, e.g. "Delivered: Stop 2". */
  label: string;
  createdAt: number;
};

type Snapshot = { taps: Tap[]; rejected: Record<string, string> };

const DB = "fap-taps";
const STORE = "taps";
const EMPTY: Snapshot = { taps: [], rejected: {} };

let snap: Snapshot = EMPTY;
const listeners = new Set<() => void>();
const set = (next: Snapshot) => { snap = next; listeners.forEach((l) => l()); };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => { resolve(req.result); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

async function readAll(): Promise<Tap[]> {
  const all = await run("readonly", (s) => s.getAll() as IDBRequest<Tap[]>);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/** Loads the saved taps from the phone. Call once when a page opens. */
export async function loadTaps() {
  try { set({ ...snap, taps: await readAll() }); } catch { /* IndexedDB unavailable: nothing saved */ }
}

/** Saves a tap and shows it in the waiting list. Throws if the phone refuses to store it. */
export async function enqueueTap(t: Omit<Tap, "createdAt">) {
  await run("readwrite", (s) => s.put({ ...t, createdAt: Date.now() }));
  await loadTaps();
}

export async function removeTap(id: string) {
  await run("readwrite", (s) => s.delete(id));
  const { [id]: _gone, ...rejected } = snap.rejected;
  set({ taps: snap.taps.filter((t) => t.id !== id), rejected });
}

let flushing = false;
let again = false;

/**
 * Sends this page's taps, oldest first. A tap the server refuses stays in the list with its reason (until discarded) and the
 * next ones still go. No signal or a server hiccup stops the run and keeps the order for next time. Returns how many were sent.
 * If a run is already going, it is asked to go round once more (a tap made meanwhile is sent right away) and this call returns 0.
 */
export async function flushTaps(scope: string): Promise<number> {
  if (!navigator.onLine) return 0;
  if (flushing) { again = true; return 0; }
  flushing = true;
  let sent = 0;
  try {
    do {
      again = false;
      for (const t of (await readAll()).filter((x) => x.scope === scope)) {
        if (snap.rejected[t.id]) continue;
        let res: Response;
        try {
          res = await fetch(t.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...t.payload, id: t.id, at: t.at }) });
        } catch {
          again = false;
          break;
        }
        if (res.ok) {
          await removeTap(t.id);
          sent++;
        } else if (res.status === 429 || res.status >= 500) {
          again = false;
          break;
        } else {
          const j = await res.json().catch(() => ({}));
          set({ ...snap, rejected: { ...snap.rejected, [t.id]: j.error || "That wasn’t accepted." } });
        }
      }
    } while (again);
  } catch {
    // IndexedDB unavailable: nothing to send.
  } finally {
    flushing = false;
  }
  await loadTaps();
  return sent;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** This page's waiting taps and any the server refused (id -> reason). */
export function useTaps(scope: string) {
  const s = useSyncExternalStore(subscribe, () => snap, () => EMPTY);
  return useMemo(() => ({ taps: s.taps.filter((t) => t.scope === scope), rejected: s.rejected }), [s, scope]);
}

/** True while the phone has a connection. Starts true so the server and first browser render match. */
export function useOnline() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Keeps a page's queue moving: loads saved taps when it opens, then sends them when the connection returns,
 * when the tab comes back to the front, and every 20 seconds. `onSent` runs after taps went through (refresh the page there).
 */
export function useTapSync(scope: string, onSent: (n: number) => void) {
  useEffect(() => {
    let alive = true;
    const go = async () => { const n = await flushTaps(scope); if (alive && n) onSent(n); };
    void loadTaps().then(go);
    const visible = () => { if (document.visibilityState === "visible") void go(); };
    window.addEventListener("online", go);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(go, 20_000);
    return () => { alive = false; window.removeEventListener("online", go); document.removeEventListener("visibilitychange", visible); clearInterval(timer); };
  }, [scope, onSent]);
}

/** A random id that also works on plain http (crypto.randomUUID needs a secure page). */
export function newTapId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
