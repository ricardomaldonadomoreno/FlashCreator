const QUEUE_KEY = "flashCreator.queue.v1";

export const QUEUE_ITEM_STATUSES = Object.freeze({
  PENDING: "pending",
  PREPARING: "preparing",
  AWAITING_CONFIRMATION: "awaiting_confirmation",
  SCHEDULED: "scheduled",
  FAILED: "failed",
  NEEDS_VERIFICATION: "needs_verification",
});

const VALID_ITEM_STATUSES = new Set(Object.values(QUEUE_ITEM_STATUSES));
const ACTIVE_ITEM_STATUSES = new Set([
  QUEUE_ITEM_STATUSES.PREPARING,
]);
const LOCKED_ITEM_STATUSES = new Set([
  QUEUE_ITEM_STATUSES.PREPARING,
  QUEUE_ITEM_STATUSES.AWAITING_CONFIRMATION,
  QUEUE_ITEM_STATUSES.SCHEDULED,
  QUEUE_ITEM_STATUSES.NEEDS_VERIFICATION,
]);
const VALID_QUEUE_STATUSES = new Set([
  "idle",
  "planned",
  "running",
  "paused",
  "needs_verification",
  "completed",
]);
const LOCKED_QUEUE_STATUSES = new Set(["running", "paused", "needs_verification", "completed"]);
const RETRY_BASE_DELAY_MS = 30_000;
export const MAX_PRE_SUBMIT_RETRIES = 2;

const nowIso = () => new Date().toISOString();
const safeCount = (value) => Number.isInteger(value) && value >= 0 ? value : 0;

export function createEmptyQueue() {
  return {
    version: 2,
    id: crypto.randomUUID(),
    status: "idle",
    index: 0,
    currentVideoId: null,
    videoIds: [],
    items: [],
    slots: [],
    history: [],
    config: null,
    preflight: null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
    updatedAt: nowIso(),
  };
}

export function createQueueItem(videoId, slot = null) {
  return {
    videoId,
    status: QUEUE_ITEM_STATUSES.PENDING,
    attemptCount: 0,
    slot,
    lastResult: null,
    updatedAt: nowIso(),
  };
}

/** Normalize the v1 queue shape and preserve a per-video state keyed by stable media ID. */
export function normalizeQueue(value) {
  const source = value && typeof value === "object" ? value : {};
  const base = createEmptyQueue();
  const rawIds = Array.isArray(source.videoIds) ? source.videoIds : [];
  const videoIds = rawIds.filter((id) => typeof id === "string" && id.length > 0);
  const hasDuplicateIds = new Set(videoIds).size !== videoIds.length;
  const uniqueVideoIds = [...new Set(videoIds)];
  const slots = hasDuplicateIds ? [] : Array.isArray(source.slots) ? source.slots : [];
  const previousItems = new Map(
    (Array.isArray(source.items) ? source.items : [])
      .filter((item) => item && typeof item.videoId === "string")
      .map((item) => [item.videoId, item]),
  );
  const items = uniqueVideoIds.map((videoId, index) => {
    const previous = previousItems.get(videoId) ?? {};
    const status = VALID_ITEM_STATUSES.has(previous.status)
      ? previous.status
      : QUEUE_ITEM_STATUSES.PENDING;
    return {
      videoId,
      status,
      attemptCount: safeCount(previous.attemptCount),
      slot: slots[index] ?? null,
      lastResult: previous.lastResult && typeof previous.lastResult === "object" ? previous.lastResult : null,
      updatedAt: typeof previous.updatedAt === "string" ? previous.updatedAt : nowIso(),
    };
  });
  const requestedIndex = safeCount(source.index);
  const anchoredIndex = typeof source.currentVideoId === "string"
    ? uniqueVideoIds.indexOf(source.currentVideoId)
    : -1;
  const index = anchoredIndex >= 0 ? anchoredIndex : Math.min(requestedIndex, uniqueVideoIds.length);

  return {
    ...base,
    ...source,
    version: 2,
    id: typeof source.id === "string" && source.id ? source.id : base.id,
    status: VALID_QUEUE_STATUSES.has(source.status) ? source.status : "idle",
    index,
    currentVideoId: uniqueVideoIds[index] ?? null,
    videoIds: uniqueVideoIds,
    items,
    slots,
    history: Array.isArray(source.history) ? source.history : [],
    config: source.config && typeof source.config === "object" ? source.config : null,
    preflight: hasDuplicateIds
      ? null
      : source.preflight && typeof source.preflight === "object" ? source.preflight : null,
    timeZone: typeof source.timeZone === "string" && source.timeZone
      ? source.timeZone
      : Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : nowIso(),
  };
}

/** Keep the resume cursor attached to the same video when a safe draft is reordered or edited. */
export function reconcileQueueVideoIds(value, nextIds) {
  const queue = normalizeQueue(value);
  const videoIds = [...new Set((Array.isArray(nextIds) ? nextIds : [])
    .filter((id) => typeof id === "string" && id.length > 0))];
  const previousAnchor = queue.currentVideoId ?? queue.videoIds[queue.index] ?? null;
  const oldIndex = previousAnchor ? queue.videoIds.indexOf(previousAnchor) : queue.index;
  const keepEndCursor = queue.videoIds.length > 0 && queue.index >= queue.videoIds.length && !previousAnchor;
  const currentVideoId = keepEndCursor
    ? null
    : previousAnchor && videoIds.includes(previousAnchor)
    ? previousAnchor
    : videoIds[Math.min(Math.max(oldIndex, 0), Math.max(videoIds.length - 1, 0))] ?? null;
  const index = currentVideoId ? videoIds.indexOf(currentVideoId) : keepEndCursor ? videoIds.length : 0;

  return normalizeQueue({
    ...queue,
    videoIds,
    currentVideoId,
    index,
    slots: [],
    preflight: null,
  });
}

export function queueIsEditable(value) {
  const queue = normalizeQueue(value);
  return !LOCKED_QUEUE_STATUSES.has(queue.status)
    && !queue.items.some((item) => LOCKED_ITEM_STATUSES.has(item.status));
}

/**
 * Never resume an item that might have crossed an external side-effect boundary.
 * A later TikTok adapter must require human verification before retrying this item.
 */
export function recoverInterruptedQueue(value, recoveredAt = nowIso()) {
  const queue = normalizeQueue(value);
  const interruptedIndices = new Set(
    queue.items.flatMap((item, index) => ACTIVE_ITEM_STATUSES.has(item.status) ? [index] : []),
  );

  if (queue.status === "running" && queue.items[queue.index]) {
    const current = queue.items[queue.index];
    if (![QUEUE_ITEM_STATUSES.SCHEDULED, QUEUE_ITEM_STATUSES.FAILED, QUEUE_ITEM_STATUSES.NEEDS_VERIFICATION].includes(current.status)) {
      interruptedIndices.add(queue.index);
    }
  }
  if (interruptedIndices.size === 0) return queue;

  const items = queue.items.map((item, index) => {
    if (!interruptedIndices.has(index)) return item;
    return {
      ...item,
      status: QUEUE_ITEM_STATUSES.NEEDS_VERIFICATION,
      lastResult: {
        code: "interrupted-unknown",
        message: "La cola se interrumpió. Verifica el resultado antes de volver a intentar este video.",
        at: recoveredAt,
      },
      updatedAt: recoveredAt,
    };
  });
  const firstInterrupted = Math.min(...interruptedIndices);
  return {
    ...queue,
    items,
    index: firstInterrupted,
    currentVideoId: queue.videoIds[firstInterrupted] ?? null,
    status: "needs_verification",
    updatedAt: recoveredAt,
  };
}

export function queueItemStatusLabel(status) {
  const labels = {
    [QUEUE_ITEM_STATUSES.PENDING]: "En cola local · sin enviar",
    [QUEUE_ITEM_STATUSES.PREPARING]: "Preparando",
    [QUEUE_ITEM_STATUSES.AWAITING_CONFIRMATION]: "Archivo en Studio · revisión manual pendiente",
    [QUEUE_ITEM_STATUSES.SCHEDULED]: "Estado local: programado (sin confirmar)",
    [QUEUE_ITEM_STATUSES.FAILED]: "Error · revisa antes de reintentar",
    [QUEUE_ITEM_STATUSES.NEEDS_VERIFICATION]: "Interrumpido · verifica antes de reintentar",
  };
  return labels[status] ?? labels[QUEUE_ITEM_STATUSES.PENDING];
}

/**
 * Retry policy for a future sender: only explicitly retryable failures before
 * the final external action qualify. A null result means never retry automatically.
 */
export function getPreSubmitRetryDelayMs(item) {
  if (item?.status !== QUEUE_ITEM_STATUSES.FAILED) return null;
  if (item.lastResult?.phase !== "before_submit" || item.lastResult?.retryable !== true) return null;
  const failedAttempts = safeCount(item.attemptCount);
  if (failedAttempts < 1 || failedAttempts > MAX_PRE_SUBMIT_RETRIES) return null;
  return RETRY_BASE_DELAY_MS * (2 ** (failedAttempts - 1));
}

export async function readQueue() {
  const result = await chrome.storage.local.get(QUEUE_KEY);
  const saved = result[QUEUE_KEY];
  if (!saved) return createEmptyQueue();

  const recovered = recoverInterruptedQueue(saved);
  await chrome.storage.local.set({ [QUEUE_KEY]: recovered });
  return recovered;
}

export async function writeQueue(queue) {
  const next = { ...normalizeQueue(queue), updatedAt: nowIso() };
  await chrome.storage.local.set({ [QUEUE_KEY]: next });
  return next;
}
