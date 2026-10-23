import { test } from "node:test";
import assert from "node:assert/strict";
import { tapTime } from "../lib/tap-time";

const NOW = Date.parse("2026-10-23T20:00:00.000Z");

test("a recent tap time is kept", () => {
  assert.equal(tapTime("2026-10-23T19:40:00.000Z", NOW), "2026-10-23T19:40:00.000Z");
});

test("missing or invalid tap times become now", () => {
  assert.equal(tapTime(undefined, NOW), "2026-10-23T20:00:00.000Z");
  assert.equal(tapTime("not a date", NOW), "2026-10-23T20:00:00.000Z");
  assert.equal(tapTime(42, NOW), "2026-10-23T20:00:00.000Z");
});

test("tap times from the future or over a day old become now", () => {
  assert.equal(tapTime("2026-10-23T21:00:00.000Z", NOW), "2026-10-23T20:00:00.000Z");
  assert.equal(tapTime("2026-10-22T19:00:00.000Z", NOW), "2026-10-23T20:00:00.000Z");
});

test("a few minutes of clock drift ahead is clamped to now", () => {
  assert.equal(tapTime("2026-10-23T20:03:00.000Z", NOW), "2026-10-23T20:00:00.000Z");
});
