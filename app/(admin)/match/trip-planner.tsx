"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bus as BusIcon, CheckCircle2, Loader2, Play, RotateCw, Route, Soup } from "lucide-react";
import type { Batch, Bus, Site } from "@/lib/types";
import { runMatching } from "@/lib/match";
import { urgency } from "@/lib/urgency";
import { fmtDur, fmtTime, n0 } from "@/lib/format";
import { foodWaiting } from "@/lib/food-waiting";
import { NO_HUB, defaultCapacity, limitToFreeBuses, planTrips, suggestBuses } from "@/lib/trips";
import { nextTripNos, outMessage, type BusOut } from "@/lib/bus-state";
import { fmtPacks } from "@/lib/cartons";
import { waitingByHub } from "@/lib/food-waiting";
import { approveTrips } from "../actions";
import { EmptyState, SectionHead, UrgencyPill } from "../ui";
import { useToast } from "../toast";
import { SiteMap } from "./site-map";

type Hub = { id: string; name: string; volunteers: number | null };

const spareTone = (m: number) => (m < 20 ? "text-crit" : m < 45 ? "text-warn" : "text-ok");
const spareWords = (m: number) =>
  m < 0 ? `${fmtDur(-m)} late` : m < 20 ? `${fmtDur(m)} spare · very tight` : m < 45 ? `${fmtDur(m)} spare · tight` : `${fmtDur(m)} spare`;

export function TripPlanner({ batches, sites, hubs, buses, busesOut, tripNumbers, packsPerCarton, sentByBatch, sentBySite, pendingCount, children }: {
  batches: Batch[]; sites: Site[]; hubs: Hub[]; buses: Bus[];
  /** Buses on a planned, loading, departed or returning trip: they are not free for a new trip. */
  busesOut: BusOut[];
  /** The event's existing trips, to number the next trip of each bus. */
  tripNumbers: { bus_id: string | null; trip_no: number | null }[];
  packsPerCarton: number | null;
  sentByBatch: Record<string, number>; sentBySite: Record<string, number>;
  /** Batches from collection links that still need checking on Food intake. */
  pendingCount: number;
  /** Rendered between the food-waiting banner and the trip plan (the sites table). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState<Date | null>(null);
  const [busFor, setBusFor] = useState<(string | null)[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const busyBusIds = busesOut.map((o) => o.busId);
  const activeBuses = buses.filter((b) => b.active);
  const freeBuses = activeBuses.filter((b) => !busyBusIds.includes(b.id));
  // With buses set up, only free ones get a new trip. With none set up, trips are planned without a bus as before.
  const allBusy = activeBuses.length > 0 && freeBuses.length === 0;
  const capacity = defaultCapacity(freeBuses.length ? freeBuses : buses);
  const hubName = (id: string) => (id === NO_HUB ? "No collection point" : hubs.find((h) => h.id === id)?.name ?? "Collection point");
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const waiting = foodWaiting(batches, Object.entries(sentByBatch).map(([batch_id, qty]) => ({ batch_id, qty })));
  const available = waiting.portions;

  const compute = (at: Date) => {
    const matched = runMatching(
      batches.map((b) => ({ id: b.id, category: b.category, collected_at: b.collected_at, available: (b.edible_packs ?? 0) - (sentByBatch[b.id] ?? 0) })),
      sites.map((s) => ({ ...s, km: Number(s.km), alreadyAllocated: sentBySite[s.id] ?? 0 })),
      at,
    );
    const planned = planTrips(
      matched.allocations,
      Object.fromEntries(batches.map((b) => [b.id, b.collection_point_id])),
      sites.map((s) => ({ id: s.id, km: Number(s.km), direction: s.direction })),
      capacity,
    );
    const trips = activeBuses.length ? limitToFreeBuses(planned, freeBuses.length) : planned;
    return { matched, trips, waitingTrips: planned.length - trips.length };
  };
  const plan = useMemo(() => (now ? compute(now) : null), [now, batches, sites, sentByBatch, sentBySite, capacity, activeBuses.length, freeBuses.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function run() {
    const at = new Date();
    setNow(at);
    setBusFor(suggestBuses(compute(at).trips, freeBuses.map((b) => b.id)));
    setConfirming(false);
  }

  function approve() {
    start(async () => {
      const r = await approveTrips(busFor);
      setConfirming(false);
      if (!r.ok) return toast(false, r.error);
      toast(true, `${r.created} ${r.created === 1 ? "trip" : "trips"} created. Use Notify lead on Live to tell each bus lead.`);
      setNow(null);
      router.refresh();
    });
  }

  const trips = plan?.trips ?? [];
  const count = trips.length;
  // Trip numbering restarts for each hub.
  const seen = new Map<string, number>();
  const numbered = trips.map((t, i) => { const n = (seen.get(t.hubId) ?? 0) + 1; seen.set(t.hubId, n); return { t, i, n }; });
  // The number each chosen bus's new trip will get (its 1st, 2nd, 3rd... trip of the event).
  const tripNos = nextTripNos(tripNumbers, trips.map((_, i) => busFor[i] ?? null));
  const outText = allBusy ? outMessage(busesOut) : null;
  const waitingHubs = Object.entries(waitingByHub(batches, Object.entries(sentByBatch).map(([batch_id, qty]) => ({ batch_id, qty })))).sort((a, b) => b[1].portions - a[1].portions);
  const byUrgency = (at: Date) => batches
    .map((b) => ({ b, left: b.qty - (sentByBatch[b.id] ?? 0), u: urgency(b, at) }))
    .filter((x) => x.left > 0)
    .sort((x, y) => y.u.score - x.u.score);

  return (
    <>
      {(waiting.portions > 0 || pendingCount > 0) && (
        <div className="flex flex-col gap-2 border-l-4 border-orange bg-[#fffaf0] px-4 py-3.5" role="status">
          {waiting.portions > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
              <p className="flex items-start gap-2 text-[15px] font-medium">
                <Soup className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>New food waiting: <span className="font-mono">{n0(waiting.portions)}</span> portions in {waiting.batches} {waiting.batches === 1 ? "batch" : "batches"}. Plan trips to send it out.</span>
              </p>
              <button className="btn-dark" onClick={run} disabled={pending || allBusy}><Play className="size-4" aria-hidden />{plan ? "Re-plan trips" : "Plan trips"}</button>
            </div>
          )}
          {pendingCount > 0 && (
            <p className="text-sm text-[#6b4a08]">
              <span className="font-mono">{pendingCount}</span> {pendingCount === 1 ? "batch still needs" : "batches still need"} checking on <Link href="/intake" className="font-medium underline underline-offset-4">Food intake</Link>
            </p>
          )}
        </div>
      )}
      {waitingHubs.length > 0 && (
        <ul className="flex flex-wrap gap-x-8 gap-y-2" aria-label="Food waiting per collection point">
          {waitingHubs.map(([id, w]) => {
            const h = hubs.find((x) => x.id === id);
            return (
              <li key={id} className="text-sm">
                <b className="font-semibold">{hubName(id)}</b>
                {h?.volunteers != null && <> · <span className="font-mono">{h.volunteers}</span> {h.volunteers === 1 ? "volunteer" : "volunteers"}</>}
                {" "}· <span className="font-mono">{n0(w.portions)}</span> packs waiting
              </li>
            );
          })}
        </ul>
      )}
      {outText && (
        <div className="flex flex-col gap-3 border-l-4 border-orange bg-[#fffaf0] px-4 py-3.5" role="status">
          <p className="text-[15px] font-medium">{outText}</p>
          {available > 0 && (
            <>
              <p className="text-sm text-[#6b4a08]">Waiting food, most urgent first:</p>
              <ol className="flex flex-col gap-1.5 text-sm">
                {byUrgency(new Date()).map(({ b, left, u }) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <UrgencyPill level={u.level} />
                    <span><span className="font-mono font-semibold">{fmtPacks(left, packsPerCarton)}</span> {b.food}</span>
                    <span className="text-muted">{b.collection_point_id ? hubName(b.collection_point_id) : "No collection point"} · safe until <span className="font-mono">{fmtTime(u.safeUntil)}</span></span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
      {children}

      <section className="flex flex-col gap-5">
        <SectionHead title="Plan trips" aside={<><span className="font-mono">{n0(available)}</span> portions not yet sent out</>} />
        <div className="grid gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <SiteMap sites={sites} allocations={plan?.matched.allocations ?? []} urgentBatchIds={new Set(batches.filter((b) => urgency(b).level === "high").map((b) => b.id))} />
            <p className="mt-2 text-xs text-muted">Orange lines carry urgent food. Schematic only, not to GPS scale.</p>
          </div>

          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted">
              Each bus loads at one collection point and visits several places. Trips are planned for buses of up to <span className="font-mono">{capacity}</span> packs.
              A new trip is only planned for a free bus. Coordinators approve every plan before bus leads are told.
            </p>
            {plan && plan.waitingTrips > 0 && (
              <p className="text-sm font-medium text-warn" role="status">{plan.waitingTrips} more {plan.waitingTrips === 1 ? "trip" : "trips"} of food will go when a bus is free. The most urgent food is planned first.</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button className={plan ? "btn-line" : "btn-dark"} onClick={run} disabled={!available || pending || allBusy}>
                {plan ? <RotateCw className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                {plan ? "Re-plan trips" : "Plan trips"}
              </button>
              {plan && count > 0 && !confirming && (
                <button className="btn-dark" onClick={() => setConfirming(true)} disabled={pending}>
                  <CheckCircle2 className="size-4" aria-hidden /> Approve trips
                </button>
              )}
            </div>

            {confirming && (
              <div role="alertdialog" aria-labelledby="confirm-t" className="flex flex-col gap-3 rounded-xl border border-ink p-4">
                <div>
                  <p id="confirm-t" className="font-semibold">Create {count} {count === 1 ? "trip" : "trips"}?</p>
                  <p className="mt-0.5 text-sm text-muted">This reserves the food and adds each trip to Live. Bus leads are notified next from Live. Nothing is sent automatically.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <button className="btn-dark" onClick={approve} disabled={pending} aria-busy={pending} autoFocus>
                    {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {pending ? "Creating trips…" : `Yes, create ${count}`}
                  </button>
                  <button className="link" onClick={() => setConfirming(false)} disabled={pending}>Cancel</button>
                </div>
              </div>
            )}

            {plan && plan.matched.sites.length > 0 && (
              <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                {plan.matched.sites.map((s) => {
                  const got = (sentBySite[s.id] ?? 0) + plan.matched.allocations.filter((a) => a.siteId === s.id).reduce((t, a) => t + a.qty, 0);
                  const pct = Math.min(100, Math.round((100 * got) / s.need));
                  return (
                    <div key={s.id}>
                      <div className="flex justify-between gap-2 text-[13px]"><b className="font-semibold">{siteById.get(s.id)?.name}</b><span className="font-mono">{got} / {s.need}</span></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${pct}% of need met`}><i className={`block h-full rounded-full ${pct >= 100 ? "bg-ok" : "bg-sky"}`} style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {plan && (count === 0 ? (
          <EmptyState icon={Route}>Nothing to allocate: either no food is waiting or every site’s need is already met.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-5">
            {numbered.map(({ t, i, n }) => (
              <li key={i} className="flex flex-col gap-3 border-t border-line pt-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
                  <h3 className="text-base font-semibold">
                    {hubName(t.hubId)} · {busFor[i] ? <>{buses.find((b) => b.id === busFor[i])?.name} · Trip {tripNos[i]}</> : <>Trip {n} · no bus yet</>} · <span className="font-mono">{t.totalQty} / {capacity}</span> packs
                  </h3>
                  <label className="flex items-center gap-2 text-[13px] text-muted">
                    <BusIcon className="size-4" aria-hidden /> Bus
                    <select className="input w-auto py-1.5 text-sm text-ink" value={busFor[i] ?? ""} onChange={(e) => setBusFor((p) => p.map((v, k) => (k === i ? e.target.value || null : v)))}>
                      <option value="">No bus yet</option>
                      {freeBuses.filter((b) => b.id === busFor[i] || !busFor.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name} ({b.capacity})</option>)}
                    </select>
                  </label>
                </div>
                <ol className="flex flex-col">
                  {t.stops.map((s) => {
                    const worstUrgency = s.items.map((it) => urgency(batchById.get(it.batchId)!, now!)).sort((a, b) => b.score - a.score)[0];
                    return (
                      <li key={s.order} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-b border-line py-3 last:border-0 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
                        <span className="flex size-7 items-center justify-center rounded-full bg-ink font-mono text-xs font-semibold text-white" aria-label={`Stop ${s.order}`}>{s.order}</span>
                        <div className="min-w-0">
                          <p className="font-semibold">{siteById.get(s.siteId)?.name}</p>
                          <ul className="mt-0.5 text-sm text-muted">
                            {s.items.map((it) => <li key={it.batchId}><span className="font-mono text-ink">{it.qty}</span> {batchById.get(it.batchId)?.food}</li>)}
                          </ul>
                        </div>
                        <div className="col-start-2 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:col-start-3 sm:mt-0 sm:flex-col sm:items-end sm:gap-0.5">
                          <span className="font-mono">{fmtTime(new Date(now!.getTime() + s.etaMin * 60000))} <span className="text-xs text-muted">(+{fmtDur(s.etaMin)})</span></span>
                          <span className={`font-mono text-[13px] font-medium ${spareTone(s.spareMin)}`}>{spareWords(s.spareMin)}</span>
                          {worstUrgency && <UrgencyPill level={worstUrgency.level} />}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ul>
        ))}
        {plan && plan.matched.leftovers.length > 0 && (
          <p className="text-sm text-muted">{n0(plan.matched.leftovers.reduce((t, l) => t + l.qty, 0))} portions are more than tonight’s known need. Add another site or hold them for a next-morning run.</p>
        )}
      </section>
    </>
  );
}
