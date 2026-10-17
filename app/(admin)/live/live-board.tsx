"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bus as BusIcon, ChevronRight, ClipboardList, Soup } from "lucide-react";
import type { Batch, Bus, BusLink, CollectionPoint, Delivery, DeliveryStatus, Site, Trip } from "@/lib/types";
import { ATTENTION_MIN, STATUS } from "@/lib/status";
import { ACTIVE_TRIP, freeBuses, groupStops, stopAlerts } from "@/lib/trip-status";
import { waitingByHub } from "@/lib/food-waiting";
import { fmtTime, n0 } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { setStopStatusAsStaff, setTripBus, setTripStatusAsStaff } from "../actions";
import { EmptyState, Pill, SectionHead, Stat } from "../ui";
import { useToast } from "../toast";
import { useAction } from "../use-action";
import { BusCard } from "./bus-card";

type Update = { id: number; delivery_id: string; status: string; note: string | null; created_at: string };

const RANK: Record<string, number> = { departed: 0, loading: 1, planned: 2 };

export function LiveBoard({ eventId, trips, buses, busLinks, hubs, deliveries, batches, sites, updates, siteUrl }: {
  eventId: string; trips: Trip[]; buses: Bus[]; busLinks: Pick<BusLink, "bus_id" | "token">[]; hubs: Pick<CollectionPoint, "id" | "name" | "volunteers" | "lead_name">[]; deliveries: Delivery[];
  batches: Batch[]; sites: Site[]; updates: Update[]; siteUrl: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());
  const [copied, setCopied] = useState("");
  const { pending, busy, run } = useAction();
  const [origin, setOrigin] = useState(siteUrl);
  useEffect(() => { if (!siteUrl) setOrigin(window.location.origin); }, [siteUrl]);

  // Realtime: any change to this event's trips or deliveries reloads the board's data.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`live-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `event_id=eq.${eventId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "trips", filter: `event_id=eq.${eventId}` }, () => router.refresh())
      .subscribe();
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [eventId, router]);


  const batchById = new Map(batches.map((b) => [b.id, b]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const busById = new Map(buses.map((b) => [b.id, b]));
  const hubById = new Map(hubs.map((h) => [h.id, h.name]));
  const hubVolunteers = (id: string) => { const v = hubs.find((h) => h.id === id)?.volunteers; return v == null ? "" : `${v} ${v === 1 ? "volunteer" : "volunteers"} · `; };
  const hubName = (id: string | null) => (id ? hubById.get(id) ?? "Collection point" : "No collection point");

  const tripDeliveries = (t: Trip) => deliveries.filter((d) => d.trip_id === t.id);
  const stopsOf = (t: Trip) => groupStops(tripDeliveries(t));

  const live = trips.filter((t) => t.status !== "cancelled");
  const free = freeBuses(buses, trips);
  const planned = deliveries.filter((d) => d.trip_id).reduce((t, d) => t + d.qty, 0);
  const done = deliveries.filter((d) => d.trip_id && d.status === "delivered").reduce((t, d) => t + d.qty, 0);
  const attention = live.filter((t) => ACTIVE_TRIP.includes(t.status)).reduce((n, t) => n + stopAlerts(stopsOf(t), now, ATTENTION_MIN).length, 0);

  // One group per trip: every trip that is still running first, then free buses, then finished trips.
  const activeBuses = buses.filter((b) => b.active);
  const running = live.filter((t) => ACTIVE_TRIP.includes(t.status)).sort((a, b) => (RANK[a.status] - RANK[b.status]) || (a.created_at < b.created_at ? -1 : 1));
  const finished = live.filter((t) => t.status === "returned").sort((a, b) => ((b.returned_at ?? b.created_at) < (a.returned_at ?? a.created_at) ? -1 : 1));
  const idleBuses = activeBuses.filter((b) => !running.some((t) => t.bus_id === b.id));

  const waiting = waitingByHub(batches, deliveries);
  const waitingHubs = Object.entries(waiting).sort((a, b) => b[1].portions - a[1].portions);
  const loadable = new Set(live.filter((t) => t.status === "planned" || t.status === "loading").map((t) => t.hub_id ?? "none"));

  // One link per bus for the whole event.
  const linkFor = (busId: string | null) => {
    const l = busId ? busLinks.find((x) => x.bus_id === busId) : null;
    return l ? `${origin}/b/${l.token}` : null;
  };

  async function copy(t: Trip, url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(t.id); setTimeout(() => setCopied(""), 1500); toast(true, "Link copied"); } catch { toast(false, "Couldn’t copy. Long-press the link instead."); }
  }

  const deliveryTrip = new Map(deliveries.map((d) => [d.id, d]));

  const card = (trip: Trip) => {
    const bus = trip.bus_id ? busById.get(trip.bus_id) ?? null : null;
    return (
      <BusCard
        key={trip.id} trip={trip} bus={bus} hubName={hubName(trip.hub_id)} stops={stopsOf(trip)} now={now}
        foodName={(id) => batchById.get(id)?.food ?? "Food"} siteName={(id) => siteById.get(id)?.name ?? "Site"}
        pickable={[...free, ...(bus && !free.some((f) => f.id === bus.id) ? [bus] : [])]}
        link={linkFor(trip.bus_id)} copied={copied === trip.id} busy={pending} isBusy={(k) => busy(trip.id + "|" + k)}
        onCopy={() => { const u = linkFor(trip.bus_id); if (u) copy(trip, u); }}
        onBus={(id) => run(trip.id + "|bus", () => setTripBus(trip.id, id))}
        onTripStatus={(to) => run(trip.id + "|status:" + to, () => setTripStatusAsStaff(trip.id, to))}
        onStop={(order, to) => run(trip.id + "|stop:" + order + ":" + to, () => setStopStatusAsStaff(trip.id, order, to))}
      />
    );
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-x-5 gap-y-6 md:grid-cols-4">
        <Stat label="Packs delivered" value={n0(done)} hint={`of ${n0(planned)} planned`} />
        <Stat label="Buses out" value={String(live.filter((t) => t.status === "departed").length)} hint="on the road" />
        <Stat label="Buses free" value={String(free.length)} hint={free.length ? free.map((b) => b.name).join(", ") : "none right now"} />
        <Stat label="Stops needing attention" value={String(attention)} tone={attention ? "red" : "green"} hint={attention ? "problem or near safe time" : "all on track"} />
      </div>

      <section className="flex flex-col gap-3" aria-label="Food waiting per collection point">
        <SectionHead title="Food waiting per collection point" aside="approved food not yet on a trip" />
        {waitingHubs.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting. Everything checked so far is on a trip.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-8 gap-y-3">
            {waitingHubs.map(([id, w]) => (
              <li key={id} className="flex flex-col gap-1">
                <span className="flex items-baseline gap-2"><Soup className="size-4 self-center text-muted" aria-hidden /><b className="font-semibold">{id === "none" ? "No collection point" : hubName(id)}</b><span className="font-mono text-sm">{hubVolunteers(id)}{n0(w.portions)} packs waiting · {w.batches} {w.batches === 1 ? "batch" : "batches"}</span></span>
                {loadable.has(id) && <Link className="link self-start" href={`/trips/load?hub=${id}`}><ClipboardList className="mr-1 inline size-3.5" aria-hidden />Show all loading lists for {id === "none" ? "No collection point" : hubName(id)}</Link>}
              </li>
            ))}
          </ul>
        )}
        {free.length > 0 && waitingHubs.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 border-orange bg-[#fffaf0] px-4 py-3 text-[15px] font-medium" role="status">
            <span>{free[0].name} is free and {waitingHubs[0][0] === "none" ? "there" : hubName(waitingHubs[0][0])} has <span className="font-mono">{n0(waitingHubs[0][1].portions)}</span> portions waiting.</span>
            <Link href="/match" className="underline underline-offset-4">Plan trips</Link>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionHead title="Buses" aside={<>Updated {fmtTime(now)} · refreshes live · <Link href="/setup" className="underline underline-offset-4">Manage buses</Link></>} />
        {running.length === 0 && idleBuses.length === 0 && finished.length === 0 ? (
          <EmptyState icon={BusIcon} action={<Link href="/setup">Manage buses</Link>}>No buses or trips yet. Add buses in Setup, then plan trips.</EmptyState>
        ) : (
          <>
          <div className="grid gap-4 lg:grid-cols-2">
            {running.map((trip) => card(trip))}
            {idleBuses.map((bus) => {
              const last = live.filter((t) => t.bus_id === bus.id && t.status === "returned").sort((a, b) => ((b.returned_at ?? "") < (a.returned_at ?? "") ? -1 : 1))[0];
              return (
                <article key={bus.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">{bus.name}</h3>
                    <p className="text-sm text-muted">Capacity <span className="font-mono">{bus.capacity}</span> packs{bus.lead_name ? ` · ${bus.lead_name}` : ""}{last?.returned_at ? <> · back at <span className="font-mono">{fmtTime(last.returned_at)}</span></> : ""}</p>
                  </div>
                  <Pill tone="green">Free</Pill>
                </article>
              );
            })}
          </div>
          {finished.length > 0 && (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
                Finished trips <span className="font-mono text-muted">({finished.length})</span>
              </summary>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">{finished.map((trip) => card(trip))}</div>
            </details>
          )}
          </>
        )}
      </section>

      <div>
        <section className="flex flex-col gap-4">
          <SectionHead title="Latest updates" />
          {updates.length === 0 ? <p className="text-sm text-muted">No updates yet.</p> : (
            <ol className="flex max-h-80 flex-col overflow-auto border-l border-line pl-4 text-sm">
              {updates.map((u) => {
                const d = deliveryTrip.get(u.delivery_id);
                const trip = d?.trip_id ? trips.find((t) => t.id === d.trip_id) : null;
                const who = trip ? (trip.bus_id ? busById.get(trip.bus_id)?.name : null) ?? "Bus" : "Bus";
                return (
                  <li key={u.id} className="relative pb-3.5">
                    <span className="absolute top-[7px] -left-[20.5px] size-2 rounded-full bg-[#b3bac2] ring-4 ring-white" aria-hidden />
                    <time className="font-mono text-xs text-muted">{fmtTime(u.created_at)}</time>
                    <p><b className="font-medium">{who}</b> · {STATUS[u.status as DeliveryStatus]?.label ?? u.status}</p>
                    <p className="text-[13px] text-muted">{d ? `${d.qty} to ${siteById.get(d.site_id)?.name}` : ""}{u.note ? ` (${u.note})` : ""}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

    </>
  );
}
