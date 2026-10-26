// SERVER ONLY: records a statistics-only food donation from a collection point.
import type { SupabaseClient } from "@supabase/supabase-js";
import { tapTime } from "./tap-time";

const TOKEN = /^[a-f0-9]{32}$/;
const UUID = /^[0-9a-f-]{36}$/i;
export type DonationTap = { token: string; packs?: number; dropper?: string; id?: string; at?: string };
export type DonationResult = { ok: true } | { ok: false; error: string; notFound?: boolean };

export async function saveDonation(db: SupabaseClient, t: DonationTap): Promise<DonationResult> {
  if (!TOKEN.test(t.token)) return { ok: false, error: "This link isn't valid.", notFound: true };
  const packs = Number(t.packs);
  if (!Number.isInteger(packs) || packs < 1 || packs > 100000) return { ok: false, error: "Enter the number of packs donated." };
  const id = t.id && UUID.test(t.id) ? t.id.toLowerCase() : null;
  const dropper = (t.dropper ?? "").trim();
  if (dropper.length > 120) return { ok: false, error: "Keep the dropper name under 120 characters." };
  const { data: cp } = await db.from("collection_points").select("id, event_id, active").eq("intake_token", t.token).maybeSingle();
  if (!cp || !cp.active) return { ok: false, error: "This link isn't active.", notFound: true };
  if (id) {
    const { data: duplicate } = await db.from("food_donations").select("id").eq("id", id).eq("collection_point_id", cp.id).maybeSingle();
    if (duplicate) return { ok: true };
  }
  const { error } = await db.from("food_donations").insert({ ...(id ? { id } : {}), event_id: cp.event_id, collection_point_id: cp.id, packs, dropper_name: dropper || null, donated_at: tapTime(t.at) });
  if (error?.code === "23505" && id) return { ok: true };
  return error ? { ok: false, error: "Couldn't save that donation. Check your connection and try again." } : { ok: true };
}
