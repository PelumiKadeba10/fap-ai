import { groupStops } from "./trip-status";
import type { DeliveryStatus, TripStatus } from "./types";

export interface HubTotal { hubId: string; recovered: number; delivered: number }

/** Portions recovered and delivered per hub ("none" = food logged without a hub). Only counts approved batches. */
export function hubTotals(
  batches: { id: string; qty: number; review_status?: string; collection_point_id: string | null }[],
  deliveries: { batch_id: string; qty: number; status: DeliveryStatus }[],
): HubTotal[] {
  const hubOf = new Map<string, string>();
  const map = new Map<string, HubTotal>();
  const row = (id: string) => map.get(id) ?? (map.set(id, { hubId: id, recovered: 0, delivered: 0 }), map.get(id)!);
  for (const b of batches) {
    if ((b.review_status ?? "approved") !== "approved") continue;
    const hub = b.collection_point_id || "none";
    hubOf.set(b.id, hub);
    row(hub).recovered += b.qty;
  }
  for (const d of deliveries) if (d.status === "delivered" && hubOf.has(d.batch_id)) row(hubOf.get(d.batch_id)!).delivered += d.qty;
  return [...map.values()].sort((a, b) => b.recovered - a.recovered);
}

export interface BusTotal {
  busId: string;
  trips: number;
  packs: number;
  stops: number;
  /** Share of delivered portions that arrived before their safe time, or null when nothing was delivered. */
  onTimePct: number | null;
}

/** Per bus: trips taken (not cancelled, not still planned), portions and stops delivered, and on-time share. */
export function busTotals(
  trips: { id: string; bus_id: string | null; status: TripStatus }[],
  deliveries: { trip_id: string | null; site_id: string; stop_order: number | null; qty: number; status: DeliveryStatus; delivered_at: string | null; safe_until: string }[],
): BusTotal[] {
  const out: BusTotal[] = [];
  const buses = [...new Set(trips.filter((t) => t.bus_id).map((t) => t.bus_id as string))];
  for (const busId of buses) {
    const mine = trips.filter((t) => t.bus_id === busId && (t.status === "departed" || t.status === "returned"));
    if (!mine.length) continue;
    const done = deliveries.filter((d) => d.status === "delivered" && d.trip_id && mine.some((t) => t.id === d.trip_id));
    const packs = done.reduce((n, d) => n + d.qty, 0);
    const onTime = done.filter((d) => d.delivered_at && new Date(d.delivered_at) <= new Date(d.safe_until)).reduce((n, d) => n + d.qty, 0);
    const stops = mine.reduce((n, t) => n + groupStops(done.filter((d) => d.trip_id === t.id)).length, 0);
    out.push({ busId, trips: mine.length, packs, stops, onTimePct: packs ? Math.round((100 * onTime) / packs) : null });
  }
  return out.sort((a, b) => b.packs - a.packs);
}
