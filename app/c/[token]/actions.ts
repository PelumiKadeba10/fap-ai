"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveFoodReport } from "@/lib/submit-food";

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
 * Plain form posts, no JavaScript needed. A pledge can only be changed from the collection point it belongs to.
 * "Picked up" creates a pending batch for this collection point so the coordinator checks it like any other food.
 */
export async function pickupAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/c/invalid");
  const intent = String(form.get("intent") ?? "");
  const pledgeId = String(form.get("pledge") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(pledgeId)) backPickups(token, "e=" + encodeURIComponent("Unknown pick-up."));

  const db = createAdminClient();
  const { data: cp } = await db.from("collection_points").select("id, name, event_id, active").eq("token", token).maybeSingle();
  if (!cp || !cp.active) redirect(`/c/${token}`);

  const { data: pledge } = await db.from("pledges").select("id, tent_name, status").eq("id", pledgeId).eq("collection_point_id", cp.id).maybeSingle();
  if (!pledge) backPickups(token, "e=" + encodeURIComponent("That pick-up isn’t on your list."));
  const from = pledge!.status as "pledged" | "on_the_way" | "picked_up" | "no_food";
  const OPEN = ["pledged", "on_the_way"];
  const stale = "This pick-up was just updated. The list below is up to date.";

  if (intent === "on_the_way") {
    if (from !== "pledged") backPickups(token, "e=" + encodeURIComponent(stale));
    const { data } = await db.from("pledges").update({ status: "on_the_way" }).eq("id", pledgeId).eq("status", "pledged").select("id");
    if (!data?.length) backPickups(token, "e=" + encodeURIComponent(stale));
  } else if (intent === "no_food") {
    if (!OPEN.includes(from)) backPickups(token, "e=" + encodeURIComponent(stale));
    const { data } = await db.from("pledges").update({ status: "no_food", notes: String(form.get("note") ?? "").trim().slice(0, 200) || undefined }).eq("id", pledgeId).in("status", OPEN).select("id");
    if (!data?.length) backPickups(token, "e=" + encodeURIComponent(stale));
  } else if (intent === "picked_up") {
    const packs = Number(String(form.get("packs") ?? "").trim());
    const note = String(form.get("note") ?? "").trim().slice(0, 120);
    if (!Number.isInteger(packs) || packs < 1 || packs > 100000) backPickups(token, "e=" + encodeURIComponent("Enter how many packs you picked up. If there was no food, tap No food."));
    if (!OPEN.includes(from)) backPickups(token, "e=" + encodeURIComponent(stale));
    const now = new Date().toISOString();
    // Claim the pledge first so a double tap can't create two batches.
    const { data: claimed } = await db.from("pledges").update({ status: "picked_up", picked_up_at: now, picked_up_packs: packs, notes: note || undefined }).eq("id", pledgeId).in("status", OPEN).select("id");
    if (!claimed?.length) backPickups(token, "e=" + encodeURIComponent(stale));
    const { data: batch, error } = await db.from("batches").insert({
      event_id: cp.event_id,
      collection_point_id: cp.id,
      review_status: "pending",
      source: "pickup",
      food: `Pick-up: ${pledge!.tent_name}`.slice(0, 80),
      qty: packs,
      category: "cooked_meal",
      collected_at: now,
      location: cp.name.slice(0, 60),
      notes: note || null,
      parsed_by: "manual",
    }).select("id").single();
    if (error || !batch) {
      await db.from("pledges").update({ status: from, picked_up_at: null, picked_up_packs: null }).eq("id", pledgeId);
      backPickups(token, "e=" + encodeURIComponent("Couldn’t save that. Check your connection and try again."));
    }
    await db.from("pledges").update({ batch_id: batch!.id }).eq("id", pledgeId);
  } else {
    backPickups(token, "e=" + encodeURIComponent("Unknown action."));
  }
  redirect(`/c/${token}?tab=pickups&done=${intent}`);
}
