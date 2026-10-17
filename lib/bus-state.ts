import { ACTIVE_TRIP } from "./trip-status";
import type { DeliveryStatus, TripStatus } from "./types";

export type TripPhase = "planned" | "loading" | "on_the_road" | "returning" | "returned" | "cancelled";

/**
 * Where a trip is. "Returning" is a departed trip whose every delivery is delivered:
 * the bus is on its way back and stays busy until the bus lead taps "Back at collection point".
 */
export function tripPhase(status: TripStatus, deliveryStatuses: DeliveryStatus[]): TripPhase {
  if (status !== "departed") return status;
  return deliveryStatuses.length > 0 && deliveryStatuses.every((s) => s === "delivered") ? "returning" : "on_the_road";
}

/**
 * Trip numbers for new trips of buses (1, 2, 3... per bus, in the order given, which is approval order).
 * `existing` are the event's trips already numbered; a trip without a bus gets no number.
 */
export function nextTripNos(existing: { bus_id: string | null; trip_no: number | null }[], newBusIds: (string | null)[]): (number | null)[] {
  const last = new Map<string, number>();
  for (const t of existing) if (t.bus_id && t.trip_no) last.set(t.bus_id, Math.max(last.get(t.bus_id) ?? 0, t.trip_no));
  return newBusIds.map((id) => {
    if (!id) return null;
    const n = (last.get(id) ?? 0) + 1;
    last.set(id, n);
    return n;
  });
}

export interface BusOut {
  busId: string;
  name: string;
  tripNo: number | null;
  phase: TripPhase;
}

/** Active buses that are on a planned, loading, departed or returning trip, with the trip they are on. */
export function busesOut(
  buses: { id: string; name: string; active: boolean }[],
  trips: { id: string; bus_id: string | null; trip_no: number | null; status: TripStatus }[],
  deliveries: { trip_id: string | null; status: DeliveryStatus }[],
): BusOut[] {
  const out: BusOut[] = [];
  for (const b of buses) {
    if (!b.active) continue;
    const t = trips.find((x) => x.bus_id === b.id && ACTIVE_TRIP.includes(x.status));
    if (!t) continue;
    const phase = tripPhase(t.status, deliveries.filter((d) => d.trip_id === t.id).map((d) => d.status));
    out.push({ busId: b.id, name: b.name, tripNo: t.trip_no, phase });
  }
  return out;
}

/** "Bus 1 is out on trip 2 · food waiting will go on the next trip", or null when no bus is out. */
export function outMessage(out: BusOut[]): string | null {
  if (!out.length) return null;
  const parts = out.map((o) => {
    const trip = o.tripNo ? ` trip ${o.tripNo}` : "";
    if (o.phase === "returning") return `${o.name} is returning${o.tripNo ? ` from trip ${o.tripNo}` : ""}`;
    if (o.phase === "planned" || o.phase === "loading") return `${o.name} is loading${o.tripNo ? ` for trip ${o.tripNo}` : ""}`;
    return `${o.name} is out on${trip || " a trip"}`;
  });
  return `${parts.join(", ")} · food waiting will go on the next trip`;
}
