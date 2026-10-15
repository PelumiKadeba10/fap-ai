import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { EVENT_COOKIE } from "./event-cookie";
import type { Batch, Delivery, EventRow, Site, Volunteer } from "./types";

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
