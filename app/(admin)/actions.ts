"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_BUCKET } from "@/lib/photo";
import { getActiveEvent, getBatches, getBusyBusIds, getBuses, getDeliveries, getSites, sumBy } from "@/lib/data";
import { lagosTimeToday } from "@/lib/format";
import { runMatching } from "@/lib/match";
import { urgency } from "@/lib/urgency";
import { EVENT_COOKIE } from "@/lib/event-cookie";
import { applyStatus, applyStopStatus, departTrip, returnTrip } from "@/lib/apply-status";
import { defaultCapacity, planTrips, NO_HUB } from "@/lib/trips";
import { canTripMove } from "@/lib/trip-status";
import type { DeliveryStatus, TripStatus } from "@/lib/types";

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
  if (id) {
    const { error } = await supabase.from("events").update(row).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from("events").insert({ ...row, active: true }).select("id").single();
    if (error) return { ok: false, error: error.message };
    await setEventCookie(data.id);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

async function setEventCookie(id: string) {
  (await cookies()).set(EVENT_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 180 });
}

/** Make this event the one the coordinator is working on. */
export async function selectEvent(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown event." };
  const supabase = await db();
  const { data } = await supabase.from("events").select("id").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "That event no longer exists." };
  await setEventCookie(id);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Removes a batch photo from private storage (service role: coordinators have no delete policy). Never blocks the caller. */
async function deletePhoto(path: string | null | undefined) {
  if (!path) return;
  const { error } = await createAdminClient().storage.from(PHOTO_BUCKET).remove([path]);
  if (error) console.error("Photo delete failed", error);
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
  collection_point_id: z.string().uuid().nullable().optional(),
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
    review_status: "approved",
    location: b.location || event.venue_name,
    collected_at: (collected ?? new Date()).toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeBatch(id: string): Promise<Result> {
  const supabase = await db();
  const { count } = await supabase.from("deliveries").select("id", { count: "exact", head: true }).eq("batch_id", id);
  if (count) return { ok: false, error: "This batch is already out for delivery and can’t be removed." };
  const { data: row } = await supabase.from("batches").select("photo_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("batches").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await deletePhoto(row?.photo_path);
  revalidatePath("/", "layout");
  return { ok: true };
}

const BatchEdit = z.object({
  food: z.string().trim().min(1).max(80),
  qty: z.coerce.number().int().positive(),
  category: z.enum(["cooked_meal", "bread_pastry", "fruit_veg", "packaged", "drinks"]),
  // "HH:MM" Lagos time, or null to leave the collected time as it was.
  collected_time: z.string().regex(/^d{1,2}:d{2}$/).nullable(),
  location: z.string().trim().max(60),
  condition: z.string().trim().max(40),
  notes: z.string().trim().max(120),
});

/** Coordinator checks food reported through a collection link and lets it into matching. */
export async function confirmBatch(id: string, input: z.input<typeof BatchEdit>): Promise<Result> {
  const idOk = z.string().uuid().safeParse(id).success;
  const parsed = BatchEdit.safeParse(input);
  if (!idOk || !parsed.success) return { ok: false, error: "Food name and a quantity above zero are required." };
  const supabase = await db();
  const { collected_time, ...b } = parsed.data;
  const patch: Record<string, unknown> = { ...b, review_status: "approved" };
  if (collected_time) {
    const t = lagosTimeToday(collected_time);
    if (t) patch.collected_at = t.toISOString();
  }
  const { data, error } = await supabase.from("batches").update(patch).eq("id", id).eq("review_status", "pending").select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "This batch was already checked or removed." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Throws away an unchecked submission. Approved batches are removed with removeBatch instead. */
export async function discardBatch(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown batch." };
  const supabase = await db();
  const { data: row } = await supabase.from("batches").select("photo_path").eq("id", id).eq("review_status", "pending").maybeSingle();
  const { error } = await supabase.from("batches").delete().eq("id", id).eq("review_status", "pending");
  if (error) return { ok: false, error: error.message };
  await deletePhoto(row?.photo_path);
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ---------- Collection points ---------- */

const PointInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  lead_name: z.string().trim().max(60).nullable().optional(),
  lead_phone: z.string().trim().max(30).nullable().optional(),
});

export async function saveCollectionPoint(input: z.input<typeof PointInput>): Promise<Result> {
  const parsed = PointInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A collection point needs a name." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "Create the event on the Event tab first." };
  const supabase = await db();
  const { id, ...row } = parsed.data;
  const { error } = id
    ? await supabase.from("collection_points").update(row).eq("id", id)
    : await supabase.from("collection_points").insert({ ...row, event_id: event.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/intake");
  return { ok: true };
}

export async function setCollectionPointActive(id: string, active: boolean): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown collection point." };
  const supabase = await db();
  const { error } = await supabase.from("collection_points").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/intake");
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
  const [batches, sites, deliveries] = await Promise.all([getBatches(event.id, "approved"), getSites(), getDeliveries(event.id)]);
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
  revalidatePath("/", "layout");
  return { ok: true, created: rows.length };
}

/* ---------- Trips (hubs and buses) ---------- */

/**
 * Recomputes the plan on the server from current data and creates the trips and their deliveries.
 * busIds is aligned with the trips of the plan the coordinator saw (null = no bus yet).
 */
export async function approveTrips(busIds: (string | null)[]): Promise<Result & { created?: number }> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const [batches, sites, deliveries, buses, busy] = await Promise.all([
    getBatches(event.id, "approved"), getSites(), getDeliveries(event.id), getBuses(), getBusyBusIds(),
  ]);
  const sentByBatch = sumBy(deliveries, (d) => d.batch_id, (d) => d.qty);
  const sentBySite = sumBy(deliveries, (d) => d.site_id, (d) => d.qty);
  const now = new Date();
  const { allocations } = runMatching(
    batches.map((b) => ({ id: b.id, category: b.category, collected_at: b.collected_at, available: b.qty - (sentByBatch.get(b.id) ?? 0) })),
    sites.map((s) => ({ ...s, km: Number(s.km), alreadyAllocated: sentBySite.get(s.id) ?? 0 })),
    now,
  );
  if (!allocations.length) return { ok: false, error: "Nothing to send: no food left to allocate, or every site’s need is met." };

  const batchHub = Object.fromEntries(batches.map((b) => [b.id, b.collection_point_id]));
  const trips = planTrips(allocations, batchHub, sites.map((x) => ({ id: x.id, km: Number(x.km), direction: x.direction })), defaultCapacity(buses));

  // A bus can take one trip at a time, and only if it is free.
  const chosen = busIds.slice(0, trips.length).filter((id): id is string => !!id);
  if (new Set(chosen).size !== chosen.length) return { ok: false, error: "A bus can only be given one trip at a time." };
  for (const id of chosen) {
    const bus = buses.find((b) => b.id === id);
    if (!bus || !bus.active) return { ok: false, error: "One of the chosen buses isn’t available any more. Plan again." };
    if (busy.includes(id)) return { ok: false, error: `${bus.name} is already on a trip. Plan again.` };
  }

  const supabase = await db();
  const { data: created, error } = await supabase
    .from("trips")
    .insert(trips.map((t, i) => ({ event_id: event.id, hub_id: t.hubId === NO_HUB ? null : t.hubId, bus_id: busIds[i] ?? null })))
    .select("id");
  if (error || !created || created.length !== trips.length) return { ok: false, error: error?.message ?? "Couldn’t create the trips." };

  const batchById = new Map(batches.map((b) => [b.id, b]));
  const siteById = new Map(sites.map((x) => [x.id, x]));
  const rows = trips.flatMap((t, i) =>
    t.stops.flatMap((stop) => stop.items.map((it) => ({
      event_id: event.id,
      trip_id: created[i].id,
      stop_order: stop.order,
      batch_id: it.batchId,
      site_id: stop.siteId,
      qty: it.qty,
      planned_km: Number(siteById.get(stop.siteId)?.km ?? 0) || null,
      safe_until: urgency(batchById.get(it.batchId)!, now).safeUntil.toISOString(),
    }))),
  );
  const { error: dError } = await supabase.from("deliveries").insert(rows);
  if (dError) {
    await supabase.from("trips").delete().in("id", created.map((c) => c.id)); // don't leave empty trips behind
    return { ok: false, error: dError.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, created: trips.length };
}

export async function setTripBus(tripId: string, busId: string | null): Promise<Result> {
  const ok = z.string().uuid().safeParse(tripId).success && (busId === null || z.string().uuid().safeParse(busId).success);
  if (!ok) return { ok: false, error: "Unknown trip or bus." };
  if (busId) {
    const [buses, busy] = await Promise.all([getBuses(), getBusyBusIds()]);
    const bus = buses.find((b) => b.id === busId);
    if (!bus?.active) return { ok: false, error: "That bus isn’t available." };
    const supabase = await db();
    const { data: current } = await supabase.from("trips").select("bus_id").eq("id", tripId).maybeSingle();
    if (busy.includes(busId) && current?.bus_id !== busId) return { ok: false, error: `${bus.name} is already on a trip.` };
  }
  const supabase = await db();
  const { data, error } = await supabase.from("trips").update({ bus_id: busId }).eq("id", tripId).in("status", ["planned", "loading"]).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "The bus can only be changed before the trip leaves." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Coordinator moves a trip along (e.g. after a phone call with the bus lead). */
export async function setTripStatusAsStaff(tripId: string, to: TripStatus): Promise<Result> {
  if (!z.string().uuid().safeParse(tripId).success) return { ok: false, error: "Unknown trip." };
  const supabase = await db();
  const { data: trip } = await supabase.from("trips").select("status").eq("id", tripId).maybeSingle();
  if (!trip) return { ok: false, error: "That trip no longer exists." };
  if (!canTripMove(trip.status as TripStatus, to)) return { ok: false, error: "That update isn’t possible from the trip’s current status." };

  if (to === "departed") {
    const r = await departTrip(supabase, tripId, "Updated by coordinator");
    if (!r.ok) return r;
  } else if (to === "returned") {
    const r = await returnTrip(supabase, tripId, true);
    if (!r.ok) return r;
  } else if (to === "cancelled") {
    // Frees the food: deliveries that never left are deleted so the portions are waiting again.
    const { error: dErr } = await supabase.from("deliveries").delete().eq("trip_id", tripId).neq("status", "delivered");
    if (dErr) return { ok: false, error: dErr.message };
    const { error } = await supabase.from("trips").update({ status: "cancelled" }).eq("id", tripId).eq("status", trip.status);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("trips").update({ status: to }).eq("id", tripId).eq("status", trip.status);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Coordinator marks one stop delivered, or flags a problem there. */
export async function setStopStatusAsStaff(tripId: string, stopOrder: number, to: "delivered" | "delayed"): Promise<Result> {
  if (!z.string().uuid().safeParse(tripId).success || !Number.isInteger(stopOrder)) return { ok: false, error: "Unknown stop." };
  const supabase = await db();
  const from: DeliveryStatus[] = to === "delivered" ? ["on_the_way", "delayed", "assigned"] : ["on_the_way"];
  const r = await applyStopStatus(supabase, tripId, stopOrder, from, to, "Updated by coordinator");
  if (!r.ok) return r;
  if (!r.count) return { ok: false, error: "That stop was just updated by someone else. Refresh to see the latest." };
  revalidatePath("/live");
  return { ok: true };
}

/* ---------- Buses ---------- */

const BusInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(40),
  capacity: z.coerce.number().int().min(1).max(5000),
  lead_name: z.string().trim().max(60).nullable().optional(),
  lead_phone: z.string().trim().max(30).nullable().optional(),
});

export async function saveBus(input: z.input<typeof BusInput>): Promise<Result> {
  const parsed = BusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A bus needs a name and a capacity above zero." };
  const supabase = await db();
  const { id, ...row } = parsed.data;
  const { error } = id ? await supabase.from("buses").update(row).eq("id", id) : await supabase.from("buses").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setBusActive(id: string, active: boolean): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown bus." };
  const supabase = await db();
  const { error } = await supabase.from("buses").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
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
