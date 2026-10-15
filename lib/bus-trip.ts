// SERVER ONLY helpers for the public /b/<token> page. Pass the service-role client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripStatus } from "./types";

export type BusLinkRow = { id: string; event_id: string; bus_id: string };
export type CurrentTrip = { id: string; status: TripStatus; departed_at: string | null; collection_points: { name: string } | null };

/** The bus link for a secret token, or null. */
export async function findBusLink(db: SupabaseClient, token: string): Promise<BusLinkRow | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const { data } = await db.from("bus_links").select("id, event_id, bus_id").eq("token", token).maybeSingle();
  return (data as BusLinkRow | null) ?? null;
}

/** The bus's current trip in that event: planned, loading or departed, oldest first. */
export async function findCurrentTrip(db: SupabaseClient, link: BusLinkRow): Promise<CurrentTrip | null> {
  const { data } = await db
    .from("trips")
    .select("id, status, departed_at, collection_points(name)")
    .eq("event_id", link.event_id)
    .eq("bus_id", link.bus_id)
    .in("status", ["planned", "loading", "departed"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as unknown as CurrentTrip | null) ?? null;
}
