import type { SupabaseClient } from "@supabase/supabase-js";
import { tapTime } from "./tap-time";
import { validateEdible, validateLoaded } from "./food-counts";

const TOKEN = /^[a-f0-9]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type CountResult = { ok: true } | { ok: false; error: string; notFound?: boolean };

export async function saveEdibleCount(db: SupabaseClient, token: string, edible: number, at?: string): Promise<CountResult> {
  if (!TOKEN.test(token)) return { ok: false, error: "This link isn’t valid.", notFound: true };
  const { data: cp } = await db.from("collection_points").select("id, event_id, active").eq("token", token).maybeSingle();
  if (!cp || !cp.active) return { ok: false, error: "This link isn’t active.", notFound: true };
  const { data: batches } = await db.from("batches").select("qty").eq("event_id", cp.event_id).eq("collection_point_id", cp.id);
  const collected = (batches ?? []).reduce((n, b) => n + b.qty, 0);
  const error = validateEdible(collected, edible);
  if (error) return { ok: false, error };
  const { error: upsertError } = await db.from("edible_counts").upsert({ event_id: cp.event_id, collection_point_id: cp.id, edible_packs: edible, recorded_at: tapTime(at) }, { onConflict: "event_id,collection_point_id" });
  return upsertError ? { ok: false, error: upsertError.message } : { ok: true };
}

export async function saveLoadedPacks(db: SupabaseClient, token: string, tripId: string, loaded: number, at?: string): Promise<CountResult> {
  if (!TOKEN.test(token) || !UUID.test(tripId)) return { ok: false, error: "This bus link or trip isn’t valid.", notFound: true };
  const { data: link } = await db.from("bus_links").select("event_id, bus_id").eq("token", token).maybeSingle();
  if (!link) return { ok: false, error: "This bus link isn’t valid.", notFound: true };
  const { data: trip } = await db.from("trips").select("id, event_id, hub_id, status").eq("id", tripId).eq("event_id", link.event_id).eq("bus_id", link.bus_id).maybeSingle();
  if (!trip) return { ok: false, error: "This trip no longer exists." };
  if (trip.status === "departed") return { ok: true };
  if (trip.status !== "planned" && trip.status !== "loading") return { ok: false, error: "This trip cannot be loaded now." };
  const { data: deliveries } = await db.from("deliveries").select("qty, batch_id").eq("trip_id", trip.id);
  const batchIds = [...new Set((deliveries ?? []).map((d) => d.batch_id))];
  const { data: batches } = await db.from("batches").select("id, collection_point_id").in("id", batchIds.length ? batchIds : ["00000000-0000-0000-0000-000000000000"]);
  const hubId = trip.hub_id;
  const { data: edibleRows } = hubId ? await db.from("edible_counts").select("edible_packs").eq("event_id", trip.event_id).eq("collection_point_id", hubId).maybeSingle() : { data: null };
  const { data: otherTrips } = await db.from("trips").select("loaded_packs").eq("event_id", trip.event_id).eq("hub_id", hubId).neq("id", trip.id);
  const alreadyLoaded = (otherTrips ?? []).reduce((n, t) => n + (t.loaded_packs ?? 0), 0);
  const error = validateLoaded(edibleRows?.edible_packs ?? null, alreadyLoaded, loaded);
  if (error) return { ok: false, error };
  // A trip is planned from one hub; this guards old/manual data from being loaded against another point.
  if (batches?.some((b) => (b.collection_point_id ?? null) !== hubId)) return { ok: false, error: "This trip contains food from another collection point." };
  const { error: updateError } = await db.from("trips").update({ loaded_packs: loaded }).eq("id", trip.id).in("status", ["planned", "loading"]);
  return updateError ? { ok: false, error: updateError.message } : { ok: true };
}
