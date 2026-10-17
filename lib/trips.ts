import { AVG_SPEED_KMH, sitePosition, type Allocation } from "./match";
import type { Direction } from "./types";

/** Minutes a bus spends at each stop before driving on. */
export const STOP_MINUTES = 10;
/** A stop whose food has less than this many spare minutes is "urgent" and goes first. */
export const URGENT_SPARE_MIN = 45;
/** Used when there are no active buses to read a capacity from. */
export const DEFAULT_BUS_CAPACITY = 400;
/** Hub key for food logged without a hub. */
export const NO_HUB = "none";
const ROAD_FACTOR = 1.3; // same as sitePosition's default

export interface TripStop {
  siteId: string;
  items: { batchId: string; qty: number }[];
  /** 1-based position in the trip. */
  order: number;
  /** Minutes after leaving the hub that the bus arrives. */
  etaMin: number;
  /** Minutes between arrival and the earliest safe time of the food at this stop. Negative = too late. */
  spareMin: number;
}

export interface PlannedTrip {
  hubId: string;
  totalQty: number;
  stops: TripStop[];
}

type PlanSite = { id: string; km: number; direction: Direction };
type PlanAlloc = Pick<Allocation, "batchId" | "siteId" | "qty" | "km" | "spareMin">;

const pos = (s: PlanSite | undefined, km: number) => (s ? sitePosition(Number(s.km), s.direction) : sitePosition(km, "N"));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Turns matched allocations into bus trips.
 * - Allocations are grouped by the hub their batch sits in; a trip never mixes hubs.
 * - Within a hub, most urgent food first (lowest spare time), then first-fit into trips of at most `capacity`.
 *   An allocation is only split when it alone exceeds the capacity.
 * - Stops in a trip: same site merged; stops carrying urgent food (spare < 45 min) first, the rest by
 *   nearest neighbour. Every hub is treated as the venue origin (0,0).
 * - ETAs use the average speed plus 10 minutes at each stop.
 */
export function planTrips(allocations: PlanAlloc[], batchHub: Record<string, string | null | undefined>, sites: PlanSite[], capacity: number): PlannedTrip[] {
  const cap = Math.max(1, Math.floor(capacity));
  const siteById = new Map(sites.map((s) => [s.id, s]));

  const byHub = new Map<string, PlanAlloc[]>();
  for (const a of allocations) {
    const hub = batchHub[a.batchId] || NO_HUB;
    byHub.set(hub, [...(byHub.get(hub) ?? []), a]);
  }
  // Hub with the most food first.
  const hubs = [...byHub.entries()].sort((x, y) => sum(y[1]) - sum(x[1]));

  const trips: PlannedTrip[] = [];
  for (const [hubId, allocs] of hubs) {
    const bins: { qty: number; allocs: PlanAlloc[] }[] = [];
    for (const a of [...allocs].sort((p, q) => p.spareMin - q.spareMin)) {
      let rest = a.qty;
      while (rest > cap) { bins.push({ qty: cap, allocs: [{ ...a, qty: cap }] }); rest -= cap; }
      if (rest <= 0) continue;
      const bin = bins.find((b) => b.qty + rest <= cap);
      if (bin) { bin.qty += rest; bin.allocs.push({ ...a, qty: rest }); }
      else bins.push({ qty: rest, allocs: [{ ...a, qty: rest }] });
    }
    for (const bin of bins) trips.push({ hubId, totalQty: bin.qty, stops: orderStops(bin.allocs, siteById) });
  }
  return trips;
}

const sum = (a: PlanAlloc[]) => a.reduce((t, x) => t + x.qty, 0);

function orderStops(allocs: PlanAlloc[], siteById: Map<string, PlanSite>): TripStop[] {
  // Merge allocations to the same site into one stop, and the same batch into one item.
  const merged = new Map<string, { siteId: string; km: number; items: Map<string, number>; urgent: boolean; safeMin: number }>();
  for (const a of allocs) {
    const m = merged.get(a.siteId) ?? { siteId: a.siteId, km: a.km, items: new Map(), urgent: false, safeMin: Infinity };
    m.items.set(a.batchId, (m.items.get(a.batchId) ?? 0) + a.qty);
    if (a.spareMin < URGENT_SPARE_MIN) m.urgent = true;
    // Minutes from now until this food is no longer safe = spare time + the direct drive time.
    m.safeMin = Math.min(m.safeMin, a.spareMin + (a.km / AVG_SPEED_KMH) * 60);
    merged.set(a.siteId, m);
  }
  const stops = [...merged.values()].map((m) => ({ ...m, at: pos(siteById.get(m.siteId), m.km) }));

  const origin = { x: 0, y: 0 };
  const nearestFirst = (list: typeof stops, from: { x: number; y: number }) => {
    const left = [...list];
    const out: typeof stops = [];
    let cur = from;
    while (left.length) {
      let bi = 0;
      for (let i = 1; i < left.length; i++) if (dist(cur, left[i].at) < dist(cur, left[bi].at)) bi = i;
      const [next] = left.splice(bi, 1);
      out.push(next);
      cur = next.at;
    }
    return out;
  };
  const urgent = nearestFirst(stops.filter((s) => s.urgent), origin);
  const rest = nearestFirst(stops.filter((s) => !s.urgent), urgent.length ? urgent[urgent.length - 1].at : origin);

  let t = 0;
  let cur = origin;
  return [...urgent, ...rest].map((s, i) => {
    t += ((dist(cur, s.at) * ROAD_FACTOR) / AVG_SPEED_KMH) * 60;
    const stop: TripStop = {
      siteId: s.siteId,
      items: [...s.items.entries()].map(([batchId, qty]) => ({ batchId, qty })),
      order: i + 1,
      etaMin: Math.round(t),
      spareMin: Math.round(s.safeMin - t),
    };
    t += STOP_MINUTES;
    cur = s.at;
    return stop;
  });
}

/**
 * Suggests a free bus for each trip, aligned with the input order. The hub with the most food
 * waiting gets the first free bus. Trips left without a bus get null.
 */
export function suggestBuses(trips: { hubId: string; totalQty: number }[], freeBusIds: string[]): (string | null)[] {
  const hubTotal = new Map<string, number>();
  for (const t of trips) hubTotal.set(t.hubId, (hubTotal.get(t.hubId) ?? 0) + t.totalQty);
  const order = trips.map((t, i) => i).sort((a, b) => (hubTotal.get(trips[b].hubId)! - hubTotal.get(trips[a].hubId)!) || a - b);
  const out: (string | null)[] = trips.map(() => null);
  order.forEach((tripIndex, n) => { out[tripIndex] = freeBusIds[n] ?? null; });
  return out;
}

/** Capacity to plan with: the smallest active bus, so every trip fits any bus. */
export function defaultCapacity(buses: { capacity: number; active: boolean }[]): number {
  const caps = buses.filter((b) => b.active).map((b) => b.capacity);
  return caps.length ? Math.min(...caps) : DEFAULT_BUS_CAPACITY;
}

/**
 * Keeps only as many trips as there are free buses. The trips with the least spare time at their tightest stop
 * are kept (most urgent first); the rest stay waiting for the next free bus. Order of the kept trips is unchanged.
 */
export function limitToFreeBuses<T extends { stops: { spareMin: number }[] }>(trips: T[], freeBusCount: number): T[] {
  if (freeBusCount >= trips.length) return trips;
  const tight = (t: T) => (t.stops.length ? Math.min(...t.stops.map((s) => s.spareMin)) : Infinity);
  const keep = new Set(trips.map((t, i) => i).sort((a, b) => tight(trips[a]) - tight(trips[b]) || a - b).slice(0, Math.max(0, freeBusCount)));
  return trips.filter((_, i) => keep.has(i));
}
