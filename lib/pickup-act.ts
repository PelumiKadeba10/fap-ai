// SERVER ONLY: confirms pickup quantities from the collection point page.
import type { SupabaseClient } from "@supabase/supabase-js";
import { tapTime } from "./tap-time";

const UUID = /^[0-9a-f-]{36}$/i;
const OPEN = ["pledged", "on_the_way"];
const STALE = "This pick-up was just updated. The list below is up to date.";

export type PickupTap = { token: string; intent: string; pledge: string; packs?: number; note?: string; at?: string };
export type PickupResult = { ok: true } | { ok: false; error: string; notFound?: boolean };

/** Confirms one tent's pickup quantity. It creates no food batch; the lead reports the combined food later. */
export async function applyPickupTap(db: SupabaseClient, t: PickupTap): Promise<PickupResult> {
  if (!/^[a-f0-9]{32}$/.test(t.token)) return { ok: false, error: "This link isn't valid.", notFound: true };
  if (!UUID.test(t.pledge)) return { ok: false, error: "Unknown pick-up." };
  const { data: cp } = await db.from("collection_points").select("id, active").eq("token", t.token).maybeSingle();
  if (!cp || !cp.active) return { ok: false, error: "This link isn't active.", notFound: true };
  const { data: pledge } = await db.from("pledges").select("id, status").eq("id", t.pledge).eq("collection_point_id", cp.id).maybeSingle();
  if (!pledge) return { ok: false, error: "That pick-up isn't on your list." };
  const from = pledge.status as "pledged" | "on_the_way" | "picked_up" | "no_food";
  const note = (t.note ?? "").trim();

  if (t.intent === "on_the_way") {
    if (from !== "pledged") return from === "on_the_way" || from === "picked_up" || from === "no_food" ? { ok: true } : { ok: false, error: STALE };
    const { data } = await db.from("pledges").update({ status: "on_the_way" }).eq("id", t.pledge).eq("status", "pledged").select("id");
    return data?.length ? { ok: true } : { ok: false, error: STALE };
  }
  if (t.intent === "no_food") {
    if (from === "no_food") return { ok: true };
    if (!OPEN.includes(from)) return { ok: false, error: STALE };
    const { data } = await db.from("pledges").update({ status: "no_food", notes: note.slice(0, 200) || undefined }).eq("id", t.pledge).in("status", OPEN).select("id");
    return data?.length ? { ok: true } : { ok: false, error: STALE };
  }
  if (t.intent === "picked_up") {
    const packs = Number(t.packs);
    if (!Number.isInteger(packs) || packs < 1 || packs > 100000) return { ok: false, error: "Enter how many packs were picked up." };
    if (from === "picked_up") return { ok: true };
    if (!OPEN.includes(from)) return { ok: false, error: STALE };
    const at = tapTime(t.at);
    const { data: confirmed } = await db.from("pledges").update({ status: "picked_up", picked_up_at: at, picked_up_packs: packs, notes: note.slice(0, 120) || undefined }).eq("id", t.pledge).in("status", OPEN).select("id");
    return confirmed?.length ? { ok: true } : { ok: false, error: STALE };
  }
  return { ok: false, error: "Unknown action." };
}
