import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { EVENT_COOKIE } from "./event-cookie";
import { foodWaiting, type FoodWaiting } from "./food-waiting";
import type { Batch, CollectionPoint, Delivery, EventRow, ReviewStatus, Site, Volunteer } from "./types";

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

/** Approved food not yet in a delivery, plus how many unchecked batches are waiting on Food intake. */
export async function getFoodWaiting(eventId: string): Promise<FoodWaiting & { pending: number }> {
  const supabase = await createClient();
  const [b, d] = await Promise.all([
    supabase.from("batches").select("id, qty, review_status").eq("event_id", eventId),
    supabase.from("deliveries").select("batch_id, qty").eq("event_id", eventId),
  ]);
  const batches = (b.data ?? []) as { id: string; qty: number; review_status: ReviewStatus }[];
  const deliveries = (d.data ?? []) as { batch_id: string; qty: number }[];
  return { ...foodWaiting(batches, deliveries), pending: batches.filter((x) => x.review_status === "pending").length };
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
