const test = require("node:test");
const assert = require("node:assert/strict");
const { AgentError, BrowserAgent, STUDIO_URL, isUploadRoute, localSlot, slotFields } = require("./browser-agent.cjs");

test("accepts only the HTTPS TikTok Studio upload route", () => {
  assert.equal(isUploadRoute(STUDIO_URL), true);
  assert.equal(isUploadRoute(`${STUDIO_URL}?from=webapp&tab=video`), true);
  assert.equal(isUploadRoute("http://www.tiktok.com/tiktokstudio/upload"), false);
  assert.equal(isUploadRoute("https://tiktok.com/tiktokstudio/upload"), false);
  assert.equal(isUploadRoute("https://www.tiktok.com/tiktokstudio/"), false);
  assert.equal(isUploadRoute("https://www.tiktok.com.evil.example/tiktokstudio/upload"), false);
});

test("converts a stored instant to local calendar inputs", () => {
  const instant = new Date(2026, 10, 27, 9, 5).toISOString();
  assert.deepEqual(localSlot(instant), { date: "2026-11-27", time: "09:05" });
});

test("uses the persisted local wall-clock slot instead of recalculating from the current system zone", () => {
  assert.deepEqual(slotFields({ instant: "2026-11-27T15:05:00.000Z", localDate: "2026-11-27", localTime: "09:05" }), {
    date: "2026-11-27",
    time: "09:05",
  });
  assert.throws(() => slotFields({ localDate: "2026-02-30", localTime: "09:05" }), /fuera de rango/);
});

test("processes items sequentially and confirms each only after its action returns", async () => {
  const updates = [];
  const agent = new BrowserAgent({ profilePath: "/unused", onUpdate: (update) => updates.push(update), retryDelayMs: 0 });
  const order = [];
  agent.processItem = async (item) => { order.push(item.id); };

  const result = await agent.runBatch([{ id: "a" }, { id: "b" }], [{}, {}]);
  assert.deepEqual(order, ["a", "b"]);
  assert.deepEqual(updates.filter((update) => update.status === "scheduled").map((update) => update.videoId), ["a", "b"]);
  assert.equal(result.status, "completed");
});

test("retries only explicitly retryable pre-submit failures, at most twice", async () => {
  const updates = [];
  const agent = new BrowserAgent({ profilePath: "/unused", onUpdate: (update) => updates.push(update), retryDelayMs: 0 });
  let attempts = 0;
  agent.processItem = async () => {
    attempts += 1;
    if (attempts < 3) throw new AgentError("Transient failure", { retryable: true });
  };

  const result = await agent.runBatch([{ id: "a" }], [{}]);
  assert.equal(attempts, 3);
  assert.equal(result.status, "completed");
  assert.equal(updates.at(-1).status, "scheduled");
});

test("does not retry when the final schedule submission has an uncertain result", async () => {
  const updates = [];
  const agent = new BrowserAgent({ profilePath: "/unused", onUpdate: (update) => updates.push(update), retryDelayMs: 0 });
  let attempts = 0;
  agent.processItem = async () => {
    attempts += 1;
    throw new AgentError("Submission uncertain", { phase: "after_submit" });
  };

  const result = await agent.runBatch([{ id: "a" }, { id: "b" }], [{}, {}]);
  assert.equal(attempts, 1);
  assert.equal(result.status, "paused");
  assert.equal(updates.at(-1).status, "needs_verification");
});
