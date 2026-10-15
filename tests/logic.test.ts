import { test } from "node:test";
import assert from "node:assert/strict";
import { predict } from "../lib/predict";
import { urgency } from "../lib/urgency";
import { historyForecast, runMatching, siteNeed } from "../lib/match";
import { parseLocal } from "../lib/parse-local";
import { lagosTimeToday, fmtTime, toLagosInput, fromLagosInput } from "../lib/format";
import { canMove } from "../lib/status";

test("Convocation with 8,000 students predicts 4,000 meals and the right timing", () => {
  const p = predict({ type: "convocation", students: 8000, starts_at: "2026-10-30T14:00:00+01:00", duration_hours: 6 });
  assert.equal(p.people, 8000);
  assert.equal(p.meals, 10000);
  assert.equal(Math.round(p.surplus), 4000);
  assert.equal(p.volunteers, 45);
  assert.equal(p.carriers, 80);
  assert.equal(p.trips, 10);
  assert.equal(fmtTime(p.surplusFrom), "8:00 pm");
  assert.equal(fmtTime(p.volunteersBy), "7:30 pm");
  assert.equal(fmtTime(p.cookedDeliverBy), "10:00 pm");
});

test("entered meals override the estimate", () => {
  const p = predict({ type: "convocation", students: 3000, guests_per_student: 2, meals_served: 14000, starts_at: "2026-10-30T14:00:00+01:00", duration_hours: 6 });
  assert.equal(p.people, 9000);
  assert.equal(p.mealsKnown, true);
  assert.equal(p.meals, 14000);
});

test("hot cooked food is high urgency with a 2-hour window", () => {
  const collected = new Date("2026-10-30T20:15:00+01:00");
  const u = urgency({ category: "cooked_meal", qty: 350, collected_at: collected }, new Date("2026-10-30T20:45:00+01:00"));
  assert.equal(u.level, "high");
  assert.equal(Math.round(u.minutesLeft), 90);
  const bread = urgency({ category: "bread_pastry", qty: 120, collected_at: collected }, new Date("2026-10-30T20:45:00+01:00"));
  assert.equal(bread.level, "low");
});

test("history forecast matches the demo numbers", () => {
  assert.equal(historyForecast([160, 180, 200], 250), 220);
  assert.equal(historyForecast([150, 170, 175], 200), 190);
  assert.equal(siteNeed({ people: 60, history: [26, 28, 30], capacity: 40 }), 60);
});

test("matching fills needs, never over-allocates, sends urgent food first", () => {
  const now = new Date("2026-10-30T20:45:00+01:00");
  const batches = [
    { id: "jollof", category: "cooked_meal" as const, collected_at: "2026-10-30T20:15:00+01:00", available: 350 },
    { id: "bread", category: "bread_pastry" as const, collected_at: "2026-10-30T20:00:00+01:00", available: 120 },
  ];
  const sites = [
    { id: "A", km: 4.2, people: null, history: [160, 180, 200], capacity: 250 },
    { id: "C", km: 3.1, people: null, history: [26, 28, 30], capacity: 40 },
    { id: "B", km: 7.6, people: 100, history: [], capacity: null, alreadyAllocated: 40 },
  ];
  const { allocations, leftovers } = runMatching(batches, sites, now);
  const toSite = (id: string) => allocations.filter((a) => a.siteId === id).reduce((t, a) => t + a.qty, 0);
  assert.equal(toSite("A"), 220);
  assert.equal(toSite("C"), 30);
  assert.equal(toSite("B"), 60); // 100 needed, 40 already sent
  const total = allocations.reduce((t, a) => t + a.qty, 0) + leftovers.reduce((t, l) => t + l.qty, 0);
  assert.equal(total, 470);
  assert.ok(allocations.every((a) => a.spareMin > 0));
  // all jollof goes out before any bread
  const firstBread = allocations.findIndex((a) => a.batchId === "bread");
  assert.ok(firstBread === -1 || allocations.slice(firstBread).every((a) => a.batchId === "bread" || a.spareMin <= allocations[firstBread].spareMin));
});

test("offline parser reads a typical volunteer message", () => {
  const r = parseLocal("350 jollof rice and chicken, packed 8:15pm at Convocation Centre, still hot");
  assert.ok(r);
  assert.equal(r.quantity, 350);
  assert.equal(r.collected_time, "20:15");
  assert.equal(r.category, "cooked_meal");
  assert.equal(r.condition, "Hot, packed");
  assert.match(r.food, /Jollof Rice \+ Chicken/);
  assert.equal(parseLocal("no numbers here"), null);
});

test("Lagos time helpers round-trip", () => {
  const d = lagosTimeToday("20:15", new Date("2026-10-30T12:00:00Z"));
  assert.equal(d?.toISOString(), "2026-10-30T19:15:00.000Z");
  assert.equal(toLagosInput("2026-10-30T13:00:00Z"), "2026-10-30T14:00");
  assert.equal(fromLagosInput("2026-10-30T14:00"), "2026-10-30T13:00:00.000Z");
});

test("status moves follow the volunteer flow", () => {
  assert.ok(canMove("assigned", "picked_up"));
  assert.ok(!canMove("assigned", "delivered"));
  assert.ok(canMove("delayed", "delivered"));
  assert.ok(!canMove("delivered", "on_the_way"));
});

test("food waiting counts approved portions not yet in deliveries and ignores unchecked batches", async () => {
  const { foodWaiting } = await import("../lib/food-waiting");
  const batches = [
    { id: "a", qty: 100, review_status: "approved" },
    { id: "b", qty: 80, review_status: "approved" },
    { id: "c", qty: 50, review_status: "pending" },
    { id: "d", qty: 20 },
  ];
  const deliveries = [{ batch_id: "a", qty: 40 }, { batch_id: "a", qty: 10 }, { batch_id: "b", qty: 80 }];
  assert.deepEqual(foodWaiting(batches, deliveries), { portions: 70, batches: 2 });
  assert.deepEqual(foodWaiting([], []), { portions: 0, batches: 0 });
  // Over-allocated batches never go negative.
  assert.deepEqual(foodWaiting([{ id: "a", qty: 10 }], [{ batch_id: "a", qty: 30 }]), { portions: 0, batches: 0 });
});
