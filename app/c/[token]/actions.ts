"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMessage } from "@/lib/parse-message";
import { lagosTimeToday } from "@/lib/format";
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

  const parsed = await parseMessage(message);
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

  redirect(`/c/${token}?ok=${row!.id}`);
}
