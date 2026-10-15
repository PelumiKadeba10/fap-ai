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
