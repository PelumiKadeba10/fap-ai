"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveFoodReport } from "@/lib/submit-food";
import { applyPickupTap } from "@/lib/pickup-act";
import { saveEdibleCount } from "@/lib/count-actions";

const back = (token: string, e: string): never => redirect(`/r/${token}?e=${encodeURIComponent(e)}`);

/**
 * A collection-point lead sends what they collected and how many boxes/cartons. Works without JavaScript (plain form post).
 * The batch is saved as "pending" so a coordinator checks it before it reaches matching.
 */
export async function submitFood(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/r/invalid");
  const r = await saveFoodReport(form);
  if (!r.ok) return r.status === 404 ? redirect(`/r/${token}`) : back(token, r.error);
  redirect(`/r/${token}?ok=${r.id}${r.photoSkipped ? "&photo=skipped" : ""}`);
}

export async function saveEdible(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/r/invalid");
  const r = await saveEdibleCount(createAdminClient(), token, Number(form.get("edible")));
  if (!r.ok) back(token, r.error);
  redirect(`/r/${token}`);
}

const backPickups = (token: string, q: string): never => redirect(`/i/${token}?tab=pickups&${q}`);

/**
 * Buttons on the Pick-ups tab: "On my way", "Picked up" (asks for packs and an optional note) and "No food".
 * Plain form posts when JavaScript is off; with it the page sends the same taps to /api/c/pickup, which can wait for signal.
 * A pledge can only be changed from the collection point it belongs to.
 */
export async function pickupAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/i/invalid");
  const intent = String(form.get("intent") ?? "");
  const r = await applyPickupTap(createAdminClient(), {
    token, intent, pledge: String(form.get("pledge") ?? ""), packs: Number(String(form.get("packs") ?? "").trim()), note: String(form.get("note") ?? ""),
  });
  if (r.ok) redirect(`/c/${token}?tab=pickups&done=${intent}`);
  if (r.notFound) redirect(`/i/${token}`);
  backPickups(token, "e=" + encodeURIComponent(r.error));
}
