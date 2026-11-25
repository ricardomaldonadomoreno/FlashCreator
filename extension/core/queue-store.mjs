const QUEUE_KEY = "flashCreator.queue.v1";

export function createEmptyQueue() {
  return {
    version: 1,
    id: crypto.randomUUID(),
    status: "idle",
    index: 0,
    videoIds: [],
    slots: [],
    history: [],
    config: null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
    updatedAt: new Date().toISOString(),
  };
}

export async function readQueue() {
  const result = await chrome.storage.local.get(QUEUE_KEY);
  return result[QUEUE_KEY] ?? createEmptyQueue();
}

export async function writeQueue(queue) {
  const next = { ...queue, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [QUEUE_KEY]: next });
  return next;
}
