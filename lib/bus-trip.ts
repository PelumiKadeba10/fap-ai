// SERVER ONLY helpers for the public /b/<token> page. Pass the service-role client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripStatus } from "./types";

export type BusLinkRow = { id: string; event_id: string; bus_id: string };
export type CurrentTrip = { id: string; status: TripStatus; trip_no: number | null; departed_at: string | null; collection_points: { name: string } | null };

/** The bus link for a secret token, or null. */
export async function findBusLink(db: SupabaseClient, token: string): Promise<BusLinkRow | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const { data, error } = await db.from("bus_links").select("id, event_id, bus_id").eq("token", token).maybeSingle();
  if (error) console.error("[bus-link] token lookup failed", { tokenSuffix: token.slice(-6), code: error.code, message: error.message, details: error.details, hint: error.hint });
  return (data as BusLinkRow | null) ?? null;
}

/** The bus's current trip in that event: planned, loading or departed, oldest first. */
export async function findCurrentTrip(db: SupabaseClient, link: BusLinkRow): Promise<CurrentTrip | null> {
  const { data } = await db
    .from("trips")
    .select("id, status, trip_no, departed_at, collection_points(name)")
    .eq("event_id", link.event_id)
    .eq("bus_id", link.bus_id)
    .in("status", ["planned", "loading", "departed"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as unknown as CurrentTrip | null) ?? null;
}

/** A specific trip of this bus in this event (any status), or null. */
export async function findTripForBus(db: SupabaseClient, link: BusLinkRow, tripId: string): Promise<CurrentTrip | null> {
  const { data } = await db
    .from("trips")
    .select("id, status, trip_no, departed_at, collection_points(name)")
    .eq("id", tripId)
    .eq("event_id", link.event_id)
    .eq("bus_id", link.bus_id)
    .maybeSingle();
  return (data as unknown as CurrentTrip | null) ?? null;
}

export type EarlierTrip = { id: string; trip_no: number | null; returned_at: string | null; hub: string; packs: number; stops: number };

/** The bus's finished trips in that event, newest first, with what each carried. */
export async function findEarlierTrips(db: SupabaseClient, link: BusLinkRow): Promise<EarlierTrip[]> {
  const { data } = await db
    .from("trips")
    .select("id, trip_no, returned_at, created_at, collection_points(name)")
    .eq("event_id", link.event_id)
    .eq("bus_id", link.bus_id)
    .eq("status", "returned")
    .order("created_at", { ascending: false });
  const trips = (data ?? []) as unknown as { id: string; trip_no: number | null; returned_at: string | null; collection_points: { name: string } | null }[];
  if (!trips.length) return [];
  const { data: rows } = await db.from("deliveries").select("trip_id, qty, stop_order, status").in("trip_id", trips.map((t) => t.id)).eq("status", "delivered");
  const items = (rows ?? []) as { trip_id: string; qty: number; stop_order: number | null }[];
  return trips.map((t) => {
    const mine = items.filter((i) => i.trip_id === t.id);
    return {
      id: t.id, trip_no: t.trip_no, returned_at: t.returned_at, hub: t.collection_points?.name ?? "Collection point",
      packs: mine.reduce((n, i) => n + i.qty, 0), stops: new Set(mine.map((i) => i.stop_order)).size,
    };
  });
}
