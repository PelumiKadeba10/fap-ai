// SERVER ONLY: one button press on a collection point's Pick-ups tab. Shared by the form's server action and /api/c/pickup.
import type { SupabaseClient } from "@supabase/supabase-js";
import { tapTime } from "./tap-time";

const UUID = /^[0-9a-f-]{36}$/i;
const OPEN = ["pledged", "on_the_way"];
const STALE = "This pick-up was just updated. The list below is up to date.";

export type PickupTap = { token: string; intent: string; pledge: string; packs?: number; note?: string; at?: string };
export type PickupResult = { ok: true } | { ok: false; error: string; notFound?: boolean };

/**
 * "On my way", "Picked up" (packs and an optional note) or "No food" for one pledge of this collection point.
 * "Picked up" creates a pending batch so the coordinator checks it like any other food.
 * Repeating a tap that already took effect is not an error, so a phone can safely resend a queued tap.
 * `at` is when it was tapped: stored as the pick-up time.
 */
export async function applyPickupTap(db: SupabaseClient, t: PickupTap): Promise<PickupResult> {
  if (!/^[a-f0-9]{32}$/.test(t.token)) return { ok: false, error: "This link isn’t valid.", notFound: true };
  if (!UUID.test(t.pledge)) return { ok: false, error: "Unknown pick-up." };

  const { data: cp } = await db.from("collection_points").select("id, name, event_id, active").eq("token", t.token).maybeSingle();
  if (!cp || !cp.active) return { ok: false, error: "This link isn’t active.", notFound: true };

  const { data: pledge } = await db.from("pledges").select("id, tent_name, status").eq("id", t.pledge).eq("collection_point_id", cp.id).maybeSingle();
  if (!pledge) return { ok: false, error: "That pick-up isn’t on your list." };
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
    if (!Number.isInteger(packs) || packs < 1 || packs > 100000) return { ok: false, error: "Enter how many packs you picked up. If there was no food, tap No food." };
    if (from === "picked_up") return { ok: true };
    if (!OPEN.includes(from)) return { ok: false, error: STALE };
    const at = tapTime(t.at);
    // Claim the pledge first so a double tap can't create two batches.
    const { data: claimed } = await db.from("pledges").update({ status: "picked_up", picked_up_at: at, picked_up_packs: packs, notes: note.slice(0, 120) || undefined }).eq("id", t.pledge).in("status", OPEN).select("id");
    if (!claimed?.length) return { ok: false, error: STALE };
    const { data: batch, error } = await db.from("batches").insert({
      event_id: cp.event_id,
      collection_point_id: cp.id,
      review_status: "pending",
      source: "pickup",
      food: `Pick-up: ${pledge.tent_name}`.slice(0, 80),
      qty: packs,
      category: "cooked_meal",
      collected_at: at,
      location: cp.name.slice(0, 60),
      notes: note.slice(0, 120) || null,
      parsed_by: "manual",
    }).select("id").single();
    if (error || !batch) {
      await db.from("pledges").update({ status: from, picked_up_at: null, picked_up_packs: null }).eq("id", t.pledge);
      return { ok: false, error: "Couldn’t save that. Check your connection and try again." };
    }
    await db.from("pledges").update({ batch_id: batch.id }).eq("id", t.pledge);
    return { ok: true };
  }
  return { ok: false, error: "Unknown action." };
}
