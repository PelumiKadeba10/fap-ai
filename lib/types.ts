// Shapes of the database rows (see supabase/migrations/0001_init.sql).

export type Category = "cooked_meal" | "bread_pastry" | "fruit_veg" | "packaged" | "drinks";
export type EventType = "convocation" | "matriculation" | "conference" | "wedding" | "religious";
export type SiteKind = "School" | "Community" | "Care home" | "Shelter" | "Other";
export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
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
  category: Category;
  collected_at: string;
  location: string;
  condition: string | null;
  notes: string | null;
  raw_message: string | null;
  parsed_by: "claude" | "local" | "manual" | null;
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
