import type { DeliveryStatus, TripStatus } from "./types";

export const TRIP_STATUS: Record<TripStatus, { label: string; tone: "muted" | "blue" | "orange" | "red" | "green" }> = {
  planned: { label: "Planned", tone: "muted" },
  loading: { label: "Loading", tone: "blue" },
  departed: { label: "On the road", tone: "blue" },
  returned: { label: "Returned", tone: "green" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

/** A bus on a trip in one of these statuses is busy. */
export const ACTIVE_TRIP: TripStatus[] = ["planned", "loading", "departed"];

const TRIP_NEXT: Record<TripStatus, TripStatus[]> = {
  planned: ["loading", "departed", "cancelled"],
  loading: ["departed", "cancelled"],
  departed: ["returned"],
  returned: [],
  cancelled: [],
};

export const canTripMove = (from: TripStatus, to: TripStatus) => TRIP_NEXT[from].includes(to);

export interface Stop<T> {
  order: number;
  siteId: string;
  items: T[];
}

/** Groups a trip's deliveries into stops (same stop order and site), in driving order. */
export function groupStops<T extends { site_id: string; stop_order: number | null }>(deliveries: T[]): Stop<T>[] {
  const map = new Map<string, Stop<T>>();
  for (const d of deliveries) {
    const order = d.stop_order ?? 0;
    const key = `${order}:${d.site_id}`;
    const s = map.get(key) ?? { order, siteId: d.site_id, items: [] };
    s.items.push(d);
    map.set(key, s);
  }
  return [...map.values()].sort((a, b) => a.order - b.order);
}

/** One status for a stop: delivered only when every item is; any problem shows first. */
export function stopStatus(statuses: DeliveryStatus[]): DeliveryStatus {
  if (!statuses.length) return "assigned";
  if (statuses.every((s) => s === "delivered")) return "delivered";
  if (statuses.includes("delayed")) return "delayed";
  if (statuses.includes("on_the_way")) return "on_the_way";
  if (statuses.includes("picked_up")) return "picked_up";
  return "assigned";
}

/** Buses that are not on a planned, loading or departed trip. */
export function freeBuses<B extends { id: string; active: boolean }>(buses: B[], trips: { bus_id: string | null; status: TripStatus }[]): B[] {
  const busy = new Set(trips.filter((t) => ACTIVE_TRIP.includes(t.status) && t.bus_id).map((t) => t.bus_id));
  return buses.filter((b) => b.active && !busy.has(b.id));
}

export interface StopAlert {
  siteId: string;
  kind: "delayed" | "time";
  /** Minutes until the earliest undelivered food at this stop stops being safe (negative = already past). */
  minutesLeft: number;
}

/** Stops that need attention: a problem was reported, or the food is within `attentionMin` of its safe time. */
export function stopAlerts<T extends { status: DeliveryStatus; safe_until: string }>(stops: Stop<T>[], now: Date, attentionMin: number): StopAlert[] {
  const out: StopAlert[] = [];
  for (const s of stops) {
    const open = s.items.filter((i) => i.status !== "delivered");
    if (!open.length) continue;
    const minutesLeft = Math.min(...open.map((i) => (new Date(i.safe_until).getTime() - now.getTime()) / 60000));
    if (open.some((i) => i.status === "delayed")) out.push({ siteId: s.siteId, kind: "delayed", minutesLeft });
    else if (minutesLeft < attentionMin) out.push({ siteId: s.siteId, kind: "time", minutesLeft });
  }
  return out;
}
