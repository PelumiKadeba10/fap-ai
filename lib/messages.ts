// Messages between the admin panel and the field. Field pages use the service-role client after looking the thread up by its secret token.
import type { SupabaseClient } from "@supabase/supabase-js";
import { findBusLink } from "./bus-trip";

export type Channel = "bus" | "intake";
export type Message = { id: string; event_id: string; channel: Channel; thread_id: string; sender: "admin" | "field"; body: string; read_at: string | null; created_at: string };
export type ThreadRef = { channel: Channel; threadId: string; eventId: string; label: string };

export const MAX_MESSAGE = 1000;
export const isChannel = (v: unknown): v is Channel => v === "bus" || v === "intake";

/** The thread behind a field link: a bus link (/b/token) or a collection point's food intake link (/i/token). */
export async function resolveThread(db: SupabaseClient, channel: Channel, token: string): Promise<ThreadRef | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  if (channel === "bus") {
    const link = await findBusLink(db, token);
    if (!link) return null;
    const { data } = await db.from("buses").select("name").eq("id", link.bus_id).maybeSingle<{ name: string }>();
    return { channel, threadId: link.id, eventId: link.event_id, label: data?.name ?? "Bus" };
  }
  const { data } = await db.from("collection_points").select("id, event_id, name, active").eq("intake_token", token).maybeSingle<{ id: string; event_id: string; name: string; active: boolean }>();
  return data && data.active ? { channel, threadId: data.id, eventId: data.event_id, label: data.name } : null;
}

export async function listThread(db: SupabaseClient, channel: Channel, threadId: string): Promise<Message[]> {
  const { data } = await db.from("messages").select("*").eq("channel", channel).eq("thread_id", threadId).order("created_at", { ascending: false }).limit(200);
  return ((data ?? []) as Message[]).reverse();
}

export function cleanBody(raw: unknown): string | null {
  const body = String(raw ?? "").trim();
  return body && body.length <= MAX_MESSAGE ? body : null;
}
