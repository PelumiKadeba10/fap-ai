"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, MapPin, Phone, Timer } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { OfflineBanner, OfflineSetup } from "@/components/offline-setup";
import { enqueueTap, flushTaps, newTapId, removeTap, useOnline, useTapSync, useTaps } from "@/lib/tap-queue";
import { fmtPacks } from "@/lib/cartons";
import { fmtDur, fmtTime, minutesBetween } from "@/lib/format";
import { ATTENTION_MIN } from "@/lib/status";
import { TRIP_STATUS } from "@/lib/trip-status";
import type { DeliveryStatus, TripStatus } from "@/lib/types";
import { busAction } from "./actions";

export type StopView = {
  order: number;
  status: DeliveryStatus;
  safeUntil: string;
  site: { name: string; contact_name: string | null; contact_phone: string | null } | null;
  items: { id: string; qty: number; food: string }[];
};
export type TripView = { id: string; status: TripStatus; tripNo: number | null; departedAt: string | null; hub: string };

const BTN_DARK = "min-h-16 w-full rounded-xl bg-ink px-4 py-4 text-xl font-semibold text-white active:opacity-80 disabled:opacity-70";
const BTN_LINE = "min-h-14 w-full rounded-xl border-2 border-ink bg-white px-4 py-3 text-lg font-semibold text-ink active:opacity-80 disabled:opacity-70";

/**
 * The bus lead's current trip. Buttons work without signal: a tap is saved on the phone, shown straight away
 * (the stop turns green, the next buttons appear) and sent in order when the connection returns, with the time it was tapped.
 */
export function BusTrip({ token, trip, stops, perCarton, busName, nowIso, alert }: {
  token: string; trip: TripView; stops: StopView[]; perCarton: number | null; busName: string; nowIso: string; alert: React.ReactNode;
}) {
  const router = useRouter();
  const online = useOnline();
  const { taps, rejected } = useTaps(token);
  const [discarding, setDiscarding] = useState("");
  async function discard(id: string) { setDiscarding(id); try { await removeTap(id); } finally { setDiscarding(""); } }
  const refresh = useCallback(() => router.refresh(), [router]);
  useTapSync(token, refresh);

  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Show what the waiting taps will do, so the lead can carry on without signal. Taps the server refused are left out.
  const waiting = taps.filter((t) => t.payload.trip === trip.id && !rejected[t.id]);
  let tripStatus = trip.status;
  let returned = false;
  const status = new Map(stops.map((s) => [s.order, s.status]));
  const pending = new Set<number>();
  for (const t of waiting) {
    const stop = Number(t.payload.stop);
    const s = status.get(stop);
    if (t.payload.intent === "depart" && (tripStatus === "planned" || tripStatus === "loading")) {
      tripStatus = "departed";
      for (const [o, st] of status) if (st === "assigned" || st === "picked_up") status.set(o, "on_the_way");
    } else if (t.payload.intent === "delivered" && (s === "on_the_way" || s === "delayed")) {
      status.set(stop, "delivered");
      pending.add(stop);
    } else if (t.payload.intent === "problem" && s === "on_the_way") {
      status.set(stop, "delayed");
      pending.add(stop);
    } else if (t.payload.intent === "return") returned = true;
  }
  const view = stops.map((s) => ({ ...s, status: status.get(s.order)! }));
  const total = view.reduce((n, s) => n + s.items.reduce((m, i) => m + i.qty, 0), 0);
  const doneCount = view.filter((s) => s.status === "delivered").length;
  const next = view.find((s) => s.status !== "delivered");
  const onRoad = tripStatus === "departed";
  const returning = onRoad && view.length > 0 && !next;
  const statusLabel = returned ? "Back at collection point" : returning ? "Returning" : TRIP_STATUS[tripStatus].label;

  return (
    <>
      <OfflineSetup />
      <div>
        <p className="text-base text-[#4a525c]">{busName} · {statusLabel}</p>
        {trip.tripNo && <p className="mt-1 text-lg font-semibold">Trip <span className="font-mono">{trip.tripNo}</span> of today</p>}
        <h1 className="mt-1 text-[28px] leading-tight font-semibold break-words"><span className="font-mono">{fmtPacks(total, perCarton)}</span> from {trip.hub}</h1>
        <p className="mt-2 text-base text-[#4a525c]">{view.length} {view.length === 1 ? "stop" : "stops"}{trip.departedAt && <> · left at <span className="font-mono">{fmtTime(trip.departedAt)}</span></>}</p>
      </div>

      {alert}
      {!online && <OfflineBanner>No signal. Keep tapping as normal: your taps are saved on this phone and sent when you are back online.</OfflineBanner>}
      {(taps.length > 0) && (
        <section aria-labelledby="waiting" className="rounded-xl border-2 border-warn bg-[#fff6e5] px-4 py-3">
          <h2 id="waiting" className="flex items-center gap-2 text-base font-semibold text-[#6b4a08]"><Clock className="size-5 shrink-0" aria-hidden />Saved on this phone, not sent yet</h2>
          <ul className="mt-1">
            {taps.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-1.5 text-base">
                <span className="min-w-0"><b>{t.label}</b> <span className="font-mono text-sm text-[#4a525c]">{fmtTime(t.at)}</span>{rejected[t.id] && <span className="block text-sm font-medium text-crit">{rejected[t.id]}</span>}</span>
                {rejected[t.id] && <button type="button" onClick={() => discard(t.id)} disabled={!!discarding} aria-busy={discarding === t.id} className="min-h-11 shrink-0 px-2 text-base font-medium text-[#4a525c] underline underline-offset-4 disabled:opacity-50">{discarding === t.id ? "Discarding…" : "Discard"}</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {onRoad && view.length > 0 && (
        <p className="text-lg font-semibold" aria-live="polite">
          {next ? <>Stop <span className="font-mono">{doneCount + 1}</span> of <span className="font-mono">{view.length}</span></> : "All stops done"}
        </p>
      )}

      {(tripStatus === "planned" || tripStatus === "loading") && (
        <TapForm token={token} trip={trip.id} intent="depart" loadedDefault={total} label="Left the collection point" className={BTN_DARK} button="Loaded, leaving now">
          <p className="mb-3 text-base text-[#4a525c]">{tripStatus === "loading" ? "Loading at " + trip.hub + "." : "Wait at " + trip.hub + " while the food is loaded."} Tap when the bus is full and moving.</p>
        </TapForm>
      )}

      <ol className="flex flex-col gap-4">
        {view.map((s) => {
          const isNext = onRoad && next?.order === s.order;
          const done = s.status === "delivered";
          const left = minutesBetween(now, s.safeUntil);
          const urgent = !done && left < ATTENTION_MIN;
          return (
            <li key={s.order} aria-current={isNext ? "step" : undefined} className={`rounded-2xl p-4 ${isNext ? "border-[3px] border-ink" : "border border-[#dde2e7]"} ${done ? "bg-soft" : "bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-wide text-[#4a525c] uppercase">{isNext ? "Next stop" : "Stop " + s.order}</p>
                  <p className="mt-0.5 flex items-start gap-1.5 text-2xl leading-tight font-semibold break-words">
                    <MapPin className="mt-1 size-6 shrink-0" aria-hidden />{s.site?.name}
                  </p>
                </div>
                {done && <span className="flex shrink-0 items-center gap-1 text-base font-semibold text-ok"><CheckCircle2 className="size-5" aria-hidden />Delivered</span>}
                {s.status === "delayed" && <span className="flex shrink-0 items-center gap-1 text-base font-semibold text-warn"><AlertTriangle className="size-5" aria-hidden />Problem</span>}
              </div>
              {pending.has(s.order) && <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-warn"><Clock className="size-4" aria-hidden />Saved on this phone, not sent yet</p>}

              <ul className="mt-2 text-lg">
                {s.items.map((i) => <li key={i.id}><span className="font-mono font-semibold">{fmtPacks(i.qty, perCarton)}</span> {i.food}</li>)}
              </ul>

              {!done && (
                <p className={`mt-2 flex items-center gap-2 text-base ${urgent ? "font-semibold text-crit" : "text-[#4a525c]"}`}>
                  {urgent ? <AlertTriangle className="size-5 shrink-0" aria-hidden /> : <Timer className="size-5 shrink-0" aria-hidden />}
                  Safe until <b className="font-mono">{fmtTime(s.safeUntil)}</b> · <span suppressHydrationWarning>{left > 0 ? fmtDur(left) + " left" : fmtDur(-left) + " late"}</span>
                </p>
              )}

              {!done && s.site?.contact_phone && (
                <a href={"tel:" + s.site.contact_phone} className="mt-3 flex min-h-14 items-center gap-3 rounded-xl border-2 border-ink bg-white px-4 py-2 text-ink active:bg-soft">
                  <Phone className="size-6 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm text-[#4a525c]">Tap to call{s.site.contact_name ? " " + s.site.contact_name : ""}</span>
                    <span className="block font-mono text-lg font-semibold">{s.site.contact_phone}</span>
                  </span>
                </a>
              )}

              {onRoad && !done && (
                <div className="mt-3 flex flex-col gap-3">
                  <TapForm token={token} trip={trip.id} intent="delivered" stop={s.order} label={`Delivered: ${s.site?.name ?? "Stop " + s.order}`} className={BTN_DARK} button="Delivered here" />
                  {s.status !== "delayed" && (
                    <TapForm token={token} trip={trip.id} intent="problem" stop={s.order} label={`Problem: ${s.site?.name ?? "Stop " + s.order}`} className={BTN_LINE} button="Problem at this stop" />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {returning && !returned && (
        <>
          <p className="text-lg font-semibold" aria-live="polite">All stops done. Drive back to {trip.hub}.</p>
          <TapForm token={token} trip={trip.id} intent="return" label="Back at collection point" className={BTN_DARK} button="Back at collection point" />
        </>
      )}
      {returned && <p className="text-lg font-semibold" aria-live="polite">Saved. Your next trip will appear here once this is sent.</p>}
      {onRoad && next && <p className="text-sm text-[#4a525c]">“Back at collection point” appears once every stop is delivered.</p>}
    </>
  );
}

/** One bus button. Without JavaScript it is a plain form post; with it, the tap is saved on the phone and sent in the background. */
function TapForm({ token, trip, intent, stop, loadedDefault, label, button, className, children }: {
  token: string; trip: string; intent: string; stop?: number; loadedDefault?: number; label: string; button: string; className: string; children?: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(String(loadedDefault ?? ""));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const loadedPacks = loadedDefault == null ? null : Number(loaded);
      if (loadedDefault != null && (loadedPacks == null || !Number.isInteger(loadedPacks) || loadedPacks < 0)) { setBusy(false); return; }
      if (loadedDefault != null && loadedPacks != null && loadedPacks < loadedDefault && !window.confirm(`You entered ${loadedPacks} packs, below the planned ${loadedDefault}. Leave anyway?`)) { setBusy(false); return; }
      await enqueueTap({
        id: newTapId(), scope: token, endpoint: "/api/b/act", at: new Date().toISOString(), label,
        payload: { token, intent, trip, ...(stop != null ? { stop } : {}), ...(loadedPacks != null ? { loaded: loadedPacks } : {}) },
      });
      if (await flushTaps(token)) router.refresh();
    } catch {
      alertFail();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={busAction} onSubmit={onSubmit}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="trip" value={trip} />
      <input type="hidden" name="intent" value={intent} />
      {stop != null && <input type="hidden" name="stop" value={stop} />}
      {loadedDefault != null && <label className="mb-3 block text-left text-lg font-semibold">Packs loaded<input name="loaded" type="number" inputMode="numeric" min={0} required value={loaded} onChange={(e) => setLoaded(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border-2 border-ink px-3 font-mono text-lg text-ink" /><span className="mt-1 block text-sm font-normal text-[#4a525c]">Planned: {loadedDefault}. A lower number needs confirmation.</span></label>}
      {children}
      <button disabled={busy} aria-busy={busy} className={`${className} inline-flex items-center justify-center gap-2`}>
        {busy && <Spinner />}{busy ? "Sending…" : button}
      </button>
    </form>
  );
}

function alertFail() {
  window.alert("Couldn’t save that tap on this phone. Check your connection and tap again.");
}
