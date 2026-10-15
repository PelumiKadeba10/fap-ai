import { createClient } from "./supabase/server";
import type { Batch, Delivery, EventRow, Site, Volunteer } from "./types";

/** The event currently being run (most recent active one). */
export async function getActiveEvent(): Promise<EventRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as EventRow | null) ?? null;
}

export async function getBatches(eventId: string): Promise<Batch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("batches").select("*").eq("event_id", eventId).order("collected_at");
  if (error) throw error;
  return (data ?? []) as Batch[];
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
