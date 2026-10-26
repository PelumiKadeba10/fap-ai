import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultCapacity, planTrips, suggestBuses, NO_HUB } from "../lib/trips";
import { canTripMove, freeBuses, groupStops, stopStatus } from "../lib/trip-status";
import { waitingByHub } from "../lib/food-waiting";
import type { DeliveryStatus } from "../lib/types";

const sites = [
  { id: "near", km: 2, direction: "N" as const },
  { id: "mid", km: 5, direction: "N" as const },
  { id: "far", km: 8, direction: "N" as const },
  { id: "west", km: 5, direction: "W" as const },
];
// spareMin is what runMatching reports for a direct drive from the venue.
const alloc = (batchId: string, siteId: string, qty: number, km: number, spareMin = 120) => ({ batchId, siteId, qty, km, spareMin });

test("a trip never exceeds the bus capacity and every portion appears exactly once", () => {
  const allocs = [alloc("b1", "near", 150, 2), alloc("b1", "mid", 120, 5), alloc("b2", "far", 200, 8), alloc("b2", "west", 90, 5), alloc("b3", "mid", 60, 5)];
  const hubs = { b1: "A", b2: "A", b3: "A" };
  const trips = planTrips(allocs, hubs, sites, 400);
  for (const t of trips) {
    assert.ok(t.totalQty <= 400);
    assert.equal(t.totalQty, t.stops.reduce((s, x) => s + x.items.reduce((n, i) => n + i.qty, 0), 0));
  }
  const total = (key: (b: string, s: string) => string) => {
    const m = new Map<string, number>();
    for (const t of trips) for (const s of t.stops) for (const i of s.items) m.set(key(i.batchId, s.siteId), (m.get(key(i.batchId, s.siteId)) ?? 0) + i.qty);
    return m;
  };
  const planned = total((b, s) => `${b}>${s}`);
  const input = new Map<string, number>();
  for (const a of allocs) input.set(`${a.batchId}>${a.siteId}`, (input.get(`${a.batchId}>${a.siteId}`) ?? 0) + a.qty);
  assert.deepEqual([...planned.entries()].sort(), [...input.entries()].sort());
  assert.equal(trips.length, 2); // 620 portions at 400 per trip
});

test("an allocation larger than the capacity is split, smaller ones are not", () => {
  const trips = planTrips([alloc("b1", "mid", 900, 5), alloc("b2", "near", 50, 2)], { b1: "A", b2: "A" }, sites, 400);
  assert.equal(trips.reduce((t, x) => t + x.totalQty, 0), 950);
  assert.ok(trips.every((t) => t.totalQty <= 400));
  // 900 = 400 + 400 + 100; the 50 portions fit with the 100.
  assert.deepEqual(trips.map((t) => t.totalQty).sort((a, b) => b - a), [400, 400, 150]);
  // The 50 are not split across trips.
  assert.equal(trips.flatMap((t) => t.stops).flatMap((s) => s.items).filter((i) => i.batchId === "b2").length, 1);
});

test("hubs are never mixed in one trip", () => {
  const trips = planTrips([alloc("b1", "near", 100, 2), alloc("b2", "near", 100, 2)], { b1: "A", b2: "B" }, sites, 400);
  assert.equal(trips.length, 2);
  for (const t of trips) {
    const batches = new Set(t.stops.flatMap((s) => s.items.map((i) => i.batchId)));
    assert.equal(batches.size, 1);
  }
  assert.deepEqual(new Set(trips.map((t) => t.hubId)), new Set(["A", "B"]));
});

test("food without a hub is planned under the none hub", () => {
  const trips = planTrips([alloc("b1", "near", 100, 2)], {}, sites, 400);
  assert.equal(trips[0].hubId, NO_HUB);
});

test("stops with urgent (hot) food come first, even when farther away", () => {
  const trips = planTrips(
    [alloc("cold", "near", 100, 2, 300), alloc("hot", "far", 100, 8, 20), alloc("cold", "mid", 100, 5, 300)],
    { cold: "A", hot: "A" }, sites, 400,
  );
  assert.equal(trips.length, 1);
  assert.deepEqual(trips[0].stops.map((s) => s.siteId), ["far", "mid", "near"]); // after the urgent stop, nearest-neighbour continues from where the bus is
  assert.deepEqual(trips[0].stops.map((s) => s.order), [1, 2, 3]);
});

test("non-urgent stops are ordered nearest first and ETAs add up with 10 minutes per stop", () => {
  const trips = planTrips([alloc("b", "far", 10, 8), alloc("b", "near", 10, 2), alloc("b", "mid", 10, 5)], { b: "A" }, sites, 400);
  assert.deepEqual(trips[0].stops.map((s) => s.siteId), ["near", "mid", "far"]);
  const [a, b, c] = trips[0].stops;
  assert.equal(a.etaMin, 6); // 2 km at 20 km/h
  assert.equal(b.etaMin, 6 + 10 + 9); // + stop, + 3 km
  assert.equal(c.etaMin, 25 + 10 + 9);
});

test("allocations to the same site are merged into one stop", () => {
  const trips = planTrips([alloc("b1", "mid", 100, 5), alloc("b2", "mid", 50, 5), alloc("b1", "mid", 20, 5)], { b1: "A", b2: "A" }, sites, 400);
  assert.equal(trips[0].stops.length, 1);
  assert.deepEqual(trips[0].stops[0].items.sort((x, y) => x.batchId.localeCompare(y.batchId)), [{ batchId: "b1", qty: 120 }, { batchId: "b2", qty: 50 }]);
});

test("suggestBuses gives the first free bus to the hub with the most food", () => {
  const trips = [{ hubId: "A", totalQty: 100 }, { hubId: "B", totalQty: 400 }, { hubId: "B", totalQty: 300 }];
  assert.deepEqual(suggestBuses(trips, ["x", "y"]), [null, "x", "y"]);
  assert.deepEqual(suggestBuses(trips, []), [null, null, null]);
});

test("default capacity is the smallest active bus", () => {
  assert.equal(defaultCapacity([{ capacity: 400, active: true }, { capacity: 250, active: true }, { capacity: 100, active: false }]), 250);
  assert.equal(defaultCapacity([]), 400);
});

test("trip status rules, stop grouping and free buses", () => {
  assert.ok(canTripMove("planned", "departed"));
  assert.ok(canTripMove("departed", "returned"));
  assert.ok(!canTripMove("returned", "departed"));
  assert.ok(!canTripMove("planned", "returned"));

  const stops = groupStops([
    { site_id: "b", stop_order: 2 }, { site_id: "a", stop_order: 1 }, { site_id: "b", stop_order: 2 },
  ]);
  assert.deepEqual(stops.map((s) => [s.order, s.siteId, s.items.length]), [[1, "a", 1], [2, "b", 2]]);

  assert.equal(stopStatus(["delivered", "delivered"]), "delivered");
  assert.equal(stopStatus(["delivered", "on_the_way"]), "on_the_way");
  assert.equal(stopStatus(["on_the_way", "delayed"]), "delayed");
  assert.equal(stopStatus(["assigned"]), "assigned");

  const buses = [{ id: "1", active: true }, { id: "2", active: true }, { id: "3", active: false }, { id: "4", active: true }];
  const trips = [{ bus_id: "1", status: "departed" as const }, { bus_id: "2", status: "returned" as const }, { bus_id: "4", status: "cancelled" as const }];
  assert.deepEqual(freeBuses(buses, trips).map((b) => b.id), ["2", "4"]);
});

test("food waiting is split by hub and ignores unchecked food", () => {
  const batches = [
    { id: "a", qty: 100, edible_packs: 100, review_status: "approved", collection_point_id: "A" },
    { id: "b", qty: 50, edible_packs: 50, review_status: "approved", collection_point_id: "B" },
    { id: "c", qty: 80, edible_packs: 80, review_status: "pending", collection_point_id: "B" },
    { id: "d", qty: 30, edible_packs: 30, review_status: "approved", collection_point_id: null },
  ];
  assert.deepEqual(waitingByHub(batches, [{ batch_id: "a", qty: 40 }]), {
    A: { portions: 60, batches: 1 }, B: { portions: 50, batches: 1 }, none: { portions: 30, batches: 1 },
  });
});

test("stop alerts flag problems and food close to its safe time, and skip delivered stops", async () => {
  const { stopAlerts } = await import("../lib/trip-status");
  const now = new Date("2026-10-30T20:00:00Z");
  const at = (min: number) => new Date(now.getTime() + min * 60000).toISOString();
  const item = (status: DeliveryStatus, min: number) => ({ status, safe_until: at(min) });
  const stops = [
    { order: 1, siteId: "a", items: [item("delivered", -30)] },
    { order: 2, siteId: "b", items: [item("on_the_way", 12)] },
    { order: 3, siteId: "c", items: [item("delayed", 90)] },
    { order: 4, siteId: "d", items: [item("on_the_way", 60)] },
  ];
  assert.deepEqual(stopAlerts(stops, now, 20).map((a) => [a.siteId, a.kind]), [["b", "time"], ["c", "delayed"]]);
  assert.equal(Math.round(stopAlerts(stops, now, 20)[0].minutesLeft), 12);
});

test("impact totals per hub and per bus", async () => {
  const { hubTotals, busTotals } = await import("../lib/impact");
  const batches = [
    { id: "a", qty: 100, review_status: "approved", collection_point_id: "A" },
    { id: "b", qty: 60, review_status: "approved", collection_point_id: "B" },
    { id: "c", qty: 40, review_status: "pending", collection_point_id: "B" },
    { id: "d", qty: 10, review_status: "approved", collection_point_id: null },
  ];
  const deliveries = [
    { batch_id: "a", qty: 70, status: "delivered" as const }, { batch_id: "a", qty: 30, status: "on_the_way" as const }, { batch_id: "b", qty: 20, status: "delivered" as const },
  ];
  assert.deepEqual(hubTotals(batches, deliveries), [
    { hubId: "A", recovered: 100, delivered: 70 }, { hubId: "B", recovered: 60, delivered: 20 }, { hubId: "none", recovered: 10, delivered: 0 },
  ]);

  const t = (id: string, bus_id: string | null, status: "departed" | "returned" | "planned" | "cancelled") => ({ id, bus_id, status });
  const d = (trip_id: string, site_id: string, stop_order: number, qty: number, ok: boolean | null) => ({
    trip_id, site_id, stop_order, qty, status: (ok === null ? "on_the_way" : "delivered") as DeliveryStatus,
    delivered_at: ok === null ? null : ok ? "2026-10-30T20:00:00Z" : "2026-10-30T22:00:00Z", safe_until: "2026-10-30T21:00:00Z",
  });
  const totals = busTotals(
    [t("t1", "bus1", "returned"), t("t2", "bus1", "departed"), t("t3", "bus2", "planned"), t("t4", "bus2", "cancelled")],
    [d("t1", "s1", 1, 100, true), d("t1", "s1", 1, 50, true), d("t1", "s2", 2, 50, false), d("t2", "s3", 1, 30, null)],
  );
  assert.deepEqual(totals, [{ busId: "bus1", trips: 2, packs: 200, stops: 2, onTimePct: 75 }]);
});

test("an event is live from its start until duration plus 6 hours", async () => {
  const { eventPhase } = await import("../lib/overview");
  const e = { starts_at: "2026-10-30T13:00:00Z", duration_hours: 6 };
  assert.equal(eventPhase(e, new Date("2026-10-30T12:59:00Z")), "upcoming");
  assert.equal(eventPhase(e, new Date("2026-10-30T13:00:00Z")), "live");
  assert.equal(eventPhase(e, new Date("2026-10-31T01:00:00Z")), "live");
  assert.equal(eventPhase(e, new Date("2026-10-31T01:01:00Z")), "past");
});
