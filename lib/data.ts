import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { EVENT_COOKIE } from "./event-cookie";
import { foodWaiting } from "./food-waiting";
import { PHOTO_BUCKET } from "./photo";
import { ACTIVE_TRIP } from "./trip-status";
import type { Batch, Bus, BusLink, CollectionPoint, Delivery, EventPlace, EventRow, Pledge, ReviewStatus, Site, Trip, Volunteer } from "./types";
import { foodCountSummary, type FoodCountRow } from "./food-counts";

export type EventSummary = { id: string; name: string; starts_at: string };

/** The selected event (from the cookie), or else the one with the latest start time. */
export async function getActiveEvent(): Promise<EventRow | null> {
  const supabase = await createClient();
  const id = (await cookies()).get(EVENT_COOKIE)?.value;
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const { data } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
    if (data) return data as EventRow;
  }
  const { data } = await supabase.from("events").select("*").order("starts_at", { ascending: false }).limit(1).maybeSingle();
  return (data as EventRow | null) ?? null;
}

export async function getEvents(): Promise<EventSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id, name, starts_at").order("starts_at", { ascending: false });
  return (data ?? []) as EventSummary[];
}

/** Batches for an event, optionally only those with a given review status. */
export async function getBatches(eventId: string, reviewStatus?: ReviewStatus): Promise<Batch[]> {
  const supabase = await createClient();
  let q = supabase.from("batches").select("*").eq("event_id", eventId);
  if (reviewStatus) q = q.eq("review_status", reviewStatus);
  const { data, error } = await q.order("collected_at");
  if (error) throw error;
  return (data ?? []) as Batch[];
}

export async function getCollectionPoints(eventId: string): Promise<CollectionPoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("collection_points").select("*").eq("event_id", eventId).order("created_at");
  if (error) throw error;
  return (data ?? []) as CollectionPoint[];
}

export type EventCounts = { pendingBatches: number; portionsWaiting: number };

/** Waiting work for the nav badges: batches to check on Food intake, and approved portions not yet on a trip. */
export async function getEventCounts(eventId: string): Promise<EventCounts> {
  const supabase = await createClient();
  const [b, d] = await Promise.all([
      supabase.from("batches").select("id, qty, edible_packs, review_status").eq("event_id", eventId),
    supabase.from("deliveries").select("batch_id, qty").eq("event_id", eventId),
  ]);
    const batches = (b.data ?? []) as { id: string; qty: number; edible_packs: number | null; review_status: ReviewStatus }[];
  const deliveries = (d.data ?? []) as { batch_id: string; qty: number }[];
  const w = foodWaiting(batches, deliveries);
  return { pendingBatches: batches.filter((x) => x.review_status === "pending").length, portionsWaiting: w.portions };
}

export async function getSites(): Promise<Site[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sites").select("*").eq("active", true).order("created_at");
  if (error) throw error;
  return (data ?? []) as Site[];
}

export async function getVolunteers(): Promise<Volunteer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("volunteers").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Volunteer[];
}

export async function getDeliveries(eventId: string): Promise<Delivery[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliveries").select("*").eq("event_id", eventId).order("created_at");
  if (error) throw error;
  return (data ?? []) as Delivery[];
}

/** Sum of qty grouped by a key. */
export function sumBy<T>(rows: T[], key: (r: T) => string, qty: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + qty(r));
  return m;
}

/** One-hour signed URLs for batch photos, keyed by batch id. Uses the signed-in coordinator's session (private bucket). */
export async function getPhotoUrls(batches: { id: string; photo_path: string | null }[]): Promise<Record<string, string>> {
  const withPhoto = batches.filter((b) => b.photo_path);
  if (!withPhoto.length) return {};
  const supabase = await createClient();
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(withPhoto.map((b) => b.photo_path!), 3600);
  const out: Record<string, string> = {};
  withPhoto.forEach((b, i) => { const u = data?.[i]; if (u?.signedUrl && !u.error) out[b.id] = u.signedUrl; });
  return out;
}

/** Buses of one event. */
export async function getBuses(eventId: string): Promise<Bus[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("buses").select("*").eq("event_id", eventId).order("name");
  if (error) throw error;
  return (data ?? []) as Bus[];
}

/** The places of one event: each shared site with this event's own "people to feed". Matching and planning read this. */
export async function getEventSites(eventId: string): Promise<EventPlace[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_sites").select("id, people, sites(*)").eq("event_id", eventId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { id: string; people: number; sites: Site | null }[];
  return rows
    .filter((r) => r.sites && r.sites.active)
    .map((r) => ({ ...(r.sites as Site), people: r.people, event_site_id: r.id }))
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
}

/** Gives every bus of the event its link for the event (one per bus per event). Safe to call repeatedly. */
export async function ensureBusLinksForEvent(eventId: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("buses").select("id").eq("event_id", eventId);
  if (!data?.length) return;
  await supabase.from("bus_links").upsert(data.map((b) => ({ event_id: eventId, bus_id: b.id })), { onConflict: "event_id,bus_id", ignoreDuplicates: true });
}

export async function getTrips(eventId: string): Promise<Trip[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("trips").select("*").eq("event_id", eventId).order("created_at");
  if (error) throw error;
  return (data ?? []) as Trip[];
}

/** Buses currently on a planned, loading or departed trip, in any event. */
export async function getBusyBusIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("trips").select("bus_id").in("status", ACTIVE_TRIP).not("bus_id", "is", null);
  return (data ?? []).map((t) => t.bus_id as string);
}

export type EventOverview = { event: EventRow; recovered: number; delivered: number };

/** Every event with its recovered (approved) and delivered portions, in three queries. */
export async function getEventOverview(): Promise<EventOverview[]> {
  const supabase = await createClient();
  const [e, b, d] = await Promise.all([
    supabase.from("events").select("*").order("starts_at", { ascending: false }),
    supabase.from("batches").select("event_id, qty").eq("review_status", "approved"),
    supabase.from("deliveries").select("event_id, qty").eq("status", "delivered"),
  ]);
  const total = (rows: { event_id: string; qty: number }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.event_id, (m.get(r.event_id) ?? 0) + r.qty);
    return m;
  };
  const recovered = total(b.data);
  const delivered = total(d.data);
  return ((e.data ?? []) as EventRow[]).map((event) => ({ event, recovered: recovered.get(event.id) ?? 0, delivered: delivered.get(event.id) ?? 0 }));
}

export async function getBusLinks(eventId: string): Promise<BusLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bus_links").select("*").eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as BusLink[];
}

export async function getPledges(eventId: string): Promise<Pledge[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pledges").select("*").eq("event_id", eventId).order("pickup_from", { nullsFirst: false }).order("created_at");
  if (error) throw error;
  return (data ?? []) as Pledge[];
}

export async function getFoodCountSummary(eventId: string): Promise<FoodCountRow[]> {
  const supabase = await createClient();
    const [b, t, d] = await Promise.all([
      supabase.from("batches").select("id, qty, edible_packs, collection_point_id").eq("event_id", eventId),
    supabase.from("trips").select("hub_id, loaded_packs").eq("event_id", eventId),
    supabase.from("deliveries").select("batch_id, qty, status").eq("event_id", eventId),
  ]);
  return foodCountSummary(b.data ?? [], t.data ?? [], d.data ?? []);
}
