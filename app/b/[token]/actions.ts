"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyStopStatus, departTrip, returnTrip } from "@/lib/apply-status";

const NOTE = "Sent by bus lead";

/**
 * Every button on the bus lead page posts here (plain forms, no JavaScript needed).
 * The secret token in the form is the only credential, and every change is limited to that one trip.
 */
export async function busAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const intent = String(form.get("intent") ?? "");
  const stop = Number(form.get("stop"));
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/b/invalid");

  const db = createAdminClient();
  const { data: trip } = await db.from("trips").select("id, status").eq("token", token).maybeSingle();
  if (!trip) redirect(`/b/${token}`);

  let error: string | null = null;
  if (intent === "depart") {
    const r = await departTrip(db, trip.id, NOTE);
    if (!r.ok) error = r.error;
  } else if (intent === "delivered" || intent === "problem") {
    if (trip.status !== "departed") error = "Tap “Loaded, leaving now” first.";
    else if (!Number.isInteger(stop)) error = "Unknown stop.";
    else {
      const r = intent === "delivered"
        ? await applyStopStatus(db, trip.id, stop, ["on_the_way", "delayed"], "delivered", NOTE)
        : await applyStopStatus(db, trip.id, stop, ["on_the_way"], "delayed", NOTE);
      if (!r.ok) error = r.error;
      else if (!r.count) error = "That stop was already updated.";
    }
  } else if (intent === "return") {
    const r = await returnTrip(db, trip.id, false);
    if (!r.ok) error = r.error;
  }
  redirect(error ? `/b/${token}?e=${encodeURIComponent(error)}` : `/b/${token}`);
}
