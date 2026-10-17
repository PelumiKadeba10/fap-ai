"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMessage } from "@/lib/parse-message";
import { lagosTimeToday } from "@/lib/format";
import { PHOTO_BUCKET, photoExt, photoPath } from "@/lib/photo";
import type { ParsedRecord } from "@/lib/types";

const RATE_LIMIT_MS = 10_000;
const DEFAULT_LOCATION = "Convocation Centre";

const back = (token: string, e: string): never => redirect(`/c/${token}?e=${encodeURIComponent(e)}`);

/**
 * A collection-point lead sends what they collected. Works without JavaScript (plain form post).
 * The batch is saved as "pending" so a coordinator checks it before it reaches matching.
 */
export async function submitFood(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/c/invalid");
  const message = String(form.get("message") ?? "").trim();

  const db = createAdminClient();
  const { data: cp } = await db.from("collection_points").select("id, name, event_id, active").eq("token", token).maybeSingle();
  if (!cp || !cp.active) redirect(`/c/${token}`);

  if (message.length < 1) back(token, "Type what you collected first.");
  if (message.length > 800) back(token, "That message is too long. Keep it under 800 characters.");

  // One submission per collection point every 10 seconds (stops double taps and spam).
  const { data: last } = await db.from("batches").select("created_at").eq("collection_point_id", cp.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - new Date(last.created_at).getTime() < RATE_LIMIT_MS) back(token, "Please wait a few seconds before sending again.");

  // The photo is optional and never blocks the submission: a bad or failed photo is simply left out.
  const file = form.get("photo");
  let photo: { data: Buffer; type: string; ext: string } | null = null;
  let photoSkipped = false;
  if (file instanceof File && file.size > 0) {
    const ext = photoExt(file.type, file.size);
    if (ext) photo = { data: Buffer.from(await file.arrayBuffer()), type: file.type, ext };
    else photoSkipped = true;
  }

  const parsed = await parseMessage(message, photo ? { data: photo.data, mediaType: photo.type } : undefined);
  // Nothing is lost: if no quantity was found, save it anyway for the coordinator to fix.
  const record: ParsedRecord = parsed?.record ?? {
    food: "Unclear message", quantity: 1, collected_time: null, location: cp.name, condition: "", category: "cooked_meal", notes: "Needs a quantity",
  };
  const collected = (record.collected_time ? lagosTimeToday(record.collected_time) : null) ?? new Date();

  const { data: row, error } = await db.from("batches").insert({
    event_id: cp.event_id,
    collection_point_id: cp.id,
    review_status: "pending",
    food: record.food.slice(0, 80),
    qty: record.quantity,
    category: record.category,
    collected_at: collected.toISOString(),
    location: (record.location === DEFAULT_LOCATION ? cp.name : record.location).slice(0, 60),
    condition: record.condition || null,
    notes: record.notes || null,
    raw_message: message,
    parsed_by: parsed?.parsedBy ?? "local",
  }).select("id").single();
  if (error || !row) back(token, "Couldn’t send that. Check your connection and try again.");

  if (photo) {
    const path = photoPath(cp.event_id, row!.id, photo.ext);
    const up = await db.storage.from(PHOTO_BUCKET).upload(path, photo.data, { contentType: photo.type });
    if (up.error) {
      console.error("Photo upload failed", up.error);
      photoSkipped = true;
    } else {
      const { error: linkError } = await db.from("batches").update({ photo_path: path }).eq("id", row!.id);
      if (linkError) {
        console.error("Photo link failed", linkError);
        await db.storage.from(PHOTO_BUCKET).remove([path]);
        photoSkipped = true;
      }
    }
  }

  redirect(`/c/${token}?ok=${row!.id}${photoSkipped ? "&photo=skipped" : ""}`);
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
