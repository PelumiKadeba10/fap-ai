import { test } from "node:test";
import assert from "node:assert/strict";
import { foodCountSummary, validateEdible, validateLoaded } from "../lib/food-counts";

test("edible cannot exceed collected", () => {
  assert.equal(validateEdible(20, 21), "Edible packs cannot be above the 20 packs collected at this collection point.");
  assert.equal(validateEdible(20, 20), null);
});

test("loaded cannot exceed edible", () => {
  assert.equal(validateLoaded(20, 5, 16), "Loaded packs cannot be above the 20 edible packs at this collection point.");
  assert.equal(validateLoaded(20, 5, 15), null);
});

test("food count summary totals per collection point and overall", () => {
  const rows = foodCountSummary(
    [{ id: "a", qty: 100, edible_packs: 80, collection_point_id: "A" }, { id: "b", qty: 50, edible_packs: 40, collection_point_id: "B" }],
    [{ hub_id: "A", loaded_packs: 60 }, { hub_id: "B", loaded_packs: 30 }],
    [{ batch_id: "a", qty: 50, status: "delivered" }, { batch_id: "b", qty: 20, status: "on_the_way" }],
  );
  assert.deepEqual(rows, [
    { hubId: "A", collected: 100, edible: 80, loaded: 60, delivered: 50, discarded: 20, notLoaded: 20 },
    { hubId: "B", collected: 50, edible: 40, loaded: 30, delivered: 0, discarded: 10, notLoaded: 10 },
  ]);
  assert.deepEqual(rows.reduce((n, r) => n + r.collected, 0), 150);
  assert.deepEqual(rows.reduce((n, r) => n + (r.edible ?? 0), 0), 120);
  assert.deepEqual(rows.reduce((n, r) => n + r.loaded, 0), 90);
  assert.deepEqual(rows.reduce((n, r) => n + r.delivered, 0), 50);
});
