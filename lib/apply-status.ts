import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryStatus } from "./types";
import { canMove } from "./status";

/**
 * Move a delivery to a new status and log it. Shared by the volunteer page and the coordinator board.
 * The `.eq("status", from)` guard stops two taps racing each other.
 */
export async function applyStatus(db: SupabaseClient, deliveryId: string, from: DeliveryStatus, to: DeliveryStatus, note?: string) {
  if (!canMove(from, to)) return { ok: false as const, error: "That update isn’t possible from the current status." };
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "delivered") patch.delivered_at = now;
  if (to === "delayed") patch.was_delayed = true;

  const { data, error } = await db.from("deliveries").update(patch).eq("id", deliveryId).eq("status", from).select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!data?.length) return { ok: false as const, error: "This delivery was just updated by someone else. Refresh to see the latest." };

  await db.from("status_updates").insert({ delivery_id: deliveryId, status: to, note: note ?? null });
  return { ok: true as const };
}

type StopResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Moves the deliveries of a trip (one stop, or every stop when stopOrder is null) to a new status and logs each one.
 * Only rows currently in one of the `from` statuses are touched, so double taps and races do nothing twice.
 */
export async function applyStopStatus(
  db: SupabaseClient, tripId: string, stopOrder: number | null, from: DeliveryStatus[], to: DeliveryStatus, note?: string, at?: string,
): Promise<StopResult> {
  const now = at ?? new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "delivered") patch.delivered_at = now;
  if (to === "delayed") patch.was_delayed = true;

  let q = db.from("deliveries").update(patch).eq("trip_id", tripId).in("status", from);
  if (stopOrder != null) q = q.eq("stop_order", stopOrder);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  if (data?.length) await db.from("status_updates").insert(data.map((d) => ({ delivery_id: d.id, status: to, note: note ?? null, ...(at ? { created_at: at } : {}) })));
  return { ok: true, count: data?.length ?? 0 };
}

/** Bus leaves the hub: the trip becomes "departed" and every stop's food is on the way. `at` is when the bus lead tapped (a queued tap arrives late). */
export async function departTrip(db: SupabaseClient, tripId: string, note: string, at?: string) {
  const { data, error } = await db.from("trips").update({ status: "departed", departed_at: at ?? new Date().toISOString() }).eq("id", tripId).in("status", ["planned", "loading"]).select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!data?.length) return { ok: false as const, error: "This trip has already left or was cancelled." };
  const r = await applyStopStatus(db, tripId, null, ["assigned", "picked_up"], "on_the_way", note, at);
  return r.ok ? { ok: true as const } : r;
}

/** Bus is back at the hub. Without `force`, every delivery must already be delivered. */
export async function returnTrip(db: SupabaseClient, tripId: string, force: boolean, at?: string) {
  if (!force) {
    const { count, error } = await db.from("deliveries").select("id", { count: "exact", head: true }).eq("trip_id", tripId).neq("status", "delivered");
    if (error) return { ok: false as const, error: error.message };
    if (count) return { ok: false as const, error: "Finish every stop first, or ask the coordinator to close the trip." };
  }
  const { data, error } = await db.from("trips").update({ status: "returned", returned_at: at ?? new Date().toISOString() }).eq("id", tripId).eq("status", "departed").select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!data?.length) return { ok: false as const, error: "This trip isn’t on the road." };
  return { ok: true as const };
}
