"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_BUCKET } from "@/lib/photo";
import { getActiveEvent, getBatches, getBusyBusIds, getBuses, getDeliveries, getEventSites, getTrips, sumBy } from "@/lib/data";
import { lagosTimeToday } from "@/lib/format";
import { runMatching } from "@/lib/match";
import { urgency } from "@/lib/urgency";
import { EVENT_COOKIE } from "@/lib/event-cookie";
import { applyStatus, applyStopStatus, departTrip, returnTrip } from "@/lib/apply-status";
import { defaultCapacity, limitToFreeBuses, planTrips, NO_HUB } from "@/lib/trips";
import { nextTripNos } from "@/lib/bus-state";
import { parsePledgeList } from "@/lib/pledges";
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
  food_from: z.string().datetime().nullable(),
  bus_ready_by: z.string().datetime().nullable(),
  // When creating: copy places, collection points and buses from this earlier event.
  copy_from: z.string().uuid().optional(),
});

export async function saveEvent(input: z.input<typeof EventInput>): Promise<Result> {
  const parsed = EventInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the event details: every field needs a valid value." };
  const supabase = await db();
  const { id, copy_from, ...row } = parsed.data;
  if (id) {
    const { error } = await supabase.from("events").update(row).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from("events").insert({ ...row, active: true }).select("id").single();
    if (error) return { ok: false, error: error.message };
    await setEventCookie(data.id);
    if (copy_from) {
      const copied = await copySetupInto(supabase, copy_from, data.id);
      if (!copied.ok) return { ok: false, error: "The event was created, but copying the setup failed: " + copied.error };
    }
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Permanently removes an event and its event-owned records. Shared sites and volunteers are kept. */
export async function deleteEvent(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown event." };
  const supabase = await db();
  const { data: event } = await supabase.from("events").select("id").eq("id", id).maybeSingle();
  if (!event) return { ok: false, error: "That event no longer exists." };

  // Database cascades remove the rows; private storage needs explicit cleanup.
  const { data: photos } = await supabase.from("batches").select("photo_path").eq("event_id", id);
  const paths = (photos ?? []).map((p) => p.photo_path).filter((p): p is string => !!p);
  if (paths.length) {
    const { error } = await createAdminClient().storage.from(PHOTO_BUCKET).remove(paths);
    if (error) console.error("Event photo cleanup failed", error);
  }

  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  const cookieStore = await cookies();
  if (cookieStore.get(EVENT_COOKIE)?.value === id) cookieStore.delete(EVENT_COOKIE);
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

/** Overview card click: select the event, then go to it. Works as a plain form post without JavaScript. */
export async function openEvent(form: FormData) {
  const id = String(form.get("id") ?? "");
  const to = String(form.get("to") ?? "") === "/live" ? "/live" : "/event";
  const r = await selectEvent(id);
  redirect(r.ok ? to : "/");
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
  location_note: z.string().trim().max(120).nullable().optional(),
  lead_name: z.string().trim().max(60).nullable().optional(),
  lead_phone: z.string().trim().max(30).nullable().optional(),
  volunteers: z.coerce.number().int().min(0).max(10000).nullable().optional(),
});

export async function saveCollectionPoint(input: z.input<typeof PointInput>): Promise<Result> {
  const parsed = PointInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A collection point needs a name." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "Create the event on the Event tab first." };
  const supabase = await db();
  const { id, ...row } = parsed.data;
  const { error } = id
    ? await supabase.from("collection_points").update(row).eq("id", id).eq("event_id", event.id)
    : await supabase.from("collection_points").insert({ ...row, event_id: event.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setCollectionPointActive(id: string, active: boolean): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown collection point." };
  const supabase = await db();
  const { error } = await supabase.from("collection_points").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteCollectionPoint(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown collection point." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No event selected." };
  const supabase = await db();
  const { count } = await supabase.from("trips").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("hub_id", id);
  if (count) return { ok: false, error: "This collection point is used by a trip and cannot be deleted. Switch it off instead." };
  const { error } = await supabase.from("collection_points").delete().eq("id", id).eq("event_id", event.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ---------- Places (shared list) and this event's places ---------- */

const PlaceDetails = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["School", "Community", "Care home", "Shelter", "Other"]),
  km: z.coerce.number().positive().max(60),
  direction: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]),
  contact_name: z.string().trim().max(60).nullable().optional(),
  contact_phone: z.string().trim().max(30).nullable().optional(),
});
const People = z.coerce.number().int().min(0).max(100000);
const PLACE_ERROR = "A place needs a name and a road distance above 0 km.";

/** Creates a new place in the shared list and adds it to the selected event. */
export async function createPlace(input: z.input<typeof PlaceDetails> & { people: number }): Promise<Result> {
  const details = PlaceDetails.safeParse(input);
  const people = People.safeParse(input.people);
  if (!details.success || !people.success) return { ok: false, error: PLACE_ERROR };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "Create the event on the Event tab first." };
  const supabase = await db();
  // sites.people is only the default for future events; this event's number lives in event_sites.
  const { data: site, error } = await supabase.from("sites").insert({ ...details.data, people: people.data }).select("id").single();
  if (error || !site) return { ok: false, error: error?.message ?? "Couldn’t save the place." };
  const { error: linkError } = await supabase.from("event_sites").insert({ event_id: event.id, site_id: site.id, people: people.data });
  if (linkError) return { ok: false, error: linkError.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Adds a saved place to the selected event. */
export async function addEventSite(siteId: string, peopleIn: number): Promise<Result> {
  const people = People.safeParse(peopleIn);
  if (!z.string().uuid().safeParse(siteId).success || !people.success) return { ok: false, error: "Choose a place and a number of people." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "Create the event on the Event tab first." };
  const supabase = await db();
  const { error } = await supabase.from("event_sites").upsert({ event_id: event.id, site_id: siteId, people: people.data }, { onConflict: "event_id,site_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Changes how many people this event needs fed at a place. */
export async function setEventSitePeople(siteId: string, peopleIn: number): Promise<Result> {
  const people = People.safeParse(peopleIn);
  if (!z.string().uuid().safeParse(siteId).success || !people.success) return { ok: false, error: "Enter a number of people, zero or more." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No event selected." };
  const supabase = await db();
  const { error } = await supabase.from("event_sites").update({ people: people.data }).eq("event_id", event.id).eq("site_id", siteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Removes a place from this event only. The place itself, and its history, stay in the shared list. */
export async function removeEventSite(siteId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(siteId).success) return { ok: false, error: "Unknown place." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No event selected." };
  const supabase = await db();
  const { error } = await supabase.from("event_sites").delete().eq("event_id", event.id).eq("site_id", siteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Edits the shared place (name, type, distance, contact). Changes apply to every event. */
export async function updatePlaceDetails(siteId: string, input: z.input<typeof PlaceDetails>): Promise<Result> {
  const details = PlaceDetails.safeParse(input);
  if (!z.string().uuid().safeParse(siteId).success || !details.success) return { ok: false, error: PLACE_ERROR };
  const supabase = await db();
  const { error } = await supabase.from("sites").update(details.data).eq("id", siteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ---------- Copy setup from an earlier event ---------- */

/** Copies places (with their people), collection points and buses. Never food, trips or deliveries. Tables that already have rows are left alone. */
async function copySetupInto(supabase: Awaited<ReturnType<typeof db>>, fromId: string, toId: string): Promise<{ ok: true; places: number; points: number; buses: number } | { ok: false; error: string }> {
  const isEmpty = async (table: string) => {
    const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("event_id", toId);
    return !count;
  };
  const out = { places: 0, points: 0, buses: 0 };

  if (await isEmpty("event_sites")) {
    const { data } = await supabase.from("event_sites").select("site_id, people").eq("event_id", fromId);
    if (data?.length) {
      const { error } = await supabase.from("event_sites").insert(data.map((r) => ({ event_id: toId, site_id: r.site_id, people: r.people })));
      if (error) return { ok: false, error: error.message };
      out.places = data.length;
    }
  }
  if (await isEmpty("collection_points")) {
    // New rows get new ids and new link tokens.
    const { data } = await supabase.from("collection_points").select("name, location_note, lead_name, lead_phone, volunteers, active").eq("event_id", fromId);
    if (data?.length) {
      const { error } = await supabase.from("collection_points").insert(data.map((r) => ({ ...r, event_id: toId })));
      if (error) return { ok: false, error: error.message };
      out.points = data.length;
    }
  }
  if (await isEmpty("buses")) {
    const { data } = await supabase.from("buses").select("name, capacity, lead_name, lead_phone, active").eq("event_id", fromId);
    if (data?.length) {
      const { data: created, error } = await supabase.from("buses").insert(data.map((r) => ({ ...r, event_id: toId }))).select("id");
      if (error) return { ok: false, error: error.message };
      out.buses = data.length;
      await supabase.from("bus_links").upsert((created ?? []).map((b) => ({ event_id: toId, bus_id: b.id })), { onConflict: "event_id,bus_id", ignoreDuplicates: true });
    }
  }
  return { ok: true, ...out };
}

/** "Copy from <previous event>" on the Setup tab. */
export async function copySetup(fromEventId: string): Promise<Result & { copied?: string }> {
  if (!z.string().uuid().safeParse(fromEventId).success) return { ok: false, error: "Unknown event." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No event selected." };
  if (event.id === fromEventId) return { ok: false, error: "Choose a different event to copy from." };
  const supabase = await db();
  const r = await copySetupInto(supabase, fromEventId, event.id);
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, copied: r.places + " places, " + r.points + " collection points, " + r.buses + " buses" };
}

/* ---------- Matching ---------- */

/** Recomputes the plan on the server from current data and creates the deliveries. */
export async function approvePlan(): Promise<Result & { created?: number }> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const [batches, sites, deliveries] = await Promise.all([getBatches(event.id, "approved"), getEventSites(event.id), getDeliveries(event.id)]);
  const sentByBatch = sumBy(deliveries, (d) => d.batch_id, (d) => d.qty);
  const sentBySite = sumBy(deliveries, (d) => d.site_id, (d) => d.qty);
  const now = new Date();
  const { allocations } = runMatching(
    batches.map((b) => ({ id: b.id, category: b.category, collected_at: b.collected_at, available: (b.edible_packs ?? 0) - (sentByBatch.get(b.id) ?? 0) })),
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

/** A bus gets its link for an event the first time it is used there. Safe to call again. */
async function ensureBusLinks(supabase: Awaited<ReturnType<typeof db>>, eventId: string, busIds: string[]): Promise<string | null> {
  if (!busIds.length) return null;
  const { error } = await supabase.from("bus_links").upsert(busIds.map((bus_id) => ({ event_id: eventId, bus_id })), { onConflict: "event_id,bus_id", ignoreDuplicates: true });
  return error?.message ?? null;
}

/**
 * Recomputes the plan on the server from current data and creates the trips and their deliveries.
 * busIds is aligned with the trips of the plan the coordinator saw (null = no bus yet).
 */
export async function approveTrips(busIds: (string | null)[]): Promise<Result & { created?: number }> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const [batches, sites, deliveries, buses, busy] = await Promise.all([
    getBatches(event.id, "approved"), getEventSites(event.id), getDeliveries(event.id), getBuses(event.id), getBusyBusIds(),
  ]);
  const sentByBatch = sumBy(deliveries, (d) => d.batch_id, (d) => d.qty);
  const sentBySite = sumBy(deliveries, (d) => d.site_id, (d) => d.qty);
  const now = new Date();
  const { allocations } = runMatching(
    batches.map((b) => ({ id: b.id, category: b.category, collected_at: b.collected_at, available: (b.edible_packs ?? 0) - (sentByBatch.get(b.id) ?? 0) })),
    sites.map((s) => ({ ...s, km: Number(s.km), alreadyAllocated: sentBySite.get(s.id) ?? 0 })),
    now,
  );
  if (!allocations.length) return { ok: false, error: "Nothing to send: no food left to allocate, or every site’s need is met." };

  const batchHub = Object.fromEntries(batches.map((b) => [b.id, b.collection_point_id]));
  // Only free buses get a new trip: a bus that is out (or returning) finishes its trip first, and the food waits.
  const active = buses.filter((b) => b.active);
  const free = active.filter((b) => !busy.includes(b.id));
  if (active.length && !free.length) return { ok: false, error: "No bus is free right now. The food waiting will go on the next trip." };
  const planned = planTrips(allocations, batchHub, sites.map((x) => ({ id: x.id, km: Number(x.km), direction: x.direction })), defaultCapacity(free.length ? free : buses));
  const trips = active.length ? limitToFreeBuses(planned, free.length) : planned;

  // A bus can take one trip at a time, and only if it is free.
  const chosen = busIds.slice(0, trips.length).filter((id): id is string => !!id);
  if (new Set(chosen).size !== chosen.length) return { ok: false, error: "A bus can only be given one trip at a time." };
  for (const id of chosen) {
    const bus = buses.find((b) => b.id === id);
    if (!bus || !bus.active) return { ok: false, error: "One of the chosen buses isn’t available any more. Plan again." };
    if (busy.includes(id)) return { ok: false, error: `${bus.name} is already on a trip. Plan again.` };
  }

  const supabase = await db();
  const linkError = await ensureBusLinks(supabase, event.id, chosen);
  if (linkError) return { ok: false, error: linkError };
  // Each bus's 1st, 2nd, 3rd... trip of the event, numbered in approval order.
  const tripNos = nextTripNos(await getTrips(event.id), trips.map((_, i) => busIds[i] ?? null));
  const { data: created, error } = await supabase
    .from("trips")
    .insert(trips.map((t, i) => ({ event_id: event.id, hub_id: t.hubId === NO_HUB ? null : t.hubId, bus_id: busIds[i] ?? null, trip_no: tripNos[i] })))
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
    const activeEvent = await getActiveEvent();
    if (!activeEvent) return { ok: false, error: "No event selected." };
    const [buses, busy] = await Promise.all([getBuses(activeEvent.id), getBusyBusIds()]);
    const bus = buses.find((b) => b.id === busId);
    if (!bus?.active) return { ok: false, error: "That bus isn’t available." };
    const supabase = await db();
    const { data: current } = await supabase.from("trips").select("bus_id").eq("id", tripId).maybeSingle();
    if (busy.includes(busId) && current?.bus_id !== busId) return { ok: false, error: `${bus.name} is already on a trip.` };
  }
  const supabase = await db();
  const { data: before } = await supabase.from("trips").select("bus_id, event_id").eq("id", tripId).maybeSingle();
  if (!before) return { ok: false, error: "That trip no longer exists." };
  // A new bus means that bus's next trip number; no bus means no number.
  const tripNo = busId && before.bus_id !== busId ? nextTripNos(await getTrips(before.event_id), [busId])[0] : undefined;
  const patch = busId ? (tripNo === undefined ? { bus_id: busId } : { bus_id: busId, trip_no: tripNo }) : { bus_id: null, trip_no: null };
  const { data, error } = await supabase.from("trips").update(patch).eq("id", tripId).in("status", ["planned", "loading"]).select("id, event_id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "The bus can only be changed before the trip leaves." };
  if (busId) {
    const linkError = await ensureBusLinks(supabase, data[0].event_id, [busId]);
    if (linkError) return { ok: false, error: linkError };
  }
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
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "Create the event on the Event tab first." };
  const supabase = await db();
  const { id, ...row } = parsed.data;
  if (id) {
    const { error } = await supabase.from("buses").update(row).eq("id", id).eq("event_id", event.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from("buses").insert({ ...row, event_id: event.id }).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "Couldn’t save the bus." };
    // The bus lead's link for this event exists from the start.
    const linkError = await ensureBusLinks(supabase, event.id, [data.id]);
    if (linkError) return { ok: false, error: linkError };
  }
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

export async function deleteBus(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown bus." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No event selected." };
  const supabase = await db();
  const { count } = await supabase.from("trips").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("bus_id", id);
  if (count) return { ok: false, error: "This bus is used by a trip and cannot be deleted. Switch it off instead." };
  const { error } = await supabase.from("buses").delete().eq("id", id).eq("event_id", event.id);
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

/** Setup: packs in one carton for this event. Empty = show packs only. */
export async function setPacksPerCarton(value: number | null): Promise<Result> {
  const parsed = z.coerce.number().int().min(1).max(1000).nullable().safeParse(value);
  if (!parsed.success) return { ok: false, error: "Packs per carton must be a whole number above zero, or empty." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "Create the event on the Event tab first." };
  const supabase = await db();
  const { error } = await supabase.from("events").update({ packs_per_carton: parsed.data }).eq("id", event.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ---------- Pledged tents ---------- */

const PledgeInput = z.object({
  id: z.string().uuid().optional(),
  tent_name: z.string().trim().min(1).max(60),
  student_name: z.string().trim().min(1).max(120),
  tent_number: z.string().trim().min(1).max(30),
  matric_number: z.string().trim().min(1).max(30),
  contact_name: z.string().trim().max(60).nullable().optional(),
  contact_phone: z.string().trim().max(30).nullable().optional(),
  pledged_packs: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  pickup_from: z.string().datetime().nullable().optional(),
  collection_point_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(200).nullable().optional(),
});

export async function savePledge(input: z.input<typeof PledgeInput>): Promise<Result> {
  const parsed = PledgeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Student name, tent number and matric number are required." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "Create the event on the Event tab first." };
  const supabase = await db();
  const { id, ...row } = parsed.data;
  const { error } = id
    ? await supabase.from("pledges").update(row).eq("id", id).eq("event_id", event.id)
    : await supabase.from("pledges").insert({ ...row, event_id: event.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removePledge(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown pledge." };
  const supabase = await db();
  const { error } = await supabase.from("pledges").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Adds many tents at once from pasted lines ("Tent name, phone, packs"), all for one collection point and pick-up time. */
export async function importPledges(text: string, collectionPointId: string | null, pickupFrom: string | null): Promise<Result & { added?: number }> {
  const pointOk = collectionPointId === null || z.string().uuid().safeParse(collectionPointId).success;
  const timeOk = pickupFrom === null || z.string().datetime().safeParse(pickupFrom).success;
  if (!pointOk || !timeOk) return { ok: false, error: "Choose a collection point and a valid pick-up time." };
  const list = parsePledgeList(String(text).slice(0, 20000));
  if (!list.length) return { ok: false, error: "Paste one tent per line: student name, tent number, matric number, phone, packs." };
  if (list.length > 200) return { ok: false, error: "That is more than 200 lines. Paste fewer at a time." };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "Create the event on the Event tab first." };
  const supabase = await db();
  const { error } = await supabase.from("pledges").insert(list.map((p) => ({ ...p, event_id: event.id, collection_point_id: collectionPointId, pickup_from: pickupFrom })));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, added: list.length };
}
