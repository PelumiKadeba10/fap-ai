import type { Category, Direction } from "./types";
import { urgency } from "./urgency";

export const AVG_SPEED_KMH = 20; // evening traffic around Ota

export interface MatchBatch {
  id: string;
  category: Category;
  collected_at: string | Date;
  /** Portions still to be sent out (batch qty minus what is already allocated). */
  available: number;
}

export interface MatchSite {
  id: string;
  km: number;
  people: number | null;
  history: number[];
  capacity: number | null;
  /** Portions already sent to this site for this event. */
  alreadyAllocated?: number;
}

export interface Allocation {
  batchId: string;
  siteId: string;
  qty: number;
  km: number;
  eta: Date;
  safeUntil: Date;
  /** Minutes between ETA and safe time; negative = arrives too late. */
  spareMin: number;
}

/** Need forecast from past distributions: last value + average change, rounded to 5, capped at capacity. */
export function historyForecast(history: number[], capacity: number | null): number | null {
  if (!history || history.length < 2) return history?.length === 1 ? history[0] : null;
  const last = history[history.length - 1];
  const slope = (last - history[0]) / (history.length - 1);
  const f = Math.round((last + slope) / 5) * 5;
  return capacity ? Math.min(f, capacity) : f;
}

/** People to feed tonight: the number entered, else the history forecast. */
export function siteNeed(s: Pick<MatchSite, "people" | "history" | "capacity">): number {
  if (s.people != null) return s.people;
  return historyForecast(s.history, s.capacity) ?? 0;
}

/**
 * Greedy matching: most urgent batch first. For each batch, score every site with need left:
 *   45% how much of its need is still unmet
 *   25–60% closeness (distance matters more when the food is urgent)
 *   15% capacity headroom
 * Send as much as the best site needs, then move to the next best.
 */
export function runMatching(batches: MatchBatch[], sites: MatchSite[], now: Date = new Date()) {
  const pool = sites
    .map((s) => {
      const need = siteNeed(s);
      return { ...s, need, left: Math.max(0, need - (s.alreadyAllocated ?? 0)) };
    })
    .filter((s) => s.need > 0);
  const maxKm = Math.max(1, ...pool.map((s) => s.km));

  const ordered = batches
    .filter((b) => b.available > 0)
    .map((b) => ({ b, u: urgency({ category: b.category, qty: b.available, collected_at: b.collected_at }, now) }))
    .sort((p, q) => q.u.score - p.u.score);

  const allocations: Allocation[] = [];
  const leftovers: { batchId: string; qty: number }[] = [];

  for (const { b, u } of ordered) {
    let rem = b.available;
    const uf = u.score / 100;
    while (rem > 0) {
      const open = pool.filter((s) => s.left > 0);
      if (!open.length) break;
      let best = open[0];
      let bestScore = -Infinity;
      for (const s of open) {
        const cap = s.capacity || s.need;
        const score = 0.45 * (s.left / s.need) + (0.25 + 0.35 * uf) * (1 - s.km / (maxKm * 1.2)) + 0.15 * (1 - (s.need - s.left) / cap);
        if (score > bestScore) { bestScore = score; best = s; }
      }
      const qty = Math.min(rem, best.left);
      const eta = new Date(now.getTime() + (best.km / AVG_SPEED_KMH) * 3600_000);
      allocations.push({
        batchId: b.id, siteId: best.id, qty, km: best.km, eta, safeUntil: u.safeUntil,
        spareMin: (u.safeUntil.getTime() - eta.getTime()) / 60000,
      });
      best.left -= qty;
      rem -= qty;
    }
    if (rem > 0) leftovers.push({ batchId: b.id, qty: rem });
  }

  // Deliver the most urgent and nearest first.
  allocations.sort((a, b) => a.spareMin - b.spareMin || a.km - b.km);
  return { allocations, leftovers, sites: pool };
}

export const DIRECTIONS: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DIR_DEG: Record<Direction, number> = { N: 90, NE: 45, E: 0, SE: -45, S: -90, SW: -135, W: 180, NW: 135 };

/** Position for the schematic map: venue at (0,0), 1 unit ≈ 1 straight-line km. */
export function sitePosition(km: number, dir: Direction, roadFactor = 1.3) {
  const r = km / roadFactor;
  const a = (DIR_DEG[dir] * Math.PI) / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}
