// BROWSER ONLY: reports saved on the phone until they can be sent. Stored in IndexedDB so they survive closing the tab.

export type QueuedReport = { id: string; token: string; food: string; count: number; edible: number; notes: string; photo: Blob | null; createdAt: number };

const DB = "fap-queue";
const STORE = "reports";

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

export const queueAdd = (r: QueuedReport) => run("readwrite", (s) => s.put(r)).then(() => undefined);
export const queueRemove = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);
export async function queueList(token: string): Promise<QueuedReport[]> {
  const all = await run("readonly", (s) => s.getAll() as IDBRequest<QueuedReport[]>);
  return all.filter((r) => r.token === token).sort((a, b) => a.createdAt - b.createdAt);
}

/** A random id that also works on plain http (crypto.randomUUID needs a secure page). */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type SendOutcome = { kind: "sent"; id: string; photoSkipped: boolean } | { kind: "rejected"; error: string } | { kind: "retry" };

/** Posts one report. "retry" means no connection or a server hiccup: keep it queued. "rejected" means the server said no for good. */
export async function sendReport(r: QueuedReport, queued: boolean): Promise<SendOutcome> {
  const fd = new FormData();
  fd.set("token", r.token);
  fd.set("id", r.id);
  fd.set("food", r.food);
  fd.set("count", String(r.count));
  fd.set("edible", String(r.edible));
  if (r.notes) fd.set("notes", r.notes);
  if (r.photo) fd.set("photo", new File([r.photo], "photo.jpg", { type: r.photo.type }));
  try {
    const res = await fetch("/api/c/submit", { method: "POST", body: fd, headers: queued ? { "x-queued": "1" } : {} });
    if (res.ok) {
      const j = await res.json();
      return { kind: "sent", id: j.id, photoSkipped: !!j.photoSkipped };
    }
    const j = await res.json().catch(() => ({}));
    if (res.status === 429 || res.status >= 500) return { kind: "retry" };
    return { kind: "rejected", error: j.error || "That report was not accepted." };
  } catch {
    return { kind: "retry" };
  }
}
