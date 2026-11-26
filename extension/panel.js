import { addVideos, findPossibleDuplicateFiles, listVideoMetadata, removeVideo } from "./core/local-media-store.mjs";
import { DEFAULT_SCHEDULE, formatSlotForDisplay, planSchedule } from "./core/scheduler.mjs";
import { isSupportedStudioUploadUrl, TIKTOK_STUDIO_UPLOAD_URL } from "./core/studio-target.mjs";
import { MAX_PRE_SUBMIT_RETRIES, queueIsEditable, queueItemStatusLabel, QUEUE_ITEM_STATUSES, readQueue, reconcileQueueVideoIds, writeQueue } from "./core/queue-store.mjs";
import { TRANSFER_AUTH_TTL_MS, transferAuthorizationKey } from "./core/transfer-protocol.mjs";

const elements = {
  picker: document.querySelector("#video-picker"),
  count: document.querySelector("#video-count"),
  importStatus: document.querySelector("#import-status"),
  videoList: document.querySelector("#video-list"),
  planButton: document.querySelector("#plan-button"),
  scheduleErrors: document.querySelector("#schedule-errors"),
  scheduleList: document.querySelector("#schedule-list"),
  studioOpen: document.querySelector("#studio-open"),
  studioConnect: document.querySelector("#studio-connect"),
  studioStatus: document.querySelector("#studio-status"),
};

let queue;
let videos = [];
let configSaveTimer = null;
let isImporting = false;
let connectedTabId = null;
let activeTransfer = null;

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

    const activeForVideo = activeTransfer?.videoId === video.id;
    const canRetryBeforeSubmit = queueItem?.status === QUEUE_ITEM_STATUSES.FAILED
      && queueItem.lastResult?.phase === "before_submit"
      && queueItem.lastResult?.retryable === true
      && queueItem.attemptCount <= MAX_PRE_SUBMIT_RETRIES;
    const canStartTransfer = queueItem?.status === QUEUE_ITEM_STATUSES.PENDING || canRetryBeforeSubmit;
    if (activeForVideo || canStartTransfer) {
      const transferButton = document.createElement("button");
      transferButton.type = "button";
      transferButton.className = "video-transfer";
      if (activeForVideo) {
        transferButton.textContent = activeTransfer.stage === "awaiting_review"
          ? "Archivo en Studio · revisar allí"
          : "Cancelar transferencia";
        transferButton.disabled = activeTransfer.stage === "awaiting_review" || activeTransfer.confirmedBeforeSet;
        transferButton.addEventListener("click", cancelStudioTransfer);
      } else {
        transferButton.textContent = "Enviar video a TikTok Studio";
        transferButton.disabled = !canEditQueue || !connectedTabId || Boolean(activeTransfer);
        transferButton.title = connectedTabId
          ? "Transferir solo este video; TikTok podría iniciar la carga al recibirlo."
          : "Primero conecta la pestaña activa de TikTok Studio.";
        transferButton.addEventListener("click", () => transferVideoToStudio(video));
      }
      row.append(transferButton);
    }
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
  const possibleDuplicates = findPossibleDuplicateFiles(files, videos);
  let filesToImport = files;
  let skippedDuplicates = 0;
  let acceptedDuplicates = 0;
  if (possibleDuplicates.length) {
    const importCopies = window.confirm(
      `Se detectaron ${possibleDuplicates.length} posibles duplicados por nombre, tamaño y fecha de modificación.\n\n` +
      "Aceptar: importar las copias de todos modos.\nCancelar: omitirlas y guardar el resto de la selección.",
    );
    if (importCopies) {
      acceptedDuplicates = possibleDuplicates.length;
    } else {
      const duplicateIndexes = new Set(possibleDuplicates.map((duplicate) => duplicate.index));
      filesToImport = files.filter((_, index) => !duplicateIndexes.has(index));
      skippedDuplicates = possibleDuplicates.length;
    }
  }
  if (!filesToImport.length) {
    elements.importStatus.textContent = `Se omitieron ${skippedDuplicates} posibles duplicados; no había videos nuevos que guardar.`;
    elements.picker.value = "";
    return;
  }
  elements.importStatus.textContent = "Guardando archivos directamente en el almacenamiento local…";
  isImporting = true;
  elements.picker.disabled = true;
  try {
    const result = await addVideos(filesToImport);
    videos = [...videos, ...result.added];
    queue = reconcileQueueVideoIds(queue, [...queue.videoIds, ...result.added.map((video) => video.id)]);
    await persistQueue();
    const rejectedMessage = result.rejected.length
      ? ` No se agregaron: ${result.rejected.map((file) => `${file.name}: ${file.reason}`).join(" ")}`
      : "";
    const duplicateMessage = skippedDuplicates
      ? ` Se omitieron ${skippedDuplicates} posibles duplicados.`
      : acceptedDuplicates
        ? ` Se aceptaron ${acceptedDuplicates} posibles duplicados; revisa los videos guardados.`
        : "";
    const importMessage = result.added.length
      ? `Se guardaron ${result.added.length} video${result.added.length === 1 ? "" : "s"} localmente.${rejectedMessage}${duplicateMessage}`
      : `No se agregaron videos.${rejectedMessage}${duplicateMessage}`;
    renderVideos();
    elements.importStatus.textContent = importMessage;
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

function setStudioStatus(message, state = "info") {
  elements.studioStatus.textContent = message;
  elements.studioStatus.dataset.state = state;
}

async function openStudio() {
  try {
    await chrome.tabs.create({ url: TIKTOK_STUDIO_UPLOAD_URL });
    setStudioStatus("TikTok Studio se abrió en otra pestaña. Ve a ella, inicia sesión si hace falta y abre Flash Creator desde el icono de extensiones; luego comprueba la pestaña activa.");
  } catch (error) {
    setStudioStatus(error.message || "No se pudo abrir TikTok Studio.", "error");
  }
}

async function connectToActiveStudioTab() {
  elements.studioConnect.disabled = true;
  connectedTabId = null;
  setStudioStatus("Comprobando la pestaña activa…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error("No se encontró una pestaña activa.");
    if (!isSupportedStudioUploadUrl(tab.url)) {
      throw new Error("Abre https://www.tiktok.com/tiktokstudio/upload en la pestaña activa y vuelve a intentarlo.");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/studio-adapter.js"],
    });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "FLASH_CREATOR_STUDIO_PING" });
    if (!response?.ok) throw new Error(response?.message || "El adaptador no pudo confirmar la conexión.");

    const controlCount = response.eligibleUploadInputCount;
    const controlsMessage = controlCount === 1
      ? "Se detectó un control candidato para video."
      : `Se detectaron ${controlCount} controles candidatos; la transferencia se detendrá si no hay uno claro.`;
    connectedTabId = tab.id;
    setStudioStatus(`Conectado a la ruta de carga. ${controlsMessage} La conexión no lee datos de cuenta.`, "success");
  } catch (error) {
    setStudioStatus(error.message || "No se pudo conectar a la pestaña activa.", "error");
  } finally {
    elements.studioConnect.disabled = false;
    renderVideos();
  }
}

function updateQueueItem(videoId, changes) {
  const updatedAt = new Date().toISOString();
  queue = {
    ...queue,
    items: queue.items.map((item) => item.videoId === videoId
      ? { ...item, ...changes, updatedAt }
      : item),
  };
}

function matchesActiveTransfer(message, sender) {
  if (!activeTransfer || message?.transferId !== activeTransfer.transferId
    || message?.videoId !== activeTransfer.videoId
    || sender?.id !== chrome.runtime.id
    || sender?.tab?.id !== activeTransfer.tabId) return false;
  return isSupportedStudioUploadUrl(sender.tab?.url ?? sender.url);
}

function metadataMatchesVideo(metadata, video) {
  return Boolean(metadata && video
    && metadata.id === video.id
    && metadata.name === video.name
    && metadata.size === video.size
    && metadata.lastModified === video.lastModified
    && metadata.type === video.type);
}

function handleStudioRuntimeMessage(message, sender, sendResponse) {
  if (message?.type === "FLASH_CREATOR_STUDIO_TRANSFER_PROGRESS") {
    if (!matchesActiveTransfer(message, sender)) return false;
    activeTransfer.stage = "transferring";
    activeTransfer.bytesReceived = Math.max(0, Number(message.bytesReceived) || 0);
    activeTransfer.totalBytes = Math.max(0, Number(message.totalBytes) || 0);
    const percent = activeTransfer.totalBytes
      ? Math.min(100, Math.floor(activeTransfer.bytesReceived / activeTransfer.totalBytes * 100))
      : 0;
    setStudioStatus(`Transferencia local ${percent}% · ${sizeLabel(activeTransfer.bytesReceived)} de ${sizeLabel(activeTransfer.totalBytes)}. No cierres la pestaña.`, "info");
    renderVideos();
    return false;
  }

  const stateMessages = [
    "FLASH_CREATOR_STUDIO_TRANSFER_BEFORE_FILE_SET",
    "FLASH_CREATOR_STUDIO_TRANSFER_FILE_SET",
    "FLASH_CREATOR_STUDIO_TRANSFER_FAILED",
  ];
  if (!stateMessages.includes(message?.type)) return false;
  if (!matchesActiveTransfer(message, sender)) {
    sendResponse({ ok: false, message: "El panel no reconoce esta transferencia o la pestaña ya no coincide." });
    return false;
  }

  const video = videos.find((item) => item.id === activeTransfer.videoId);
  if (message.metadata && !metadataMatchesVideo(message.metadata, video)) {
    sendResponse({ ok: false, message: "Los metadatos del archivo no coinciden con la cola local." });
    return false;
  }

  void (async () => {
    if (message.type === "FLASH_CREATOR_STUDIO_TRANSFER_BEFORE_FILE_SET") {
      const current = queue.items.find((item) => item.videoId === activeTransfer.videoId);
      if (!current || current.status !== QUEUE_ITEM_STATUSES.PREPARING) {
        sendResponse({ ok: false, message: "El estado local cambió; el archivo no se aplicará." });
        return;
      }
      updateQueueItem(activeTransfer.videoId, {
        status: QUEUE_ITEM_STATUSES.AWAITING_CONFIRMATION,
        lastResult: {
          code: "file-apply-pending",
          message: "El archivo está listo en el canal local; verifica el resultado en TikTok Studio.",
          phase: "after_submit",
          retryable: false,
          at: new Date().toISOString(),
        },
      });
      await persistQueue();
      activeTransfer.confirmedBeforeSet = true;
      activeTransfer.stage = "applying_file";
      renderVideos();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "FLASH_CREATOR_STUDIO_TRANSFER_FILE_SET") {
      const current = queue.items.find((item) => item.videoId === activeTransfer.videoId);
      if (!current || current.status !== QUEUE_ITEM_STATUSES.AWAITING_CONFIRMATION) {
        sendResponse({ ok: false, message: "El archivo pudo llegar a Studio; el estado quedó sin confirmar." });
        return;
      }
      updateQueueItem(activeTransfer.videoId, {
        status: QUEUE_ITEM_STATUSES.AWAITING_CONFIRMATION,
        lastResult: {
          code: "file-selected-in-studio",
          message: "El archivo quedó en el control de TikTok Studio. Revisa la página; Flash Creator no programa.",
          phase: "after_submit",
          retryable: false,
          at: new Date().toISOString(),
        },
      });
      queue = { ...queue, status: "paused" };
      await persistQueue();
      activeTransfer.stage = "awaiting_review";
      setStudioStatus("El archivo está en el control de TikTok Studio. Revisa allí la carga; no se pulsó Programar.", "success");
      renderVideos();
      sendResponse({ ok: true });
      return;
    }

    const retryable = message.retryable === true
      && message.phase === "before_submit"
      && !activeTransfer.confirmedBeforeSet;
    updateQueueItem(activeTransfer.videoId, {
      status: retryable ? QUEUE_ITEM_STATUSES.FAILED : QUEUE_ITEM_STATUSES.NEEDS_VERIFICATION,
      lastResult: {
        code: retryable ? "local-transfer-failed" : "transfer-result-uncertain",
        message: String(message.message || "La transferencia se detuvo; revisa TikTok Studio antes de continuar."),
        phase: retryable ? "before_submit" : "after_submit",
        retryable,
        at: new Date().toISOString(),
      },
    });
    queue = { ...queue, status: retryable ? activeTransfer.previousQueueStatus : "needs_verification" };
    await persistQueue();
    setStudioStatus(String(message.message || "La transferencia se detuvo; revisa TikTok Studio antes de continuar."), "error");
    renderVideos();
    sendResponse({ ok: true });
  })().catch((error) => {
    sendResponse({ ok: false, message: error.message || "No se pudo guardar el estado local." });
  });
  return true;
}

async function markTransferFailureLocally(transfer, error) {
  if (activeTransfer?.transferId !== transfer.transferId) return;
  const current = queue.items.find((item) => item.videoId === transfer.videoId);
  if (![QUEUE_ITEM_STATUSES.PREPARING, QUEUE_ITEM_STATUSES.AWAITING_CONFIRMATION].includes(current?.status)) return;
  const retryable = !transfer.confirmedBeforeSet && current.status === QUEUE_ITEM_STATUSES.PREPARING;
  updateQueueItem(transfer.videoId, {
    status: retryable ? QUEUE_ITEM_STATUSES.FAILED : QUEUE_ITEM_STATUSES.NEEDS_VERIFICATION,
    lastResult: {
      code: retryable ? "local-transfer-failed" : "transfer-result-uncertain",
      message: error?.message || "Se perdió la conexión. Revisa TikTok Studio antes de volver a intentarlo.",
      phase: retryable ? "before_submit" : "after_submit",
      retryable,
      at: new Date().toISOString(),
    },
  });
  queue = { ...queue, status: retryable ? transfer.previousQueueStatus : "needs_verification" };
  await persistQueue();
}

async function transferVideoToStudio(video) {
  if (!connectedTabId || activeTransfer || !queueIsEditable(queue)) return;
  const item = queue.items.find((entry) => entry.videoId === video.id);
  const mayRetry = item?.status === QUEUE_ITEM_STATUSES.FAILED
    && item.lastResult?.phase === "before_submit"
    && item.lastResult?.retryable === true
    && item.attemptCount <= MAX_PRE_SUBMIT_RETRIES;
  if (item?.status !== QUEUE_ITEM_STATUSES.PENDING && !mayRetry) return;

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab?.id !== connectedTabId || !isSupportedStudioUploadUrl(activeTab.url)) {
    connectedTabId = null;
    setStudioStatus("La pestaña conectada ya no está activa o cambió de ruta. Vuelve a comprobar TikTok Studio.", "error");
    renderVideos();
    return;
  }

  const confirmed = window.confirm(
    `Vas a enviar “${video.name}” (${sizeLabel(video.size)}) al control de carga de TikTok Studio.\n\n` +
    "La página podría iniciar la carga inmediatamente. Flash Creator no pulsará Programar. Continúa solo si quieres transferir este video ahora.",
  );
  if (!confirmed) return;

  const transfer = {
    transferId: crypto.randomUUID(),
    videoId: video.id,
    tabId: connectedTabId,
    stage: "preparing",
    bytesReceived: 0,
    totalBytes: video.size,
    confirmedBeforeSet: false,
    previousQueueStatus: queue.status === "planned" ? "planned" : "idle",
  };
  const previousQueue = queue;
  activeTransfer = transfer;
  const index = queue.videoIds.indexOf(video.id);
  updateQueueItem(video.id, {
    status: QUEUE_ITEM_STATUSES.PREPARING,
    attemptCount: (item?.attemptCount ?? 0) + 1,
    lastResult: null,
  });
  queue = { ...queue, status: "running", index, currentVideoId: video.id };
  try {
    await persistQueue();
  } catch (error) {
    queue = previousQueue;
    activeTransfer = null;
    setStudioStatus(error.message || "No se pudo guardar el estado de la cola; no se inició la transferencia.", "error");
    renderVideos();
    return;
  }
  renderVideos();
  setStudioStatus(`Preparando “${video.name}” desde IndexedDB local…`, "info");

  const expected = {
    id: video.id,
    name: video.name,
    size: video.size,
    lastModified: video.lastModified,
    type: video.type,
  };
  const authorizationToken = crypto.randomUUID();
  const authorizationKey = transferAuthorizationKey(transfer.transferId);
  try {
    await chrome.storage.session.set({
      [authorizationKey]: {
        transferId: transfer.transferId,
        videoId: video.id,
        authorizationToken,
        expected,
        expiresAt: Date.now() + TRANSFER_AUTH_TTL_MS,
      },
    });
    const response = await chrome.tabs.sendMessage(connectedTabId, {
      type: "FLASH_CREATOR_STUDIO_TRANSFER_VIDEO",
      transferId: transfer.transferId,
      videoId: video.id,
      expected,
      authorizationToken,
    });
    if (!response?.ok) throw new Error(response?.message || "TikTok Studio no confirmó la preparación del archivo.");
    setStudioStatus(response.message || "El archivo quedó en TikTok Studio para revisión manual.", "success");
  } catch (error) {
    await markTransferFailureLocally(transfer, error);
    setStudioStatus(error.message || "La transferencia se detuvo; revisa TikTok Studio.", "error");
  } finally {
    await chrome.storage.session.remove(authorizationKey).catch(() => {});
    if (activeTransfer?.transferId === transfer.transferId) activeTransfer = null;
    renderVideos();
  }
}

async function cancelStudioTransfer() {
  const transfer = activeTransfer;
  if (!transfer || transfer.confirmedBeforeSet) return;
  try {
    const response = await chrome.tabs.sendMessage(transfer.tabId, {
      type: "FLASH_CREATOR_STUDIO_CANCEL_TRANSFER",
      transferId: transfer.transferId,
    });
    if (!response?.ok) setStudioStatus(response?.message || "No se pudo cancelar con seguridad; revisa la pestaña.", "error");
  } catch (error) {
    setStudioStatus(error.message || "No se pudo contactar la pestaña; revisa TikTok Studio.", "error");
  }
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
elements.studioOpen.addEventListener("click", openStudio);
elements.studioConnect.addEventListener("click", connectToActiveStudioTab);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => handleStudioRuntimeMessage(message, sender, sendResponse));
document.querySelectorAll(".schedule-card input").forEach((input) => {
  input.addEventListener("input", handleScheduleChange);
  input.addEventListener("change", handleScheduleChange);
});
initialize();
