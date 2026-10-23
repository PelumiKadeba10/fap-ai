"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveFoodReport } from "@/lib/submit-food";
import { applyPickupTap } from "@/lib/pickup-act";

const back = (token: string, e: string): never => redirect(`/c/${token}?e=${encodeURIComponent(e)}`);

/**
 * A collection-point lead sends what they collected and how many boxes/cartons. Works without JavaScript (plain form post).
 * The batch is saved as "pending" so a coordinator checks it before it reaches matching.
 */
export async function submitFood(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/c/invalid");
  const r = await saveFoodReport(form);
  if (!r.ok) return r.status === 404 ? redirect(`/c/${token}`) : back(token, r.error);
  redirect(`/c/${token}?ok=${r.id}${r.photoSkipped ? "&photo=skipped" : ""}`);
}

const backPickups = (token: string, q: string): never => redirect(`/c/${token}?tab=pickups&${q}`);

/**
 * Buttons on the Pick-ups tab: "On my way", "Picked up" (asks for packs and an optional note) and "No food".
 * Plain form posts when JavaScript is off; with it the page sends the same taps to /api/c/pickup, which can wait for signal.
 * A pledge can only be changed from the collection point it belongs to.
 */
export async function pickupAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/c/invalid");
  const intent = String(form.get("intent") ?? "");
  const r = await applyPickupTap(createAdminClient(), {
    token, intent, pledge: String(form.get("pledge") ?? ""), packs: Number(String(form.get("packs") ?? "").trim()), note: String(form.get("note") ?? ""),
  });
  if (r.ok) redirect(`/c/${token}?tab=pickups&done=${intent}`);
  if (r.notFound) redirect(`/c/${token}`);
  backPickups(token, "e=" + encodeURIComponent(r.error));
}
