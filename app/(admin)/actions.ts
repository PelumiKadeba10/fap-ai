"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveEvent, getBatches, getDeliveries, getSites, sumBy } from "@/lib/data";
import { lagosTimeToday } from "@/lib/format";
import { runMatching } from "@/lib/match";
import { urgency } from "@/lib/urgency";
import { applyStatus } from "@/lib/apply-status";
import type { DeliveryStatus } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return supabase;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/* ---------- Event ---------- */

const EventInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  type: z.enum(["convocation", "matriculation", "conference", "wedding", "religious"]),
  students: z.coerce.number().int().min(0),
  guests_per_student: z.coerce.number().min(0).max(10),
  meals_served: z.coerce.number().int().min(0).nullable(),
  vendors: z.coerce.number().int().min(1).max(40),
  starts_at: z.string().datetime(),
  duration_hours: z.coerce.number().positive().max(24),
});

export async function saveEvent(input: z.input<typeof EventInput>): Promise<Result> {
  const parsed = EventInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the event details: every field needs a valid value." };
  const supabase = await db();
  const { id, ...row } = parsed.data;
  const { error } = id
    ? await supabase.from("events").update(row).eq("id", id)
    : await supabase.from("events").insert({ ...row, active: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ---------- Batches ---------- */

const BatchInput = z.object({
  food: z.string().trim().min(1).max(80),
  qty: z.coerce.number().int().positive(),
  category: z.enum(["cooked_meal", "bread_pastry", "fruit_veg", "packaged", "drinks"]),
  collected_time: z.string().regex(/^\d{1,2}:\d{2}$/).nullable(),
  location: z.string().trim().max(60),
  condition: z.string().trim().max(40),
  notes: z.string().trim().max(120),
  raw_message: z.string().max(800).nullable(),
  parsed_by: z.enum(["claude", "local", "manual"]),
});

export async function addBatch(input: z.input<typeof BatchInput>): Promise<Result> {
  const parsed = BatchInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Food name and a quantity above zero are required." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "Create the event on the Event tab first." };
  const supabase = await db();
  const { collected_time, ...b } = parsed.data;
  const collected = collected_time ? lagosTimeToday(collected_time) : new Date();
  const { error } = await supabase.from("batches").insert({
    ...b,
    event_id: event.id,
    location: b.location || event.venue_name,
    collected_at: (collected ?? new Date()).toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/intake");
  revalidatePath("/match");
  return { ok: true };
}

export async function removeBatch(id: string): Promise<Result> {
  const supabase = await db();
  const { count } = await supabase.from("deliveries").select("id", { count: "exact", head: true }).eq("batch_id", id);
  if (count) return { ok: false, error: "This batch is already out for delivery and can’t be removed." };
  const { error } = await supabase.from("batches").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/intake");
  revalidatePath("/match");
  return { ok: true };
}

/* ---------- Sites ---------- */

const SiteInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["School", "Community", "Care home", "Shelter", "Other"]),
  people: z.coerce.number().int().min(0).nullable(),
  km: z.coerce.number().positive().max(60),
  direction: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]),
  contact_name: z.string().trim().max(60).nullable().optional(),
  contact_phone: z.string().trim().max(30).nullable().optional(),
});

export async function saveSite(input: z.input<typeof SiteInput>): Promise<Result> {
  const parsed = SiteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A site needs a name and a road distance above 0 km." };
  const supabase = await db();
  const { id, ...row } = parsed.data;
  const { error } = id ? await supabase.from("sites").update(row).eq("id", id) : await supabase.from("sites").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/match");
  return { ok: true };
}

export async function removeSite(id: string): Promise<Result> {
  const supabase = await db();
  // Keep history: hide the site instead of deleting it.
  const { error } = await supabase.from("sites").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/match");
  return { ok: true };
}

/* ---------- Matching ---------- */

/** Recomputes the plan on the server from current data and creates the deliveries. */
export async function approvePlan(): Promise<Result & { created?: number }> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const [batches, sites, deliveries] = await Promise.all([getBatches(event.id), getSites(), getDeliveries(event.id)]);
  const sentByBatch = sumBy(deliveries, (d) => d.batch_id, (d) => d.qty);
  const sentBySite = sumBy(deliveries, (d) => d.site_id, (d) => d.qty);
  const now = new Date();
  const { allocations } = runMatching(
    batches.map((b) => ({ id: b.id, category: b.category, collected_at: b.collected_at, available: b.qty - (sentByBatch.get(b.id) ?? 0) })),
    sites.map((s) => ({ ...s, alreadyAllocated: sentBySite.get(s.id) ?? 0 })),
    now,
  );
  if (!allocations.length) return { ok: false, error: "Nothing to send: no food left to allocate, or every site’s need is met." };

  const byId = new Map(batches.map((b) => [b.id, b]));
  const rows = allocations.map((a) => {
    const b = byId.get(a.batchId)!;
    return {
      event_id: event.id,
      batch_id: a.batchId,
      site_id: a.siteId,
      qty: a.qty,
      planned_km: a.km,
      safe_until: urgency(b, now).safeUntil.toISOString(),
    };
  });
  const supabase = await db();
  const { error } = await supabase.from("deliveries").insert(rows);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/match");
  revalidatePath("/live");
  return { ok: true, created: rows.length };
}

/* ---------- Status (coordinator updating on a volunteer's behalf, e.g. after a phone call) ---------- */

export async function setStatusAsStaff(deliveryId: string, from: DeliveryStatus, to: DeliveryStatus): Promise<Result> {
  const supabase = await db();
  const r = await applyStatus(supabase, deliveryId, from, to, "Updated by coordinator");
  if (!r.ok) return r;
  revalidatePath("/live");
  return { ok: true };
}

/* ---------- Volunteers ---------- */

export async function assignVolunteer(deliveryId: string, volunteerId: string | null): Promise<Result> {
  const supabase = await db();
  const { error } = await supabase.from("deliveries").update({ volunteer_id: volunteerId, updated_at: new Date().toISOString() }).eq("id", deliveryId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const VolunteerInput = z.object({
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(30).nullable(),
  vehicle: z.enum(["none", "car", "bike"]),
});

export async function addVolunteer(input: z.input<typeof VolunteerInput>): Promise<Result> {
  const parsed = VolunteerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A volunteer needs a name." };
  const supabase = await db();
  const { error } = await supabase.from("volunteers").insert(parsed.data);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/live");
  return { ok: true };
}
