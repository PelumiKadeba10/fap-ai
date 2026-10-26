// Shapes of the database rows (see supabase/migrations/0001_init.sql).

export type Category = "cooked_meal" | "bread_pastry" | "fruit_veg" | "packaged" | "drinks";
export type EventType = "convocation" | "matriculation" | "conference" | "wedding" | "religious";
export type SiteKind = "School" | "Community" | "Care home" | "Shelter" | "Other";
export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type ReviewStatus = "pending" | "approved";
export type TripStatus = "planned" | "loading" | "departed" | "returned" | "cancelled";
export type DeliveryStatus = "assigned" | "picked_up" | "on_the_way" | "delayed" | "delivered";

export interface EventRow {
  id: string;
  name: string;
  type: EventType;
  students: number;
  guests_per_student: number;
  meals_served: number | null;
  vendors: number;
  starts_at: string;
  duration_hours: number;
  venue_name: string;
  active: boolean;
  /** Packs in one carton; null = show packs only. */
  packs_per_carton: number | null;
  /** "Food starts arriving at". Null = the event end (start + duration). */
  food_from: string | null;
  /** "Bus at collection point by". */
  bus_ready_by: string | null;
}

export interface Site {
  id: string;
  name: string;
  kind: SiteKind;
  people: number | null;
  history: number[];
  capacity: number | null;
  km: number;
  direction: Direction;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  active: boolean;
  created_at?: string;
}

export interface Volunteer {
  id: string;
  name: string;
  phone: string | null;
  vehicle: "none" | "car" | "bike";
}

export interface Batch {
  id: string;
  event_id: string;
  food: string;
  qty: number;
  /** Edible quantity recorded for this report; null means an old report has not been sorted yet. */
  edible_packs: number | null;
  category: Category;
  collected_at: string;
  location: string;
  condition: string | null;
  notes: string | null;
  raw_message: string | null;
  parsed_by: "claude" | "local" | "manual" | null;
  review_status: ReviewStatus;
  collection_point_id: string | null;
  photo_path: string | null;
  /** 'pickup' = collected from a pledged tent. */
  source: string | null;
  created_at: string;
}

export interface CollectionPoint {
  id: string;
  event_id: string;
  name: string;
  location_note: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  volunteers: number | null;
  token: string;
  active: boolean;
  created_at: string;
}

export interface Delivery {
  id: string;
  event_id: string;
  batch_id: string;
  site_id: string;
  volunteer_id: string | null;
  qty: number;
  status: DeliveryStatus;
  token: string;
  safe_until: string;
  planned_km: number | null;
  trip_id: string | null;
  stop_order: number | null;
  was_delayed: boolean;
  delivered_at: string | null;
  updated_at: string;
  created_at: string;
}

/** What the message parser (Claude or offline) returns. */
export interface ParsedRecord {
  food: string;
  quantity: number;
  collected_time: string | null; // "HH:MM", 24-hour, Lagos time
  location: string;
  condition: string;
  category: Category;
  notes: string;
}

/** A place on this event's list: the shared site, with this event's own "people to feed" number. */
export type EventPlace = Omit<Site, "people"> & { people: number; event_site_id: string };

export interface Bus {
  id: string;
  event_id: string;
  name: string;
  capacity: number;
  lead_name: string | null;
  lead_phone: string | null;
  active: boolean;
  created_at: string;
}

export interface Trip {
  id: string;
  event_id: string;
  hub_id: string | null;
  bus_id: string | null;
  /** The bus's 1st, 2nd, 3rd... trip of the event; null while no bus is chosen. */
  trip_no: number | null;
  status: TripStatus;
  created_at: string;
  departed_at: string | null;
  returned_at: string | null;
  loaded_packs: number | null;
}

/** The one link a bus lead keeps open for the whole event. */
export interface BusLink {
  id: string;
  event_id: string;
  bus_id: string;
  token: string;
  created_at: string;
}

export type PledgeStatus = "pledged" | "on_the_way" | "picked_up" | "no_food";

/** A tent that promised food, to be collected from `pickup_from` and brought to a collection point. */
export interface Pledge {
  id: string;
  event_id: string;
  tent_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  pledged_packs: number | null;
  pickup_from: string | null;
  collection_point_id: string | null;
  status: PledgeStatus;
  picked_up_at: string | null;
  picked_up_packs: number | null;
  batch_id: string | null;
  notes: string | null;
  created_at: string;
}
