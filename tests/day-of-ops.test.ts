import { test } from "node:test";
import assert from "node:assert/strict";
import { cartonsFor, fmtPacks, packsFromCartons } from "../lib/cartons";
import { busesOut, nextTripNos, outMessage, tripPhase } from "../lib/bus-state";
import { freeBuses } from "../lib/trip-status";
import { limitToFreeBuses } from "../lib/trips";
import { predict } from "../lib/predict";
import { isLate, parsePledgeList, pledgeCounts } from "../lib/pledges";
import type { DeliveryStatus, TripStatus } from "../lib/types";

test("cartons are rounded up and packs are shown only when no carton size is set", () => {
  assert.equal(cartonsFor(60, 10), 6);
  assert.equal(cartonsFor(61, 10), 7);
  assert.equal(cartonsFor(1, 10), 1);
  assert.equal(cartonsFor(0, 10), 0);
  assert.equal(cartonsFor(60, null), null);
  assert.equal(cartonsFor(60, 0), null);
  assert.equal(fmtPacks(60, 10), "6 cartons (≈60 packs)");
  assert.equal(fmtPacks(55, 10), "6 cartons (≈60 packs)");
  assert.equal(fmtPacks(8, 10), "1 carton (≈10 packs)");
  assert.equal(fmtPacks(60, null), "60 packs");
  assert.equal(fmtPacks(1, undefined), "1 pack");
  assert.equal(packsFromCartons(40, 10), 400);
});

test("one bus gets trip numbers 1, 2, 3 in approval order; other buses count separately", () => {
  assert.deepEqual(nextTripNos([], ["bus1", "bus1", "bus1"]), [1, 2, 3]);
  const existing = [{ bus_id: "bus1", trip_no: 1 }, { bus_id: "bus1", trip_no: 2 }, { bus_id: "bus2", trip_no: 1 }];
  assert.deepEqual(nextTripNos(existing, ["bus1"]), [3]);
  assert.deepEqual(nextTripNos(existing, ["bus2", "bus1", "bus2"]), [2, 3, 3]);
  // A trip without a bus gets no number and does not use one up.
  assert.deepEqual(nextTripNos(existing, [null, "bus1", null]), [null, 3, null]);
  // Gaps (e.g. a bus changed on a trip) never reuse a number.
  assert.deepEqual(nextTripNos([{ bus_id: "bus1", trip_no: 4 }], ["bus1"]), [5]);
});

test("a bus is not free while its trip is planned, loading, on the road or returning", () => {
  const buses = [{ id: "1", active: true }];
  const free = (status: TripStatus) => freeBuses(buses, [{ bus_id: "1", status }]).length === 1;
  assert.equal(free("planned"), false);
  assert.equal(free("loading"), false);
  assert.equal(free("departed"), false);
  // Back at the collection point (or cancelled): free again.
  assert.equal(free("returned"), true);
  assert.equal(free("cancelled"), true);

  // Every stop delivered but the lead has not tapped "Back at collection point": still "returning", still busy.
  const all: DeliveryStatus[] = ["delivered", "delivered"];
  assert.equal(tripPhase("departed", all), "returning");
  assert.equal(tripPhase("departed", ["delivered", "on_the_way"]), "on_the_road");
  assert.equal(tripPhase("departed", ["delayed"]), "on_the_road");
  assert.equal(tripPhase("planned", []), "planned");
  assert.equal(tripPhase("returned", all), "returned");
  const out = busesOut(
    [{ id: "1", name: "Bus 1", active: true }],
    [{ id: "t1", bus_id: "1", trip_no: 1, status: "returned" }, { id: "t2", bus_id: "1", trip_no: 2, status: "departed" }],
    [{ trip_id: "t2", status: "delivered" }],
  );
  assert.deepEqual(out, [{ busId: "1", name: "Bus 1", tripNo: 2, phase: "returning" }]);
});

test("when the only bus is out the plan says so", () => {
  const out = busesOut(
    [{ id: "1", name: "Bus 1", active: true }],
    [{ id: "t", bus_id: "1", trip_no: 2, status: "departed" }],
    [{ trip_id: "t", status: "on_the_way" }],
  );
  assert.equal(outMessage(out), "Bus 1 is out on trip 2 · food waiting will go on the next trip");
  assert.equal(outMessage([]), null);
});

test("only as many trips are planned as there are free buses, most urgent first", () => {
  const trip = (name: string, spareMin: number) => ({ name, stops: [{ spareMin }, { spareMin: spareMin + 100 }] });
  const trips = [trip("a", 90), trip("b", 15), trip("c", 40)];
  assert.deepEqual(limitToFreeBuses(trips, 0), []);
  assert.deepEqual(limitToFreeBuses(trips, 1).map((t) => t.name), ["b"]);
  assert.deepEqual(limitToFreeBuses(trips, 2).map((t) => t.name), ["b", "c"]); // original order kept
  assert.equal(limitToFreeBuses(trips, 3), trips);
});

test("food_from replaces the event end for surplus-available and cooked-food deadline", () => {
  const base = { type: "convocation" as const, students: 1000, starts_at: "2026-10-30T13:00:00Z", duration_hours: 6 };
  const old = predict(base);
  assert.equal(old.surplusFrom.toISOString(), "2026-10-30T19:00:00.000Z");
  assert.equal(old.cookedDeliverBy.toISOString(), "2026-10-30T21:00:00.000Z");
  assert.equal(predict({ ...base, food_from: null }).surplusFrom.toISOString(), old.surplusFrom.toISOString());
  const p = predict({ ...base, food_from: "2026-10-30T12:00:00Z" });
  assert.equal(p.surplusFrom.toISOString(), "2026-10-30T12:00:00.000Z");
  assert.equal(p.cookedDeliverBy.toISOString(), "2026-10-30T14:00:00.000Z");
  assert.equal(p.volunteersBy.toISOString(), old.volunteersBy.toISOString());
  assert.equal(p.surplus, old.surplus);
});

test("pledged tents: late after 30 minutes, counts, and pasted lists", () => {
  const at = (min: number) => new Date(Date.parse("2026-10-30T12:00:00Z") + min * 60000).toISOString();
  const now = new Date(at(31));
  assert.equal(isLate({ status: "pledged", pickup_from: at(0) }, now), true);
  assert.equal(isLate({ status: "on_the_way", pickup_from: at(0) }, now), true);
  assert.equal(isLate({ status: "pledged", pickup_from: at(2) }, now), false);
  assert.equal(isLate({ status: "picked_up", pickup_from: at(0) }, now), false);
  assert.equal(isLate({ status: "no_food", pickup_from: at(0) }, now), false);
  assert.equal(isLate({ status: "pledged", pickup_from: null }, now), false);
  assert.deepEqual(pledgeCounts([{ status: "pledged" }, { status: "pledged" }, { status: "picked_up" }]), { pledged: 2, on_the_way: 0, picked_up: 1, no_food: 0 });
  assert.deepEqual(parsePledgeList("Tent 4, 0803 123 4567, 200\n\nHall B\nTent C, , 50 packs\n"), [
    { tent_name: "Tent 4", contact_phone: "0803 123 4567", pledged_packs: 200 },
    { tent_name: "Hall B", contact_phone: null, pledged_packs: null },
    { tent_name: "Tent C", contact_phone: null, pledged_packs: 50 },
  ]);
});
