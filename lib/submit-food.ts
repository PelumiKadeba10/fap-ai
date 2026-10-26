// SERVER ONLY: saves one "food collected" report from a collection point. Shared by the form's server action and /api/c/submit.
import { createAdminClient } from "@/lib/supabase/admin";
import { guessCategory } from "@/lib/urgency";
import { PHOTO_BUCKET, photoExt, photoPath } from "@/lib/photo";

const RATE_LIMIT_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SubmitResult =
  | { ok: true; id: string; photoSkipped: boolean }
  | { ok: false; error: string; status: 400 | 404 | 429 | 500 };

/**
 * `form` has token, food, count, edible, optional notes/photo and optional `id` (a client-made UUID).
 * With an `id`, sending the same report twice saves it once, so a queued report can be retried safely.
 * `queued` skips the 10 second limit: a phone coming back online sends its whole queue at once.
 */
export async function saveFoodReport(form: FormData, opts: { queued?: boolean } = {}): Promise<SubmitResult> {
  const token = String(form.get("token") ?? "");
  const food = String(form.get("food") ?? "").trim();
  const count = Number(form.get("count"));
  const edible = Number(form.get("edible"));
  const notes = String(form.get("notes") ?? "").trim();
  const rawId = String(form.get("id") ?? "");
  const id = UUID.test(rawId) ? rawId.toLowerCase() : null;

  if (!/^[a-f0-9]{32}$/.test(token)) return { ok: false, error: "This link isn’t valid.", status: 404 };
  const db = createAdminClient();
  const { data: cp } = await db.from("collection_points").select("id, name, event_id, active").eq("token", token).maybeSingle();
  if (!cp || !cp.active) return { ok: false, error: "This link isn’t active.", status: 404 };

  // Already saved by an earlier attempt whose reply was lost: report success.
  if (id) {
    const { data: dup } = await db.from("batches").select("id").eq("id", id).eq("collection_point_id", cp.id).maybeSingle();
    if (dup) return { ok: true, id: dup.id, photoSkipped: false };
  }

  if (food.length < 1) return { ok: false, error: "Type what you collected first.", status: 400 };
  if (food.length > 80) return { ok: false, error: "That name is too long. Keep it under 80 characters.", status: 400 };
  if (!Number.isInteger(count) || count < 1 || count > 100_000) return { ok: false, error: "Enter the number of boxes or cartons.", status: 400 };
  if (!Number.isInteger(edible) || edible < 0) return { ok: false, error: "Enter the edible packs after sorting.", status: 400 };
  if (edible > count) return { ok: false, error: `Edible packs cannot be above the ${count} packs collected in this report.`, status: 400 };
  if (notes.length > 240) return { ok: false, error: "Keep notes under 240 characters.", status: 400 };


  // One submission per collection point every 10 seconds (stops double taps and spam).
  if (!opts.queued) {
    const { data: last } = await db.from("batches").select("created_at").eq("collection_point_id", cp.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - new Date(last.created_at).getTime() < RATE_LIMIT_MS) return { ok: false, error: "Please wait a few seconds before sending again.", status: 429 };
  }

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
    ...(id ? { id } : {}),
    event_id: cp.event_id,
    collection_point_id: cp.id,
    review_status: "pending",
    food,
    qty: count,
    edible_packs: edible,
    category: guessCategory(food),
    collected_at: new Date().toISOString(),
    location: cp.name.slice(0, 60),
    raw_message: `${count} boxes/cartons of ${food}`,
    notes: notes || null,
    parsed_by: "manual",
  }).select("id").single();
  if (error?.code === "23505" && id) return { ok: true, id, photoSkipped: false }; // a parallel retry got there first
  if (error || !row) return { ok: false, error: "Couldn’t send that. Check your connection and try again.", status: 500 };

  if (photo) {
    const path = photoPath(cp.event_id, row.id, photo.ext);
    const up = await db.storage.from(PHOTO_BUCKET).upload(path, photo.data, { contentType: photo.type });
    if (up.error) {
      console.error("Photo upload failed", up.error);
      photoSkipped = true;
    } else {
      const { error: linkError } = await db.from("batches").update({ photo_path: path }).eq("id", row.id);
      if (linkError) {
        console.error("Photo link failed", linkError);
        await db.storage.from(PHOTO_BUCKET).remove([path]);
        photoSkipped = true;
      }
    }
  }
  return { ok: true, id: row.id, photoSkipped };
}
