"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyStopStatus, departTrip, returnTrip } from "@/lib/apply-status";
import { findBusLink, findCurrentTrip } from "@/lib/bus-trip";

const NOTE = "Sent by bus lead";

/**
 * Every button on the bus lead page posts here (plain forms, no JavaScript needed).
 * The secret token identifies the bus for this event; actions apply to that bus's current trip only.
 * The page also sends the trip it was showing, so a tap on a stale page can't hit the next trip.
 */
export async function busAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const intent = String(form.get("intent") ?? "");
  const shownTrip = String(form.get("trip") ?? "");
  const stop = Number(form.get("stop"));
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/b/invalid");

  const db = createAdminClient();
  const link = await findBusLink(db, token);
  if (!link) redirect(`/b/${token}`);
  const trip = await findCurrentTrip(db, link);

  let error: string | null = null;
  if (!trip) error = "No trip right now.";
  else if (shownTrip && shownTrip !== trip.id) error = "Your trip just changed. The page now shows the current one.";
  else if (intent === "depart") {
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
