"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bus as BusIcon, ClipboardList, Soup } from "lucide-react";
import type { Batch, Bus, BusLink, CollectionPoint, Delivery, DeliveryStatus, Site, Trip } from "@/lib/types";
import { ATTENTION_MIN, STATUS } from "@/lib/status";
import { ACTIVE_TRIP, freeBuses, groupStops, stopAlerts } from "@/lib/trip-status";
import { waitingByHub } from "@/lib/food-waiting";
import { fmtTime, n0 } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { setStopStatusAsStaff, setTripBus, setTripStatusAsStaff } from "../actions";
import { EmptyState, Pill, SectionHead, Stat } from "../ui";
import { useToast } from "../toast";
import { BusCard } from "./bus-card";

type Update = { id: number; delivery_id: string; status: string; note: string | null; created_at: string };

const RANK: Record<string, number> = { departed: 0, loading: 1, planned: 2, free: 3, returned: 4 };

export function LiveBoard({ eventId, trips, buses, busLinks, hubs, deliveries, batches, sites, updates, siteUrl }: {
  eventId: string; trips: Trip[]; buses: Bus[]; busLinks: Pick<BusLink, "bus_id" | "token">[]; hubs: Pick<CollectionPoint, "id" | "name">[]; deliveries: Delivery[];
  batches: Batch[]; sites: Site[]; updates: Update[]; siteUrl: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());
  const [copied, setCopied] = useState("");
  const [pending, start] = useTransition();
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

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) toast(false, r.error ?? "Something went wrong."); });

  const batchById = new Map(batches.map((b) => [b.id, b]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const busById = new Map(buses.map((b) => [b.id, b]));
  const hubById = new Map(hubs.map((h) => [h.id, h.name]));
  const hubName = (id: string | null) => (id ? hubById.get(id) ?? "Collection point" : "No collection point");

  const tripDeliveries = (t: Trip) => deliveries.filter((d) => d.trip_id === t.id);
  const stopsOf = (t: Trip) => groupStops(tripDeliveries(t));

  const live = trips.filter((t) => t.status !== "cancelled");
  const free = freeBuses(buses, trips);
  const planned = deliveries.filter((d) => d.trip_id).reduce((t, d) => t + d.qty, 0);
  const done = deliveries.filter((d) => d.trip_id && d.status === "delivered").reduce((t, d) => t + d.qty, 0);
  const attention = live.filter((t) => ACTIVE_TRIP.includes(t.status)).reduce((n, t) => n + stopAlerts(stopsOf(t), now, ATTENTION_MIN).length, 0);

  // One card per active bus (its current trip), plus trips that have no bus yet.
  const activeBuses = buses.filter((b) => b.active);
  const currentOf = (b: Bus) => {
    const mine = live.filter((t) => t.bus_id === b.id);
    return mine.find((t) => ACTIVE_TRIP.includes(t.status)) ?? [...mine].reverse()[0] ?? null;
  };
  const shown = new Set<string>();
  const cards: { key: string; bus: Bus | null; trip: Trip | null }[] = activeBuses.map((b) => { const t = currentOf(b); if (t) shown.add(t.id); return { key: b.id, bus: b, trip: t }; });
  for (const t of live) if (ACTIVE_TRIP.includes(t.status) && !shown.has(t.id)) cards.push({ key: t.id, bus: t.bus_id ? busById.get(t.bus_id) ?? null : null, trip: t });
  cards.sort((a, b) => RANK[a.trip?.status ?? "free"] - RANK[b.trip?.status ?? "free"]);

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
                <span className="flex items-baseline gap-2"><Soup className="size-4 self-center text-muted" aria-hidden /><b className="font-semibold">{id === "none" ? "No collection point" : hubName(id)}</b><span className="font-mono text-sm">{n0(w.portions)} portions · {w.batches} {w.batches === 1 ? "batch" : "batches"}</span></span>
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
        {cards.length === 0 ? (
          <EmptyState icon={BusIcon} action={<Link href="/setup">Manage buses</Link>}>No buses or trips yet. Add buses in Setup, then plan trips.</EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {cards.map(({ key, bus, trip }) => trip ? (
              <BusCard
                key={key} trip={trip} bus={bus} hubName={hubName(trip.hub_id)} stops={stopsOf(trip)} now={now}
                foodName={(id) => batchById.get(id)?.food ?? "Food"} siteName={(id) => siteById.get(id)?.name ?? "Site"}
                pickable={[...free, ...(bus && !free.some((f) => f.id === bus.id) ? [bus] : [])]}
                link={linkFor(trip.bus_id)} copied={copied === trip.id} busy={pending}
                onCopy={() => { const u = linkFor(trip.bus_id); if (u) copy(trip, u); }}
                onBus={(id) => run(() => setTripBus(trip.id, id))}
                onTripStatus={(to) => run(() => setTripStatusAsStaff(trip.id, to))}
                onStop={(order, to) => run(() => setStopStatusAsStaff(trip.id, order, to))}
              />
            ) : (
              <article key={key} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
                <div>
                  <h3 className="text-base font-semibold">{bus?.name}</h3>
                  <p className="text-sm text-muted">Capacity <span className="font-mono">{bus?.capacity}</span> packs{bus?.lead_name ? ` · ${bus.lead_name}` : ""}</p>
                </div>
                <Pill tone="green">Free</Pill>
              </article>
            ))}
          </div>
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
