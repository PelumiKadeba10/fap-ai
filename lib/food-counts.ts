import type { DeliveryStatus } from "./types";

export type FoodCountRow = {
  hubId: string;
  collected: number;
  edible: number | null;
  loaded: number | null;
  delivered: number;
  discarded: number | null;
  notLoaded: number | null;
};

export function validateEdible(collected: number, edible: number) {
  if (!Number.isInteger(edible) || edible < 0) return "Enter a whole number of edible packs.";
  if (edible > collected) return `Edible packs cannot be above the ${collected} packs collected at this collection point.`;
  return null;
}

export function validateLoaded(edible: number | null, alreadyLoaded: number, loaded: number) {
  if (!Number.isInteger(loaded) || loaded < 0) return "Enter a whole number of packs loaded.";
  if (edible == null) return "Enter the edible pack count at this collection point before loading.";
  if (alreadyLoaded + loaded > edible) return `Loaded packs cannot be above the ${edible} edible packs at this collection point.`;
  return null;
}

export function foodCountSummary(
  batches: { qty: number; collection_point_id: string | null }[],
  edible: { collection_point_id: string; edible_packs: number }[],
  trips: { hub_id: string | null; loaded_packs: number | null }[],
  deliveries: { batch_id: string; qty: number; status: DeliveryStatus }[],
  batchIds: { id: string; collection_point_id: string | null }[],
): FoodCountRow[] {
  const batchHub = new Map(batchIds.map((b) => [b.id, b.collection_point_id ?? "none"]));
  const map = new Map<string, FoodCountRow>();
  const row = (hubId: string) => map.get(hubId) ?? (map.set(hubId, { hubId, collected: 0, edible: null, loaded: 0, delivered: 0, discarded: null, notLoaded: null }), map.get(hubId)!);
  for (const b of batches) row(b.collection_point_id ?? "none").collected += b.qty;
  for (const e of edible) row(e.collection_point_id).edible = e.edible_packs;
  const tripHubs = new Set<string>();
  for (const t of trips) { const hub = t.hub_id ?? "none"; tripHubs.add(hub); const r = row(hub); if (t.loaded_packs == null) r.loaded = null; else if (r.loaded != null) r.loaded += t.loaded_packs; }
  for (const r of map.values()) if (!tripHubs.has(r.hubId)) r.loaded = null;
  for (const d of deliveries) if (d.status === "delivered") row(batchHub.get(d.batch_id) ?? "none").delivered += d.qty;
  return [...map.values()].map((r) => ({ ...r, discarded: r.edible == null ? null : Math.max(0, r.collected - r.edible), notLoaded: r.edible == null || r.loaded == null ? null : Math.max(0, r.edible - r.loaded) })).sort((a, b) => b.collected - a.collected);
}
