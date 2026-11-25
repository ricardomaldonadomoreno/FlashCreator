import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCHEDULE, parseClock, planSchedule } from "./scheduler.mjs";

const mondayMorning = new Date("2026-11-23T09:00:00");
const config = { ...DEFAULT_SCHEDULE, startDelayMinutes: 0, intervalMinutes: 30, windowStart: "08:00", windowEnd: "10:00", activeDays: [1, 2, 3, 4, 5], maxPerDay: 2, jitterMinutes: 0, maxHorizonDays: 10 };

test("parses valid local clock values and rejects out-of-range values", () => {
  assert.equal(parseClock("08:15"), 495);
  assert.equal(parseClock("24:00"), null);
  assert.equal(parseClock("8:15"), null);
});

test("keeps planned slots inside the time window and daily cap", () => {
  const result = planSchedule(4, config, { now: mondayMorning, random: () => 0.5 });
  assert.equal(result.slots.length, 4);
  assert.deepEqual(result.issues, []);
  for (const slot of result.slots) {
    assert.ok(slot.localTime >= "08:00" && slot.localTime <= "10:00");
  }
  const counts = new Map();
  for (const slot of result.slots) counts.set(slot.localDate, (counts.get(slot.localDate) ?? 0) + 1);
  assert.ok([...counts.values()].every((count) => count <= 2));
});

test("skips inactive days and obeys the user-provided daily cap", () => {
  const onlyMondayAndWednesday = { ...config, activeDays: [1, 3], maxPerDay: 1, intervalMinutes: 5 };
  const result = planSchedule(3, onlyMondayAndWednesday, { now: mondayMorning, random: () => 0.5 });
  assert.equal(result.slots.length, 3);
  assert.deepEqual(result.slots.map((slot) => new Date(slot.instant).getDay()), [1, 3, 1]);
});

test("reports when the latest slot crosses the configured horizon", () => {
  const result = planSchedule(20, { ...config, maxPerDay: 1, maxHorizonDays: 2, activeDays: [1] }, { now: mondayMorning, random: () => 0.5 });
  assert.ok(result.issues.some((issue) => issue.code === "horizon-exceeded"));
});

test("rejects an invalid window instead of producing a schedule", () => {
  const result = planSchedule(2, { ...config, windowStart: "22:00", windowEnd: "08:00" }, { now: mondayMorning });
  assert.equal(result.slots.length, 0);
  assert.ok(result.issues.some((issue) => issue.code === "invalid-window"));
});
