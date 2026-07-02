import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNextSendAt } from "../src/lib/schedule.ts";

// Helper: assert a Date equals an ISO instant.
function assertInstant(actual: Date, expectedISO: string, msg?: string) {
  assert.equal(actual.toISOString(), new Date(expectedISO).toISOString(), msg);
}

const NY = "America/New_York";

test("weekly: next Sunday 9am local, strictly after from", () => {
  // Wed 2026-02-04 12:00 UTC. Next Sunday is 2026-02-08. Winter → EST (-05:00) → 14:00 UTC.
  const from = new Date("2026-02-04T12:00:00Z");
  const next = computeNextSendAt("weekly", 0, 9, NY, from);
  assertInstant(next, "2026-02-08T14:00:00Z");
});

test("weekly: from exactly on the send instant rolls forward a full week", () => {
  // 2026-02-08T14:00Z is itself Sunday 9am EST. Result must be strictly after → next Sunday.
  const from = new Date("2026-02-08T14:00:00Z");
  const next = computeNextSendAt("weekly", 0, 9, NY, from);
  assertInstant(next, "2026-02-15T14:00:00Z");
});

test("weekly DST spring-forward: Sunday 9am stays 9am local across the transition", () => {
  // DST begins 2026-03-08 (02:00 EST → 03:00 EDT). A Sunday-9am schedule the week of the change
  // must land at 09:00 EDT = 13:00 UTC — NOT the 14:00 UTC a naive from+7*24h would give.
  const from = new Date("2026-03-04T12:00:00Z"); // Wed before the change
  const next = computeNextSendAt("weekly", 0, 9, NY, from);
  assertInstant(next, "2026-03-08T13:00:00Z", "9am EDT (-04:00) after spring-forward");
});

test("weekly DST fall-back: Sunday 9am is 9am EST after the transition", () => {
  // DST ends 2026-11-01 (02:00 EDT → 01:00 EST). Sunday 9am that day is 09:00 EST = 14:00 UTC.
  const from = new Date("2026-10-28T12:00:00Z");
  const next = computeNextSendAt("weekly", 0, 9, NY, from);
  assertInstant(next, "2026-11-01T14:00:00Z");
});

test("weekly across DST: consecutive sends stay 9am local (offset shifts, wall time doesn't)", () => {
  // Feb 8 (EST, 14:00Z) → chaining through the March 8 transition, every send is 9am local.
  let cursor = new Date("2026-02-04T12:00:00Z");
  const expected = [
    "2026-02-08T14:00:00Z", // EST
    "2026-02-15T14:00:00Z", // EST
    "2026-02-22T14:00:00Z", // EST
    "2026-03-01T14:00:00Z", // EST
    "2026-03-08T13:00:00Z", // EDT — clocks sprang forward
    "2026-03-15T13:00:00Z", // EDT
  ];
  for (const iso of expected) {
    cursor = computeNextSendAt("weekly", 0, 9, NY, cursor);
    assertInstant(cursor, iso);
  }
});

test("daily: next occurrence of the hour, ignoring send_day", () => {
  const from = new Date("2026-02-04T20:00:00Z"); // 15:00 EST, past 9am today
  const next = computeNextSendAt("daily", null, 9, NY, from);
  assertInstant(next, "2026-02-05T14:00:00Z", "tomorrow 9am EST");
});

test("daily: earlier in the day returns today's slot", () => {
  const from = new Date("2026-02-04T10:00:00Z"); // 05:00 EST, before 9am
  const next = computeNextSendAt("daily", null, 9, NY, from);
  assertInstant(next, "2026-02-04T14:00:00Z", "today 9am EST");
});

test("biweekly: from a send instant skips a week to keep ~14-day spacing", () => {
  const from = new Date("2026-02-08T14:00:00Z"); // Sunday 9am EST
  const next = computeNextSendAt("biweekly", 0, 9, NY, from);
  assertInstant(next, "2026-02-22T14:00:00Z", "two weeks later, not one");
});

test("biweekly: chained cadence is a clean 14 days apart", () => {
  let cursor = new Date("2026-02-08T14:00:00Z");
  const first = computeNextSendAt("biweekly", 0, 9, NY, cursor);
  const second = computeNextSendAt("biweekly", 0, 9, NY, first);
  assertInstant(first, "2026-02-22T14:00:00Z");
  assertInstant(second, "2026-03-08T13:00:00Z"); // 14 wall-days later, now EDT
});

test("monthly: first Monday of the next applicable month", () => {
  // From mid-Feb 2026, first Monday of March 2026 is the 2nd. 9am EST = 14:00 UTC.
  const from = new Date("2026-02-15T12:00:00Z");
  const next = computeNextSendAt("monthly", 1, 9, NY, from);
  assertInstant(next, "2026-03-02T14:00:00Z");
});

test("monthly: from before this month's first weekday returns this month", () => {
  // 2026-03-01 is a Sunday; first Monday is the 2nd. A `from` on the 1st should stay in March.
  const from = new Date("2026-03-01T06:00:00Z");
  const next = computeNextSendAt("monthly", 1, 9, NY, from);
  assertInstant(next, "2026-03-02T14:00:00Z");
});

test("monthly: from past this month's first weekday advances to next month", () => {
  // Already past the first Monday (Mar 2). Next is the first Monday of April = the 6th.
  const from = new Date("2026-03-10T12:00:00Z");
  const next = computeNextSendAt("monthly", 1, 9, NY, from);
  assertInstant(next, "2026-04-06T13:00:00Z", "April is EDT");
});

test("send_day is required for weekly/biweekly/monthly", () => {
  assert.throws(() => computeNextSendAt("weekly", null, 9, NY, new Date()), /send_day is required/);
  assert.throws(() => computeNextSendAt("monthly", null, 9, NY, new Date()), /send_day is required/);
});

test("timezone is honored: UTC zone yields the literal hour", () => {
  const from = new Date("2026-02-04T12:00:00Z");
  const next = computeNextSendAt("weekly", 0, 9, "UTC", from);
  assertInstant(next, "2026-02-08T09:00:00Z");
});
