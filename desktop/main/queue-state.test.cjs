const test = require("node:test");
const assert = require("node:assert/strict");
const { hasUnresolvedQueueItem, recoverQueue } = require("./queue-state.cjs");

const stamp = "2026-11-27T18:00:00.000Z";

function runningQueue(items, plannedVideoIds = items.map((item) => item.videoId)) {
  return { status: "running", items, plannedVideoIds, slots: [{ instant: "saved-slot" }], history: [] };
}

test("recovers a crash after the last schedule update as completed", () => {
  const initial = runningQueue([{ videoId: "a", status: "scheduled" }]);
  const recovered = recoverQueue(initial, stamp);
  assert.equal(recovered.status, "completed");
  assert.deepEqual(recovered.slots, initial.slots);
  assert.equal(recovered.history[0].event, "completed_recovered");
});

test("recovers a crash between items as paused without changing saved slots", () => {
  const initial = runningQueue([
    { videoId: "a", status: "scheduled" },
    { videoId: "b", status: "pending" },
  ]);
  const recovered = recoverQueue(initial, stamp);
  assert.equal(recovered.status, "paused");
  assert.deepEqual(recovered.slots, initial.slots);
  assert.equal(recovered.history[0].event, "paused_by_restart");
});

test("moves an interrupted submission to manual verification instead of retrying it", () => {
  const recovered = recoverQueue(runningQueue([{ videoId: "a", status: "submitting" }]), stamp);
  assert.equal(recovered.status, "needs_verification");
  assert.equal(recovered.items[0].status, "needs_verification");
  assert.equal(recovered.items[0].lastResult.retryable, false);
  assert.equal(recovered.history[0].event, "interrupted");
});

test("locks edits until uncertain or exhausted failures are explicitly resolved", () => {
  assert.equal(hasUnresolvedQueueItem({ items: [{ status: "needs_verification" }] }), true);
  assert.equal(hasUnresolvedQueueItem({ items: [{ status: "failed", lastResult: { retryable: false } }] }), true);
  assert.equal(hasUnresolvedQueueItem({ items: [{ status: "failed", lastResult: { retryable: true } }] }), false);
  assert.equal(hasUnresolvedQueueItem({ items: [{ status: "scheduled" }] }), false);
});
