import { addVideos, listVideoMetadata, removeVideo } from "./core/local-media-store.mjs";
import { DEFAULT_SCHEDULE, formatSlotForDisplay, planSchedule } from "./core/scheduler.mjs";
import { queueIsEditable, queueItemStatusLabel, readQueue, reconcileQueueVideoIds, writeQueue } from "./core/queue-store.mjs";

const elements = {
  picker: document.querySelector("#video-picker"),
  count: document.querySelector("#video-count"),
  importStatus: document.querySelector("#import-status"),
  videoList: document.querySelector("#video-list"),
  planButton: document.querySelector("#plan-button"),
  scheduleErrors: document.querySelector("#schedule-errors"),
  scheduleList: document.querySelector("#schedule-list"),
};

let queue;
let videos = [];
let configSaveTimer = null;
let isImporting = false;

const sizeLabel = (bytes) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

function showError(message) {
  elements.scheduleErrors.hidden = false;
  elements.scheduleErrors.textContent = message;
}

function createButton(label, title, onClick, disabled = false, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-button ${extraClass}`.trim();
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function renderVideos() {
  const canEditQueue = queueIsEditable(queue);
  const byId = new Map(videos.map((video) => [video.id, video]));
  const queueItems = new Map((queue.items ?? []).map((item) => [item.videoId, item]));
  const ordered = (queue.videoIds ?? []).map((id) => byId.get(id)).filter(Boolean);
  elements.count.textContent = String(ordered.length);
  elements.videoList.replaceChildren();

  ordered.forEach((video, index) => {
    const row = document.createElement("li");
    row.className = "video-item";

    const number = document.createElement("span");
    number.className = "video-index";
    number.textContent = String(index + 1).padStart(2, "0");

    const content = document.createElement("span");
    content.className = "video-meta";
    const name = document.createElement("span");
    name.className = "video-name";
    name.textContent = video.name;
    const size = document.createElement("span");
    size.className = "video-size";
    size.textContent = `${sizeLabel(video.size)} · ${new Date(video.lastModified).toLocaleDateString("es")}`;
    const queueItem = queueItems.get(video.id);
    const state = document.createElement("span");
    state.className = "video-state";
    state.textContent = queueItemStatusLabel(queueItem?.status);
    if (queueItem?.lastResult?.message) state.title = queueItem.lastResult.message;
    content.append(name, size, state);

    const actions = document.createElement("span");
    actions.className = "video-actions";
    actions.append(
      createButton("↑", "Mover video hacia arriba", () => moveVideo(index, -1), !canEditQueue || index === 0),
      createButton("↓", "Mover video hacia abajo", () => moveVideo(index, 1), !canEditQueue || index === ordered.length - 1),
      createButton("×", "Quitar video y borrarlo del almacenamiento local", () => deleteVideo(video.id), !canEditQueue, "remove"),
    );
    row.append(number, content, actions);
    elements.videoList.append(row);
  });

  elements.picker.disabled = isImporting || !canEditQueue;
  document.querySelectorAll(".schedule-card input").forEach((input) => { input.disabled = !canEditQueue; });
  elements.planButton.disabled = ordered.length === 0 || !canEditQueue;
  if (ordered.length === 0) {
    elements.importStatus.textContent = "Todavía no hay archivos en la cola.";
  } else {
    elements.importStatus.textContent = `${ordered.length} video${ordered.length === 1 ? "" : "s"} guardado${ordered.length === 1 ? "" : "s"} en este equipo.`;
  }
  renderSchedule();
}

function renderSchedule() {
  elements.scheduleList.replaceChildren();
  const byId = new Map(videos.map((video) => [video.id, video]));
  const slots = queue.slots ?? [];

  slots.forEach((slot, index) => {
    const item = document.createElement("li");
    item.className = "schedule-item";
    const title = document.createElement("span");
    const video = byId.get(queue.videoIds?.[index]);
    title.textContent = `${String(index + 1).padStart(2, "0")} · ${video?.name ?? "Video en cola"}`;
    const time = document.createElement("small");
    time.textContent = slot.display || formatSlotForDisplay(slot);
    item.append(title, time);
    elements.scheduleList.append(item);
  });

  const issues = queue.preflight?.issues ?? [];
  if (issues.length) {
    elements.scheduleErrors.hidden = false;
    elements.scheduleErrors.textContent = issues.map((issue) => issue.message).join(" ");
  } else {
    elements.scheduleErrors.hidden = true;
    elements.scheduleErrors.textContent = "";
    if (slots.length) {
      const success = document.createElement("p");
      success.className = "schedule-ok";
      success.textContent = `Vista previa guardada · zona horaria ${queue.timeZone}`;
      elements.scheduleList.append(success);
    }
  }
}

function readScheduleConfig() {
  const days = [...document.querySelectorAll(".day-picker input:checked")].map((input) => Number(input.value));
  return {
    startDelayMinutes: Number(document.querySelector("#start-delay").value),
    intervalMinutes: Number(document.querySelector("#interval").value),
    windowStart: document.querySelector("#window-start").value,
    windowEnd: document.querySelector("#window-end").value,
    activeDays: days,
    maxPerDay: Number(document.querySelector("#daily-cap").value),
    jitterMinutes: Number(document.querySelector("#jitter").value),
    maxHorizonDays: Number(document.querySelector("#horizon").value),
  };
}

function restoreConfig(config = DEFAULT_SCHEDULE) {
  document.querySelector("#start-delay").value = config.startDelayMinutes;
  document.querySelector("#interval").value = config.intervalMinutes;
  document.querySelector("#window-start").value = config.windowStart;
  document.querySelector("#window-end").value = config.windowEnd;
  document.querySelector("#daily-cap").value = config.maxPerDay;
  document.querySelector("#jitter").value = config.jitterMinutes;
  document.querySelector("#horizon").value = config.maxHorizonDays;
  const activeDays = new Set(config.activeDays ?? DEFAULT_SCHEDULE.activeDays);
  document.querySelectorAll(".day-picker input").forEach((input) => {
    input.checked = activeDays.has(Number(input.value));
  });
}

function handleScheduleChange() {
  if (!queue || !queueIsEditable(queue)) return;
  queue = { ...queue, config: readScheduleConfig(), slots: [], preflight: null };
  renderSchedule();
  clearTimeout(configSaveTimer);
  configSaveTimer = setTimeout(() => {
    persistQueue().catch((error) => showError(error.message || "No se pudo guardar la configuración local."));
  }, 250);
}

async function persistQueue() {
  queue = await writeQueue(queue);
}

async function moveVideo(index, offset) {
  if (!queueIsEditable(queue)) return;
  const target = index + offset;
  if (target < 0 || target >= queue.videoIds.length) return;
  const videoIds = [...queue.videoIds];
  [videoIds[index], videoIds[target]] = [videoIds[target], videoIds[index]];
  queue = reconcileQueueVideoIds(queue, videoIds);
  await persistQueue();
  renderVideos();
}

async function deleteVideo(id) {
  if (!queueIsEditable(queue)) return;
  try {
    await removeVideo(id);
    queue = reconcileQueueVideoIds(queue, queue.videoIds.filter((videoId) => videoId !== id));
    videos = videos.filter((video) => video.id !== id);
    await persistQueue();
    renderVideos();
  } catch (error) {
    elements.importStatus.textContent = error.message || "No se pudo quitar el video del almacenamiento local.";
  }
}

async function handleImport() {
  if (!queue || !queueIsEditable(queue) || isImporting) return;
  const files = [...(elements.picker.files ?? [])];
  if (!files.length) return;
  elements.importStatus.textContent = "Guardando archivos directamente en el almacenamiento local…";
  isImporting = true;
  elements.picker.disabled = true;
  try {
    const result = await addVideos(files);
    videos = [...videos, ...result.added];
    queue = reconcileQueueVideoIds(queue, [...queue.videoIds, ...result.added.map((video) => video.id)]);
    await persistQueue();
    const rejectedMessage = result.rejected.length
      ? ` No se agregaron: ${result.rejected.map((file) => `${file.name}: ${file.reason}`).join(" ")}`
      : "";
    elements.importStatus.textContent = result.added.length
      ? `Se guardaron ${result.added.length} video${result.added.length === 1 ? "" : "s"} localmente.${rejectedMessage}`
      : `No se agregaron videos.${rejectedMessage}`;
    renderVideos();
  } catch (error) {
    elements.importStatus.textContent = error.message || "No se pudieron guardar los archivos localmente.";
  } finally {
    isImporting = false;
    elements.picker.disabled = !queueIsEditable(queue);
    elements.picker.value = "";
  }
}

async function handlePlan() {
  if (!queue || !queueIsEditable(queue)) return;
  elements.scheduleErrors.hidden = true;
  const config = readScheduleConfig();
  const result = planSchedule(queue.videoIds.length, config, { now: new Date() });
  queue = {
    ...queue,
    config,
    slots: result.slots,
    preflight: { issues: result.issues, checkedAt: new Date().toISOString() },
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
  };
  await persistQueue();
  renderSchedule();
}

async function initialize() {
  try {
    queue = await readQueue();
    if (!Array.isArray(queue.videoIds)) queue.videoIds = [];
    if (!Array.isArray(queue.slots)) queue.slots = [];
    videos = await listVideoMetadata();
    const existingIds = new Set(videos.map((video) => video.id));
    const retainedIds = queue.videoIds.filter((id) => existingIds.has(id));
    const retainedSet = new Set(retainedIds);
    const recoveredVideos = videos.filter((video) => !retainedSet.has(video.id));
    const nextIds = [...retainedIds, ...recoveredVideos.map((video) => video.id)];
    const queueChanged = nextIds.length !== queue.videoIds.length || nextIds.some((id, index) => id !== queue.videoIds[index]);
    queue = queueChanged ? reconcileQueueVideoIds(queue, nextIds) : queue;
    queue = { ...queue, timeZone: queue.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "local" };
    restoreConfig(queue.config ?? DEFAULT_SCHEDULE);
    await persistQueue();
    renderVideos();
    if (recoveredVideos.length) {
      elements.importStatus.textContent = `Se recuperaron ${recoveredVideos.length} video${recoveredVideos.length === 1 ? "" : "s"} guardado${recoveredVideos.length === 1 ? "" : "s"} localmente.`;
    }
  } catch (error) {
    elements.importStatus.textContent = error.message || "No se pudo abrir el almacenamiento local.";
    elements.planButton.disabled = true;
  }
}

elements.picker.addEventListener("change", handleImport);
elements.planButton.addEventListener("click", handlePlan);
document.querySelectorAll(".schedule-card input").forEach((input) => {
  input.addEventListener("input", handleScheduleChange);
  input.addEventListener("change", handleScheduleChange);
});
initialize();
