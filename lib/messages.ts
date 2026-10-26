// Messages between the admin panel and the field. Field pages use the service-role client after looking the thread up by its secret token.
import type { SupabaseClient } from "@supabase/supabase-js";
import { findBusLink } from "./bus-trip";

export type Channel = "bus" | "intake";
export type Message = { id: string; event_id: string; channel: Channel; thread_id: string; sender: "admin" | "field"; body: string; read_at: string | null; created_at: string };
export type ThreadRef = { channel: Channel; threadId: string; eventId: string; label: string };

export const MAX_MESSAGE = 1000;
export const isChannel = (v: unknown): v is Channel => v === "bus" || v === "intake";

/** What a field link says it is: the batch submission link ("report") shares its collection point's thread with the food intake link. */
export type FieldChannel = Channel | "report";
export const isFieldChannel = (v: unknown): v is FieldChannel => isChannel(v) || v === "report";

/** The thread behind a field link: a bus link (/b/token), or a collection point's food intake (/i/token) or batch submission (/r/token) link. */
export async function resolveThread(db: SupabaseClient, channel: FieldChannel, token: string): Promise<ThreadRef | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  if (channel === "bus") {
    const link = await findBusLink(db, token);
    if (!link) return null;
    const { data } = await db.from("buses").select("name").eq("id", link.bus_id).maybeSingle<{ name: string }>();
    return { channel, threadId: link.id, eventId: link.event_id, label: data?.name ?? "Bus" };
  }
  const { data } = await db.from("collection_points").select("id, event_id, name, active").eq(channel === "report" ? "token" : "intake_token", token).maybeSingle<{ id: string; event_id: string; name: string; active: boolean }>();
  return data && data.active ? { channel: "intake" as const, threadId: data.id, eventId: data.event_id, label: data.name } : null;
}

export async function listThread(db: SupabaseClient, channel: Channel, threadId: string): Promise<Message[]> {
  const { data } = await db.from("messages").select("*").eq("channel", channel).eq("thread_id", threadId).order("created_at", { ascending: false }).limit(200);
  return ((data ?? []) as Message[]).reverse();
}

export function cleanBody(raw: unknown): string | null {
  const body = String(raw ?? "").trim();
  return body && body.length <= MAX_MESSAGE ? body : null;
}

/** How many coordinator messages the person on this link has not opened yet. */
export async function unreadFromAdmin(db: SupabaseClient, channel: FieldChannel, token: string): Promise<number> {
  const t = await resolveThread(db, channel, token);
  if (!t) return 0;
  const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("channel", t.channel).eq("thread_id", t.threadId).eq("sender", "admin").is("read_at", null);
  return count ?? 0;
}
