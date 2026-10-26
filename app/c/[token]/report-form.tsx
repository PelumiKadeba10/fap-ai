"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, Clock } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { newId, queueAdd, queueList, queueRemove, sendReport, type QueuedReport } from "@/lib/offline-queue";
import { submitFood } from "./actions";
import { PhotoInput } from "./photo-input";
import { OfflineSetup } from "@/components/offline-setup";

const FLUSH_EVERY_MS = 20_000;
const INPUT = "min-h-14 w-full rounded-xl border-2 border-ink bg-white px-3 text-lg text-ink placeholder:text-[#6b7480]";

/**
 * The "report food" form. Without JavaScript it is a plain form post to the server action.
 * With JavaScript it sends in the background, and when there is no signal it keeps the report on the phone
 * and sends it by itself when the connection comes back.
 */
export function ReportForm({ token }: { token: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const flushing = useRef(false);
  const stuck = useRef(new Set<string>());
  const [queue, setQueue] = useState<QueuedReport[]>([]);
  const [rejected, setRejected] = useState<Record<string, string>>({});
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [photoKey, setPhotoKey] = useState(0);
  const [discarding, setDiscarding] = useState("");

  const reload = useCallback(() => queueList(token).then(setQueue).catch(() => {}), [token]);

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true;
    try {
      let sent = 0;
      for (const r of await queueList(token)) {
        if (stuck.current.has(r.id)) continue;
        const out = await sendReport(r, true);
        if (out.kind === "sent") {
          await queueRemove(r.id);
          sent++;
        } else if (out.kind === "rejected") {
          stuck.current.add(r.id);
          setRejected((p) => ({ ...p, [r.id]: out.error }));
        } else break; // no signal again: try later, keep the order
      }
      await reload();
      if (sent) {
        setNote(sent === 1 ? "1 saved report was sent." : `${sent} saved reports were sent.`);
        router.refresh();
      }
    } catch {
      // IndexedDB unavailable: nothing is queued, nothing to send.
    } finally {
      flushing.current = false;
    }
  }, [token, reload, router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => { setOnline(true); void flush(); };
    const down = () => setOnline(false);
    const visible = () => { if (document.visibilityState === "visible") void flush(); };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(() => void flush(), FLUSH_EVERY_MS);
    void flush();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(timer);
    };
  }, [flush]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const photo = fd.get("photo");
    const report: QueuedReport = {
      id: newId(), token, food: String(fd.get("food") ?? "").trim(), count: Number(fd.get("count")),
      photo: photo instanceof File && photo.size > 0 ? photo : null, createdAt: Date.now(),
    };
    setBusy(true);
    setError("");
    setNote("");
    try {
      const out = navigator.onLine ? await sendReport(report, false) : ({ kind: "retry" } as const);
      if (out.kind === "rejected") return setError(out.error);
      if (out.kind === "retry") {
        await queueAdd(report);
        await reload();
        setNote("No signal. Saved on this phone: it will be sent by itself when you are back online. Keep this page open or reopen the link.");
      }
      form.current?.reset();
      setPhotoKey((k) => k + 1);
      if (out.kind === "sent") router.push(`/c/${token}?ok=${out.id}${out.photoSkipped ? "&photo=skipped" : ""}`);
    } catch {
      setError("Couldn’t save that on this phone. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function discard(id: string) {
    setDiscarding(id);
    try {
      await queueRemove(id);
      stuck.current.delete(id);
      setRejected((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)));
      await reload();
    } finally { setDiscarding(""); }
  }

  return (
    <>
      <OfflineSetup />
      {!online && (
        <p role="status" className="flex items-start gap-2 rounded-xl border-2 border-warn bg-[#fff6e5] px-4 py-3 text-base font-medium text-[#6b4a08]">
          <CloudOff className="mt-0.5 size-5 shrink-0" aria-hidden />No signal. You can still fill this in. It is saved on this phone and sent when you are back online.
        </p>
      )}
      {note && <p role="status" className="rounded-xl border-2 border-ok bg-[#e9f6ee] px-4 py-3 text-base font-medium text-[#14633a]">{note}</p>}
      {error && <p role="alert" className="rounded-xl border-2 border-crit px-4 py-3 text-base font-medium text-crit">{error}</p>}

      <form ref={form} action={submitFood} onSubmit={onSubmit} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <label htmlFor="food" className="text-lg font-semibold">What did you collect?</label>
        <input id="food" name="food" required maxLength={80} placeholder="e.g. Jollof rice and chicken" className={INPUT} />
        <label htmlFor="count" className="text-lg font-semibold">Number of boxes / cartons</label>
        <input id="count" name="count" type="number" inputMode="numeric" required min={1} max={100000} step={1} placeholder="e.g. 20" className={`${INPUT} font-mono`} />
        <PhotoInput key={photoKey} />
        <button disabled={busy} aria-busy={busy} className="inline-flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-4 text-xl font-semibold text-white active:opacity-80 disabled:opacity-70">
          {busy && <Spinner />}{busy ? "Sending…" : "Send"}
        </button>
      </form>

      {queue.length > 0 && (
        <section aria-labelledby="queued">
          <h2 id="queued" className="text-sm font-semibold tracking-wide text-[#4a525c] uppercase">Saved on this phone, not sent yet</h2>
          <ul className="mt-1">
            {queue.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 border-b border-line py-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{r.count} × {r.food}</p>
                  {rejected[r.id] && <p className="text-sm font-medium text-crit">{rejected[r.id]}</p>}
                </div>
                {rejected[r.id]
                  ? <button type="button" onClick={() => discard(r.id)} disabled={!!discarding} aria-busy={discarding === r.id} className="min-h-11 shrink-0 px-2 text-base font-medium text-[#4a525c] underline underline-offset-4 disabled:opacity-50">{discarding === r.id ? "Discarding…" : "Discard"}</button>
                  : <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-warn"><Clock className="size-4" aria-hidden />Waiting to send</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
