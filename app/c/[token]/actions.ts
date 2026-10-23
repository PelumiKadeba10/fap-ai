"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { guessCategory } from "@/lib/urgency";
import { PHOTO_BUCKET, photoExt, photoPath } from "@/lib/photo";

const RATE_LIMIT_MS = 10_000;

const back = (token: string, e: string): never => redirect(`/c/${token}?e=${encodeURIComponent(e)}`);

/**
 * A collection-point lead sends what they collected and how many boxes/cartons. Works without JavaScript (plain form post).
 * The batch is saved as "pending" so a coordinator checks it before it reaches matching.
 */
export async function submitFood(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/c/invalid");
  const food = String(form.get("food") ?? "").trim();
  const count = Number(form.get("count"));

  const db = createAdminClient();
  const { data: cp } = await db.from("collection_points").select("id, name, event_id, active").eq("token", token).maybeSingle();
  if (!cp || !cp.active) redirect(`/c/${token}`);

  if (food.length < 1) back(token, "Type what you collected first.");
  if (food.length > 80) back(token, "That name is too long. Keep it under 80 characters.");
  if (!Number.isInteger(count) || count < 1 || count > 100_000) back(token, "Enter the number of boxes or cartons.");

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

  const { data: row, error } = await db.from("batches").insert({
    event_id: cp.event_id,
    collection_point_id: cp.id,
    review_status: "pending",
    food,
    qty: count,
    category: guessCategory(food),
    collected_at: new Date().toISOString(),
    location: cp.name.slice(0, 60),
    raw_message: `${count} boxes/cartons of ${food}`,
    parsed_by: "manual",
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
