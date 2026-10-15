import type { EventType } from "./types";
import { CATEGORIES } from "./urgency";

/** Share of meals that usually go uneaten, by event type. Recalibrate after every event. */
export const EVENT_TYPES: Record<EventType, { label: string; rate: number }> = {
  convocation: { label: "Convocation", rate: 0.4 },
  matriculation: { label: "Matriculation", rate: 0.15 },
  conference: { label: "Conference", rate: 0.12 },
  wedding: { label: "Wedding", rate: 0.16 },
  religious: { label: "Religious gathering", rate: 0.14 },
};

/** Caterers for large events usually plan about 25% extra. */
export const MEALS_PER_PERSON = 1.25;

export interface PredictInput {
  type: EventType;
  students: number;
  guests_per_student?: number;
  meals_served?: number | null;
  vendors?: number;
  starts_at: string | Date;
  duration_hours: number;
}

export interface Prediction {
  people: number;
  meals: number;
  mealsKnown: boolean;
  rate: number;
  surplus: number;
  low: number;
  high: number;
  volunteers: number;
  carriers: number;
  trips: number;
  collectionPoints: number;
  surplusFrom: Date;
  volunteersBy: Date;
  cookedDeliverBy: Date;
}

export function predict(e: PredictInput): Prediction {
  const rate = EVENT_TYPES[e.type].rate;
  const vendors = e.vendors ?? 5;
  const people = Math.round(e.students * (1 + (e.guests_per_student ?? 0)));
  const mealsKnown = !!e.meals_served && e.meals_served > 0;
  const meals = mealsKnown ? (e.meals_served as number) : Math.round(people * MEALS_PER_PERSON);
  const serveRatio = people > 0 ? meals / people : MEALS_PER_PERSON;
  const overAdj = Math.min(1.6, Math.max(0.6, 1 + 0.6 * (serveRatio - MEALS_PER_PERSON)));
  const vendorAdj = 1 + 0.02 * (vendors - 5);
  const surplus = Math.max(0, meals * rate * overAdj * vendorAdj);

  const start = new Date(e.starts_at).getTime();
  const end = start + e.duration_hours * 3600_000;
  return {
    people,
    meals,
    mealsKnown,
    rate,
    surplus,
    low: surplus * 0.82,
    high: surplus * 1.18,
    volunteers: Math.ceil(surplus / 90),
    carriers: Math.ceil(surplus / 50),
    trips: Math.ceil(surplus / 400),
    collectionPoints: Math.max(1, vendors),
    surplusFrom: new Date(end),
    volunteersBy: new Date(end - 30 * 60000),
    cookedDeliverBy: new Date(end + CATEGORIES.cooked_meal.windowMin * 60000),
  };
}
