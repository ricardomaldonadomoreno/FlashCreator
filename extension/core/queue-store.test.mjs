import test from "node:test";
import assert from "node:assert/strict";
import {
  getPreSubmitRetryDelayMs,
  MAX_PRE_SUBMIT_RETRIES,
  normalizeQueue,
  QUEUE_ITEM_STATUSES,
  queueIsEditable,
  queueItemStatusLabel,
  readQueue,
  reconcileQueueVideoIds,
  recoverInterruptedQueue,
} from "./queue-store.mjs";

const slot = (instant, index) => ({
  index,
  instant,
  localDate: "2026-11-25",
  localTime: "10:00",
  display: "25 nov 2026, 10:00",
});

test("migrates a v1 queue while preserving order, planned slots, config and timezone", () => {
  const legacy = {
    version: 1,
    id: "queue-1",
    status: "idle",
    index: 0,
    videoIds: ["video-a", "video-b"],
    slots: [slot("2026-11-25T14:00:00.000Z", 0), slot("2026-11-25T15:00:00.000Z", 1)],
    history: [],
    config: { intervalMinutes: 35 },
    timeZone: "America/Bogota",
  };

  const queue = normalizeQueue(legacy);

  assert.equal(queue.version, 2);
  assert.deepEqual(queue.videoIds, ["video-a", "video-b"]);
  assert.equal(queue.timeZone, "America/Bogota");
  assert.deepEqual(queue.config, { intervalMinutes: 35 });
  assert.equal(queue.items[0].status, QUEUE_ITEM_STATUSES.PENDING);
  assert.equal(queue.items[0].slot.instant, "2026-11-25T14:00:00.000Z");
  assert.equal(queue.items[1].slot.instant, "2026-11-25T15:00:00.000Z");
});

test("deduplicates malformed IDs and invalidates the ambiguous schedule", () => {
  const queue = normalizeQueue({
    id: "queue-2",
    index: 2,
    currentVideoId: "video-b",
    videoIds: ["video-a", "video-a", null, "video-b"],
    slots: [slot("2026-11-25T14:00:00.000Z", 0), slot("2026-11-25T14:30:00.000Z", 1), slot("2026-11-25T15:00:00.000Z", 2)],
    preflight: { issues: [] },
  });

  assert.deepEqual(queue.videoIds, ["video-a", "video-b"]);
  assert.equal(queue.index, 1);
  assert.equal(queue.currentVideoId, "video-b");
  assert.deepEqual(queue.slots, []);
  assert.equal(queue.preflight, null);
  assert.ok(queue.items.every((item) => item.slot === null));
});

test("keeps the resume cursor attached to the same video after reorder or removal", () => {
  const draft = {
    version: 2,
    id: "queue-3",
    status: "planned",
    index: 1,
    currentVideoId: "video-b",
    videoIds: ["video-a", "video-b", "video-c"],
    items: [
      { videoId: "video-a", status: "pending" },
      { videoId: "video-b", status: "pending" },
      { videoId: "video-c", status: "pending" },
    ],
    slots: [slot("2026-11-25T14:00:00.000Z", 0), slot("2026-11-25T14:30:00.000Z", 1), slot("2026-11-25T15:00:00.000Z", 2)],
  };

  const reordered = reconcileQueueVideoIds(draft, ["video-c", "video-a", "video-b"]);
  assert.equal(reordered.currentVideoId, "video-b");
  assert.equal(reordered.index, 2);
  assert.deepEqual(reordered.slots, []);

  const removedBeforeCursor = reconcileQueueVideoIds(draft, ["video-a", "video-c"]);
  assert.equal(removedBeforeCursor.currentVideoId, "video-c");
  assert.equal(removedBeforeCursor.index, 1);
});

test("does not allow edits to a queue with an in-flight or unverified external state", () => {
  assert.equal(queueIsEditable({ status: "planned", videoIds: ["v1"], items: [{ videoId: "v1", status: "pending" }] }), true);
  assert.equal(queueIsEditable({ status: "running", videoIds: ["v1"], items: [{ videoId: "v1", status: "pending" }] }), false);
  assert.equal(queueIsEditable({ status: "idle", videoIds: ["v1"], items: [{ videoId: "v1", status: "needs_verification" }] }), false);
});

test("a scheduled label is explicitly local and not an unverified TikTok success claim", () => {
  const label = queueItemStatusLabel(QUEUE_ITEM_STATUSES.SCHEDULED);
  assert.match(label, /local/i);
  assert.match(label, /sin confirmar/i);
});

test("marks an interrupted in-flight item for verification instead of retrying it", () => {
  const queue = recoverInterruptedQueue({
    version: 2,
    id: "queue-4",
    status: "running",
    index: 1,
    currentVideoId: "video-b",
    videoIds: ["video-a", "video-b", "video-c"],
    items: [
      { videoId: "video-a", status: "scheduled", attemptCount: 1 },
      { videoId: "video-b", status: "awaiting_confirmation", attemptCount: 1 },
      { videoId: "video-c", status: "pending", attemptCount: 0 },
    ],
    slots: [slot("2026-11-25T14:00:00.000Z", 0), slot("2026-11-25T15:00:00.000Z", 1), slot("2026-11-25T16:00:00.000Z", 2)],
  }, "2026-11-25T20:00:00.000Z");

  assert.equal(queue.status, "needs_verification");
  assert.equal(queue.index, 1);
  assert.equal(queue.currentVideoId, "video-b");
  assert.equal(queue.items[0].status, QUEUE_ITEM_STATUSES.SCHEDULED);
  assert.equal(queue.items[1].status, QUEUE_ITEM_STATUSES.NEEDS_VERIFICATION);
  assert.equal(queue.items[1].attemptCount, 1);
  assert.equal(queue.items[1].lastResult.code, "interrupted-unknown");
  assert.equal(queue.items[2].status, QUEUE_ITEM_STATUSES.PENDING);
});

test("keeps a non-running draft and its saved schedule unchanged", () => {
  const draft = {
    version: 2,
    id: "queue-5",
    status: "planned",
    index: 0,
    videoIds: ["video-a"],
    items: [{ videoId: "video-a", status: "pending", attemptCount: 0 }],
    slots: [slot("2026-11-25T14:00:00.000Z", 0)],
  };

  const queue = recoverInterruptedQueue(draft, "2026-11-25T20:00:00.000Z");

  assert.equal(queue.status, "planned");
  assert.equal(queue.items[0].status, QUEUE_ITEM_STATUSES.PENDING);
  assert.equal(queue.items[0].slot.instant, draft.slots[0].instant);
});

test("readQueue writes recovery state back to chrome.storage.local", async () => {
  const storageKey = "flashCreator.queue.v1";
  const saved = {
    version: 1,
    id: "queue-6",
    status: "running",
    index: 0,
    videoIds: ["video-a"],
    items: [{ videoId: "video-a", status: "preparing", attemptCount: 1 }],
    slots: [slot("2026-11-25T14:00:00.000Z", 0)],
    timeZone: "America/Bogota",
  };
  const writes = [];
  const originalChrome = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => {
          assert.equal(key, storageKey);
          return { [storageKey]: saved };
        },
        set: async (value) => writes.push(value),
      },
    },
  };

  try {
    const queue = await readQueue();
    assert.equal(queue.status, "needs_verification");
    assert.equal(queue.version, 2);
    assert.equal(queue.timeZone, "America/Bogota");
    assert.equal(queue.items[0].status, QUEUE_ITEM_STATUSES.NEEDS_VERIFICATION);
    assert.equal(writes.length, 1);
    assert.equal(writes[0][storageKey].status, "needs_verification");
  } finally {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  }
});

test("preserves the end cursor on an existing queue but starts at zero for a new queue", () => {
  const finishedDraft = { status: "idle", index: 2, videoIds: ["video-a", "video-b"], items: [] };
  const appended = reconcileQueueVideoIds(finishedDraft, ["video-a", "video-b", "video-c"]);
  assert.equal(appended.index, 3);
  assert.equal(appended.currentVideoId, null);

  const firstImport = reconcileQueueVideoIds({ status: "idle", index: 0, videoIds: [], items: [] }, ["video-first"]);
  assert.equal(firstImport.index, 0);
  assert.equal(firstImport.currentVideoId, "video-first");
});

test("allows at most two incremental retries only for explicitly retryable pre-submit failures", () => {
  const failed = (attemptCount, phase = "before_submit", retryable = true) => ({
    status: QUEUE_ITEM_STATUSES.FAILED,
    attemptCount,
    lastResult: { phase, retryable },
  });

  assert.equal(MAX_PRE_SUBMIT_RETRIES, 2);
  assert.equal(getPreSubmitRetryDelayMs(failed(1)), 30_000);
  assert.equal(getPreSubmitRetryDelayMs(failed(2)), 60_000);
  assert.equal(getPreSubmitRetryDelayMs(failed(3)), null);
  assert.equal(getPreSubmitRetryDelayMs(failed(1, "after_submit")), null);
  assert.equal(getPreSubmitRetryDelayMs({ ...failed(1), status: QUEUE_ITEM_STATUSES.NEEDS_VERIFICATION }), null);
});
