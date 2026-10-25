// SERVER ONLY: one button press on the bus lead page. Shared by the form's server action and /api/b/act.
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyStopStatus, departTrip, returnTrip } from "./apply-status";
import { findBusLink, findCurrentTrip, findTripForBus } from "./bus-trip";
import { tapTime } from "./tap-time";
import { saveLoadedPacks } from "./count-actions";

const NOTE = "Sent by bus lead";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BusTap = { token: string; intent: string; trip?: string; stop?: number; loaded?: number; at?: string };
export type BusResult = { ok: true } | { ok: false; error: string; notFound?: boolean };

/**
 * Applies a tap to the trip the page was showing (or the bus's current trip when none is given).
 * Repeating a tap that already took effect is not an error, so a phone can safely resend a queued tap.
 * `at` is when it was tapped: stored as the time of the departure, delivery or return.
 */
export async function applyBusTap(db: SupabaseClient, t: BusTap): Promise<BusResult> {
  const link = await findBusLink(db, t.token);
  if (!link) return { ok: false, error: "This bus link isn’t valid.", notFound: true };
  const trip = t.trip && UUID.test(t.trip) ? await findTripForBus(db, link, t.trip) : await findCurrentTrip(db, link);
  if (!trip) return { ok: false, error: "No trip right now." };
  if (trip.status === "returned") return { ok: true }; // the trip is over: whatever this tap did is already done
  if (trip.status === "cancelled") return { ok: false, error: "This trip was cancelled." };

  const at = tapTime(t.at);
  if (t.intent === "depart") {
    if (trip.status === "departed") return { ok: true };
    if (!Number.isInteger(t.loaded)) return { ok: false, error: "Enter the packs loaded before leaving." };
    const loaded = await saveLoadedPacks(db, t.token, trip.id, t.loaded!, at);
    if (!loaded.ok) return loaded;
    const r = await departTrip(db, trip.id, NOTE, at);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  if (t.intent === "delivered" || t.intent === "problem") {
    if (trip.status !== "departed") return { ok: false, error: "Tap “Loaded, leaving now” first." };
    if (!Number.isInteger(t.stop)) return { ok: false, error: "Unknown stop." };
    const r = t.intent === "delivered"
      ? await applyStopStatus(db, trip.id, t.stop!, ["on_the_way", "delayed"], "delivered", NOTE, at)
      : await applyStopStatus(db, trip.id, t.stop!, ["on_the_way"], "delayed", NOTE, at);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  if (t.intent === "return") {
    const r = await returnTrip(db, trip.id, false, at);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  return { ok: false, error: "Unknown action." };
}
