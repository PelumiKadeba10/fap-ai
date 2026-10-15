import type { Category } from "./types";

/** How long each kind of food stays safe after collection, and how perishable it is (0–1). */
export const CATEGORIES: Record<Category, { label: string; windowMin: number; perish: number }> = {
  cooked_meal: { label: "Cooked meal", windowMin: 120, perish: 1.0 },
  bread_pastry: { label: "Bread / pastry", windowMin: 480, perish: 0.5 },
  fruit_veg: { label: "Fruit / vegetables", windowMin: 720, perish: 0.6 },
  packaged: { label: "Packaged / sealed", windowMin: 2880, perish: 0.1 },
  drinks: { label: "Drinks", windowMin: 2880, perish: 0.1 },
};

export type UrgencyLevel = "high" | "med" | "low";

export interface Urgency {
  score: number; // 0–100
  level: UrgencyLevel;
  safeUntil: Date;
  minutesLeft: number;
}

/**
 * Urgency = 55% how perishable the food is + 45% how much of its safe window has passed,
 * plus a small bump for big batches. 60+ is high, 35+ is medium.
 */
export function urgency(b: { category: Category; qty: number; collected_at: string | Date }, now: Date = new Date()): Urgency {
  const c = CATEGORIES[b.category] ?? CATEGORIES.cooked_meal;
  const collected = new Date(b.collected_at).getTime();
  const elapsed = (now.getTime() - collected) / 60000;
  const frac = Math.min(1, Math.max(0, elapsed / c.windowMin));
  const raw = 100 * (0.55 * c.perish + 0.45 * frac) + Math.min(8, b.qty / 50);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const level: UrgencyLevel = score >= 60 ? "high" : score >= 35 ? "med" : "low";
  const safeUntil = new Date(collected + c.windowMin * 60000);
  return { score, level, safeUntil, minutesLeft: (safeUntil.getTime() - now.getTime()) / 60000 };
}

/** Guess a category from free text (used by the offline parser). */
export function guessCategory(text: string): Category {
  const t = text.toLowerCase();
  if (/rice|jollof|stew|chicken|beef|turkey|fish|beans|moi ?moi|plantain|dodo|amala|eba|pounded|yam|spaghetti|pasta|soup|swallow|meal|food/.test(t)) return "cooked_meal";
  if (/bread|cake|pastr|puff|doughnut|meat ?pie|roll|sandwich/.test(t)) return "bread_pastry";
  if (/fruit|banana|orange|apple|pineapple|watermelon|vegetable|salad/.test(t)) return "fruit_veg";
  if (/water|juice|drink|malt|soda|zobo|yoghurt/.test(t)) return "drinks";
  if (/biscuit|sealed|packaged|sachet|noodle|indomie|snack/.test(t)) return "packaged";
  return "cooked_meal";
}
