"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Check, ClipboardList, Copy, MessageCircle } from "lucide-react";
import type { Bus, Delivery, Trip, TripStatus } from "@/lib/types";
import { ATTENTION_MIN } from "@/lib/status";
import { TRIP_STATUS, canTripMove, stopAlerts, stopStatus, type Stop } from "@/lib/trip-status";
import { fmtDur, fmtTime, minutesBetween } from "@/lib/format";
import { Spinner } from "@/components/spinner";
import { Pill, StatusPill } from "../ui";

export type BusCardProps = {
  trip: Trip;
  bus: Bus | null;
  hubName: string;
  stops: Stop<Delivery>[];
  foodName: (batchId: string) => string;
  siteName: (siteId: string) => string;
  now: Date;
  /** Free buses (plus this trip's own bus) that can be picked before the trip leaves. */
  pickable: Bus[];
  /** The bus link for this event (one per bus, not per trip); null until a bus is assigned. */
  link: string | null;
  copied: boolean;
  /** True while any update is running (disables the other buttons). */
  busy: boolean;
  /** True while this specific button's update is running. Keys: "bus", "status:<to>", "stop:<order>:<to>". */
  isBusy: (key: string) => boolean;
  onCopy: () => void;
  onBus: (busId: string | null) => void;
  onTripStatus: (to: TripStatus) => void;
  onStop: (order: number, to: "delivered" | "delayed") => void;
};

const ACT = "btn-line min-h-9 px-3 py-1 text-[13px] max-md:min-h-11";

/** One bus's current trip: progress, next stop, alerts and coordinator controls. */
export function BusCard(p: BusCardProps) {
  const { trip, bus, stops, now } = p;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const total = stops.reduce((t, s) => t + s.items.reduce((n, d) => n + d.qty, 0), 0);
  const doneStops = stops.filter((s) => stopStatus(s.items.map((d) => d.status)) === "delivered").length;
  const alerts = ["cancelled", "returned"].includes(trip.status) ? [] : stopAlerts(stops, now, ATTENTION_MIN);
  const next = stops.find((s) => stopStatus(s.items.map((d) => d.status)) !== "delivered");
  const nextLeft = next ? Math.min(...next.items.filter((d) => d.status !== "delivered").map((d) => minutesBetween(now, d.safe_until))) : null;
  const st = TRIP_STATUS[trip.status];
  const headline = trip.status === "loading" ? `Loading at ${p.hubName}` : trip.status === "planned" ? `Planned · load at ${p.hubName}` : trip.status === "departed" ? "On the road" : st.label;
  const canEditBus = trip.status === "planned" || trip.status === "loading";

  // The lead gets the link once for the night; later trips just need a short nudge.
  const phone = (bus?.lead_phone ?? "").replace(/\D/g, "").replace(/^0/, "234");
  const wa = (text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  const whatsapp = p.link ? wa(`FAP: this is your bus link for tonight. Keep it open, your trips appear on it: ${p.link}`) : null;
  const notify = p.link ? wa(`New trip from ${p.hubName}: ${stops.length} ${stops.length === 1 ? "stop" : "stops"}, ${total} packs. Open your bus link: ${p.link}`) : null;
  const waiting = trip.status === "planned" || trip.status === "loading";

  return (
    <article className={`flex flex-col gap-3.5 rounded-xl border border-line p-4 ${alerts.length ? "border-l-4 border-l-crit" : ""}`} aria-label={`${bus?.name ?? "Unassigned"} trip`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{bus?.name ?? "No bus yet"} <span className="font-normal text-muted">· {p.hubName}</span></h3>
          <p className="mt-0.5 text-sm text-muted">{headline} · <span className="font-mono">{total}</span> packs{bus?.lead_name ? ` · ${bus.lead_name}` : ""}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Pill tone={st.tone}>{st.label}</Pill>
          {trip.status === "departed" && trip.departed_at && <span className="font-mono text-xs text-muted">left {fmtDur(minutesBetween(trip.departed_at, now))} ago</span>}
        </div>
      </header>

      {alerts.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Needs attention">
          {alerts.map((a) => (
            <li key={a.siteId}>
              <Pill tone="red" icon={AlertTriangle}>
                {p.siteName(a.siteId)}: {a.kind === "delayed" ? "Problem reported" : a.minutesLeft > 0 ? `${fmtDur(a.minutesLeft)} left` : `${fmtDur(-a.minutesLeft)} late`}
              </Pill>
            </li>
          ))}
        </ul>
      )}

      {trip.status !== "cancelled" && stops.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-medium"><span className="font-mono">{doneStops}</span> of <span className="font-mono">{stops.length}</span> stops</span>
            {next && nextLeft != null && trip.status === "departed" && (
              <span className="text-muted">Next: {p.siteName(next.siteId)} · <span className={`font-mono ${nextLeft < ATTENTION_MIN ? "font-medium text-crit" : ""}`}>{nextLeft > 0 ? `${fmtDur(nextLeft)} left` : `${fmtDur(-nextLeft)} late`}</span></span>
            )}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${doneStops} of ${stops.length} stops delivered`}>
            <i className="block h-full rounded-full bg-ok" style={{ width: `${(100 * doneStops) / stops.length}%` }} />
          </div>
        </div>
      )}

      <ol className="flex flex-col">
        {stops.map((s) => {
          const status = stopStatus(s.items.map((d) => d.status));
          const left = Math.min(...s.items.filter((d) => d.status !== "delivered").map((d) => minutesBetween(now, d.safe_until)));
          const isNext = trip.status === "departed" && next?.order === s.order && next.siteId === s.siteId;
          return (
            <li key={`${s.order}-${s.siteId}`} className={`grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2.5 border-t border-line py-2.5 ${isNext ? "bg-soft -mx-2 px-2" : ""}`}>
              <span className="flex size-6 items-center justify-center rounded-full border border-ink font-mono text-xs font-semibold">{s.order}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-medium">{p.siteName(s.siteId)}</span>
                  <StatusPill status={status} />
                  {status !== "delivered" && Number.isFinite(left) && (
                    <span className={`font-mono text-xs ${left < ATTENTION_MIN ? "font-medium text-crit" : "text-muted"}`}>
                      safe until {fmtTime(s.items.reduce((m, d) => (d.safe_until < m ? d.safe_until : m), s.items[0].safe_until))} · {left > 0 ? `${fmtDur(left)} left` : `${fmtDur(-left)} late`}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-muted">{s.items.map((d) => `${d.qty} ${p.foodName(d.batch_id)}`).join(" + ")}</p>
                {trip.status === "departed" && status !== "delivered" && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <button className={ACT} disabled={p.busy} aria-busy={p.isBusy(`stop:${s.order}:delivered`)} onClick={() => p.onStop(s.order, "delivered")}>{p.isBusy(`stop:${s.order}:delivered`) && <Spinner />}{p.isBusy(`stop:${s.order}:delivered`) ? "Saving…" : "Mark delivered"}</button>
                    {status !== "delayed" && <button className={ACT} disabled={p.busy} aria-busy={p.isBusy(`stop:${s.order}:delayed`)} onClick={() => p.onStop(s.order, "delayed")}>{p.isBusy(`stop:${s.order}:delayed`) && <Spinner />}{p.isBusy(`stop:${s.order}:delayed`) ? "Saving…" : "Flag a problem"}</button>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {canEditBus && (
        <label className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          Bus
          <select className="input w-auto py-1.5 text-sm text-ink max-md:min-h-11" value={trip.bus_id ?? ""} disabled={p.busy} aria-busy={p.isBusy("bus")} onChange={(e) => p.onBus(e.target.value || null)}>
            <option value="">No bus yet</option>
            {p.pickable.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.capacity})</option>)}
          </select>
          {p.isBusy("bus") && <span className="inline-flex items-center gap-1.5 text-xs" role="status"><Spinner className="size-3.5" />Saving…</span>}
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {trip.status !== "cancelled" && trip.status !== "returned" && (
          <>
            {waiting && notify && <a className={`${ACT} !border-ink !bg-ink !text-white hover:!bg-[#2a3038]`} href={notify} target="_blank" rel="noreferrer"><Bell className="size-4" aria-hidden />Notify lead</a>}
            {whatsapp && <a className={ACT} href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle className="size-4" aria-hidden />WhatsApp bus lead</a>}
            {p.link && (
              <button className={ACT} onClick={p.onCopy}>
                {p.copied ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {p.copied ? "Copied" : "Copy bus link"}
              </button>
            )}
          </>
        )}
        <Link className={ACT} href={`/trips/${trip.id}/load`}><ClipboardList className="size-4" aria-hidden />Loading list</Link>
      </div>

      {(["loading", "departed", "returned"] as TripStatus[]).some((to) => canTripMove(trip.status, to)) || canTripMove(trip.status, "cancelled") ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          <span className="text-muted">Coordinator override</span>
          {canTripMove(trip.status, "loading") && <button className="link inline-flex items-center gap-1.5" disabled={p.busy} aria-busy={p.isBusy("status:loading")} onClick={() => p.onTripStatus("loading")}>{p.isBusy("status:loading") && <Spinner className="size-3.5" />}{p.isBusy("status:loading") ? "Saving…" : "Mark loading"}</button>}
          {canTripMove(trip.status, "departed") && <button className="link inline-flex items-center gap-1.5" disabled={p.busy} aria-busy={p.isBusy("status:departed")} onClick={() => p.onTripStatus("departed")}>{p.isBusy("status:departed") && <Spinner className="size-3.5" />}{p.isBusy("status:departed") ? "Saving…" : "Mark departed"}</button>}
          {canTripMove(trip.status, "returned") && <button className="link inline-flex items-center gap-1.5" disabled={p.busy} aria-busy={p.isBusy("status:returned")} onClick={() => p.onTripStatus("returned")}>{p.isBusy("status:returned") && <Spinner className="size-3.5" />}{p.isBusy("status:returned") ? "Saving…" : "Mark returned"}</button>}
          {canTripMove(trip.status, "cancelled") && (confirmCancel ? (
            <span className="flex items-center gap-3">
              <span className="text-crit">Cancel and free the food?</span>
              <button className="link-danger inline-flex items-center gap-1.5" disabled={p.busy} aria-busy={p.isBusy("status:cancelled")} onClick={() => p.onTripStatus("cancelled")}>{p.isBusy("status:cancelled") && <Spinner className="size-3.5" />}{p.isBusy("status:cancelled") ? "Cancelling…" : "Yes, cancel trip"}</button>
              <button className="link" onClick={() => setConfirmCancel(false)}>Keep</button>
            </span>
          ) : <button className="link-danger" onClick={() => setConfirmCancel(true)}>Cancel trip</button>)}
        </div>
      ) : null}
    </article>
  );
}
