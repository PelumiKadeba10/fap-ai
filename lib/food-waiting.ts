export interface FoodWaiting {
  /** Approved portions not yet in any delivery. */
  portions: number;
  /** Approved batches that still have portions left. */
  batches: number;
}

/** Food ready for matching: approved batches minus what deliveries already take. Unchecked food is ignored. */
export function foodWaiting(
  batches: { id: string; qty: number; review_status?: string }[],
  deliveries: { batch_id: string; qty: number }[],
): FoodWaiting {
  const sent = new Map<string, number>();
  for (const d of deliveries) sent.set(d.batch_id, (sent.get(d.batch_id) ?? 0) + d.qty);
  let portions = 0;
  let count = 0;
  for (const b of batches) {
    if ((b.review_status ?? "approved") !== "approved") continue;
    const left = Math.max(0, b.qty - (sent.get(b.id) ?? 0));
    if (left > 0) { portions += left; count++; }
  }
  return { portions, batches: count };
}

/** Same as foodWaiting, split by the hub (collection point) each batch sits in. Food without a hub goes under "none". */
export function waitingByHub(
  batches: { id: string; qty: number; review_status?: string; collection_point_id?: string | null }[],
  deliveries: { batch_id: string; qty: number }[],
): Record<string, FoodWaiting> {
  const out: Record<string, FoodWaiting> = {};
  for (const b of batches) {
    const hub = b.collection_point_id || "none";
    const w = foodWaiting([b], deliveries);
    if (!w.batches) continue;
    const cur = out[hub] ?? { portions: 0, batches: 0 };
    out[hub] = { portions: cur.portions + w.portions, batches: cur.batches + w.batches };
  }
  return out;
}
