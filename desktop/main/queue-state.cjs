const INTERRUPTED_STATUSES = new Set(["submitting", "uploading", "awaiting_schedule"]);
const UNCERTAIN_STATUSES = new Set([...INTERRUPTED_STATUSES, "needs_verification", "needs_user"]);

function hasUnresolvedQueueItem(queue) {
  return (queue.items ?? []).some((item) => UNCERTAIN_STATUSES.has(item.status)
    || (item.status === "failed" && item.lastResult?.retryable !== true));
}

function recoverQueue(queue, at = new Date().toISOString()) {
  if (queue.status !== "running") return queue;

  const queueItems = queue.items ?? [];
  const interrupted = queueItems.filter((item) => INTERRUPTED_STATUSES.has(item.status));
  const allPlannedScheduled = (queue.plannedVideoIds ?? []).length > 0
    && queue.plannedVideoIds.every((id) => queueItems.find((item) => item.videoId === id)?.status === "scheduled");
  const items = queueItems.map((item) => INTERRUPTED_STATUSES.has(item.status)
    ? { ...item, status: "needs_verification", lastResult: { ...(item.lastResult ?? {}), message: "La app se cerró durante una acción; revisa Studio antes de decidir.", retryable: false, at } }
    : item);
  const status = interrupted.length ? "needs_verification" : allPlannedScheduled ? "completed" : "paused";
  const lastError = interrupted.length
    ? "La app se cerró durante una acción. Revisa Studio antes de reanudar."
    : allPlannedScheduled
      ? "La última tanda ya estaba programada antes de cerrarse la app."
      : "La app se cerró entre acciones; puedes reanudar la agenda guardada.";
  const recoveryEvents = interrupted.length
    ? interrupted.map((item) => ({ at, event: "interrupted", videoId: item.videoId, status: item.status }))
    : [{ at, event: allPlannedScheduled ? "completed_recovered" : "paused_by_restart" }];

  return {
    ...queue,
    status,
    lastError,
    items,
    history: [...(queue.history ?? []), ...recoveryEvents].slice(-2000),
  };
}

module.exports = { hasUnresolvedQueueItem, recoverQueue };
