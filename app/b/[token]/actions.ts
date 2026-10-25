"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyBusTap } from "@/lib/bus-act";

/**
 * Every button on the bus lead page posts here when JavaScript is off (plain forms). With JavaScript the page
 * sends the same taps to /api/b/act, which can wait for signal. The secret token identifies the bus for this event.
 * The page also sends the trip it was showing, so a tap on a stale page can't hit the next trip.
 */
export async function busAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/b/invalid");
  const r = await applyBusTap(createAdminClient(), {
    token, intent: String(form.get("intent") ?? ""), trip: String(form.get("trip") ?? ""), stop: Number(form.get("stop")),
    loaded: Number(form.get("loaded")),
  });
  redirect(r.ok || r.notFound ? `/b/${token}` : `/b/${token}?e=${encodeURIComponent(r.error)}`);
}
