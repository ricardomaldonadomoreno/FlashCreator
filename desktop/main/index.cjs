const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  createEmptyState,
  ensureDirectories,
  readState,
  writeState,
  importVideoFiles,
  removeVideo,
} = require("./state-store.cjs");
const { BrowserAgent, STUDIO_URL } = require("./browser-agent.cjs");
const { hasUnresolvedQueueItem, recoverQueue } = require("./queue-state.cjs");

let mainWindow;
let directories;
let agent;
let state;
let scheduleModule;
let quitting = false;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function persist(nextState) {
  state = writeState(directories.stateFile, nextState);
  send("flashcreator:state", state);
  return state;
}

function appendHistory(queue, event) {
  const history = [...(queue.history ?? []), { at: new Date().toISOString(), ...event }];
  return { ...queue, history: history.slice(-2000) };
}

function assertQueueCanBeEdited(action) {
  if (agent?.running || state.queue.status === "running") throw new Error(`Pausa la cola antes de ${action}.`);
  if (hasUnresolvedQueueItem(state.queue)) throw new Error(`Resuelve primero los videos por verificar antes de ${action}; así se evita repetir una acción que Studio pudo aceptar.`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0b1325",
    title: "Flash Creator",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.FLASH_CREATOR_DEV_URL) {
    void mainWindow.loadURL(process.env.FLASH_CREATOR_DEV_URL);
    if (process.env.FLASH_CREATOR_OPEN_DEVTOOLS === "1") mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexFile = path.join(app.getAppPath(), "out", "index.html");
    void mainWindow.loadFile(indexFile);
  }
  mainWindow.on("closed", () => { mainWindow = null; });
}

function registerIpc() {
  ipcMain.handle("flashcreator:state:get", () => state);

  ipcMain.handle("flashcreator:videos:import", async () => {
    assertQueueCanBeEdited("importar videos");
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Agregar videos a Flash Creator",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Videos", extensions: ["mp4", "mov"] }],
    });
    if (result.canceled || !result.filePaths.length) return { state, result: { added: [], rejected: [], duplicates: [] } };
    const imported = importVideoFiles(result.filePaths, directories.library, state);
    return { state: persist(imported.state), result: { added: imported.added, rejected: imported.rejected, duplicates: imported.duplicates } };
  });

  ipcMain.handle("flashcreator:videos:remove", (_event, id) => {
    if (typeof id !== "string" || !state.videos.some((video) => video.id === id)) throw new Error("No se encontró ese video local.");
    assertQueueCanBeEdited("quitar videos");
    return persist(removeVideo(state, id));
  });

  ipcMain.handle("flashcreator:videos:move", (_event, { id, offset }) => {
    assertQueueCanBeEdited("reordenar videos");
    const index = state.queue.videoIds.indexOf(id);
    const nextIndex = index + Number(offset);
    if (index < 0 || nextIndex < 0 || nextIndex >= state.queue.videoIds.length) return state;
    const videoIds = [...state.queue.videoIds];
    [videoIds[index], videoIds[nextIndex]] = [videoIds[nextIndex], videoIds[index]];
    return persist({ ...state, queue: { ...state.queue, videoIds, plannedVideoIds: [], slots: [], preflightIssues: [], status: "idle" } });
  });

  ipcMain.handle("flashcreator:queue:plan", async (_event, config) => {
    if (agent?.running || state.queue.status === "running") throw new Error("Pausa la cola antes de cambiar la agenda.");
    const { planSchedule, DEFAULT_SCHEDULE } = scheduleModule;
    const itemById = new Map((state.queue.items ?? []).map((item) => [item.videoId, item]));
    const unresolved = state.queue.videoIds.filter((id) => {
      const item = itemById.get(id);
      const status = item?.status;
      return ["uploading", "awaiting_schedule", "submitting", "needs_verification", "needs_user"].includes(status)
        || (status === "failed" && item?.lastResult?.retryable !== true);
    });
    if (unresolved.length) throw new Error("Hay videos por verificar en Studio. Revísalos antes de recalcular la cola.");
    const plannedVideoIds = state.queue.videoIds.filter((id) => itemById.get(id)?.status !== "scheduled");
    if (!plannedVideoIds.length) throw new Error("Todos los videos de esta cola ya están confirmados como programados.");
    const nextConfig = { ...DEFAULT_SCHEDULE, ...(config ?? {}) };
    const planned = planSchedule(plannedVideoIds.length, nextConfig, { now: new Date() });
    const next = {
      ...state,
      queue: {
        ...state.queue,
        status: planned.issues.length ? "idle" : "planned",
        config: nextConfig,
        plannedVideoIds,
        slots: planned.slots,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
        preflightIssues: planned.issues,
      },
    };
    return { state: persist(next), issues: planned.issues };
  });

  ipcMain.handle("flashcreator:videos:resolve", (_event, { id, decision }) => {
    if (agent?.running || state.queue.status === "running") throw new Error("Espera a que la cola se pause antes de revisar un video.");
    const itemIndex = (state.queue.items ?? []).findIndex((item) => item.videoId === id);
    if (typeof id !== "string" || itemIndex < 0) throw new Error("No se encontró ese video en el historial de la cola.");
    const current = state.queue.items[itemIndex];
    const allowedStatuses = ["needs_verification", "needs_user", "failed"];
    if (!allowedStatuses.includes(current.status)) throw new Error("Este video no necesita una resolución manual.");
    if (decision === "scheduled" && current.status !== "needs_verification") throw new Error("Solo puedes confirmar manualmente un video marcado por verificar.");
    if (decision !== "scheduled" && decision !== "retry") throw new Error("La decisión de revisión no es válida.");

    const message = decision === "scheduled"
      ? "El usuario revisó Studio y confirmó manualmente que el video quedó programado."
      : "El usuario revisó Studio y autorizó un nuevo intento con el horario original.";
    const item = {
      ...current,
      status: decision === "scheduled" ? "scheduled" : "pending",
      lastResult: { message, retryable: decision === "retry", userReviewed: true, at: new Date().toISOString() },
    };
    const items = [...state.queue.items];
    items[itemIndex] = item;
    const allPlannedDone = (state.queue.plannedVideoIds ?? []).every((videoId) => items.find((entry) => entry.videoId === videoId)?.status === "scheduled");
    const queue = appendHistory({
      ...state.queue,
      status: allPlannedDone ? "completed" : "paused",
      items,
    }, { event: "manual_review", videoId: id, decision, message });
    return persist({ ...state, queue });
  });

  ipcMain.handle("flashcreator:studio:open", async () => {
    const result = await agent.openStudio();
    return result;
  });

  ipcMain.handle("flashcreator:agent:start", async () => {
    if (agent?.running || state.queue.status === "running") throw new Error("La cola ya está en ejecución.");
    if (state.queue.status !== "planned" && state.queue.status !== "paused") throw new Error("Calcula una agenda o reanuda la agenda guardada antes de iniciar la cola.");
    const plannedVideoIds = state.queue.plannedVideoIds ?? [];
    if (!plannedVideoIds.length) throw new Error("No hay videos pendientes en esta tanda.");
    if (state.queue.slots.length !== plannedVideoIds.length || state.queue.preflightIssues?.length) {
      throw new Error("Calcula y revisa una agenda válida antes de iniciar la cola.");
    }

    const byId = new Map(state.videos.map((video) => [video.id, video]));
    const queueItems = new Map((state.queue.items ?? []).map((item) => [item.videoId, item]));
    const remainingIds = plannedVideoIds.filter((id) => queueItems.get(id)?.status !== "scheduled");
    if (!remainingIds.length) throw new Error("Todos los videos de esta tanda ya están marcados como programados.");
    const uncertain = remainingIds.some((id) => {
      const item = queueItems.get(id);
      return !item || ["uploading", "awaiting_schedule", "submitting", "needs_verification", "needs_user"].includes(item.status)
        || (item.status === "failed" && item.lastResult?.retryable !== true);
    });
    if (uncertain) throw new Error("Hay videos por verificar en Studio. Revísalos y resuélvelos antes de reanudar la cola guardada.");
    const items = remainingIds.map((id) => byId.get(id));
    if (items.some((item) => !item)) throw new Error("Falta uno o más archivos de la cola local.");
    const slotById = new Map(plannedVideoIds.map((id, index) => [id, state.queue.slots[index]]));
    const activeSlots = remainingIds.map((id) => slotById.get(id));
    if (activeSlots.some((slot) => !slot)) throw new Error("Falta el horario guardado de uno o más videos; calcula una nueva agenda para esta tanda.");
    if (activeSlots.some((slot) => !Number.isFinite(Date.parse(slot.instant)) || Date.parse(slot.instant) <= Date.now())) {
      throw new Error("Uno o más horarios guardados ya pasaron. Revisa Studio y usa «Calcular agenda» solo si quieres asignar nuevos horarios.");
    }

    const nextState = {
      ...state,
      queue: appendHistory({
        ...state.queue,
        status: "running",
        index: Math.max(0, state.queue.videoIds.indexOf(remainingIds[0])),
        items: (state.queue.items ?? []).map((item) => remainingIds.includes(item.videoId)
          ? { ...item, status: "pending", lastResult: null }
          : item),
      }, { event: "batch_started", videoIds: remainingIds }),
    };
    persist(nextState);
    void agent.runBatch(items, activeSlots).then((result) => {
      const finalStatus = result.status === "completed" ? "completed" : result.status;
      const queue = appendHistory({ ...state.queue, status: finalStatus }, { event: `batch_${finalStatus}`, videoIds: remainingIds });
      persist({ ...state, queue });
    }).catch((error) => {
      const queue = appendHistory({ ...state.queue, status: "paused", lastError: error.message }, { event: "batch_error", message: error.message });
      persist({ ...state, queue });
    });
    return { started: true };
  });

  ipcMain.handle("flashcreator:agent:pause", () => {
    agent.requestPause();
    return { paused: true };
  });

  ipcMain.handle("flashcreator:agent:stop", () => {
    agent.requestStop();
    return { stopped: true };
  });
}

async function initialize() {
  app.setAppUserModelId("com.flashcreator.desktop");
  directories = ensureDirectories(app.getPath("userData"));
  state = readState(directories.stateFile);
  if (!state.queue) state = { ...createEmptyState(), ...state };
  const recoveredQueue = recoverQueue(state.queue);
  if (recoveredQueue !== state.queue) state = writeState(directories.stateFile, { ...state, queue: recoveredQueue });
  const schedulerPath = path.resolve(__dirname, "../../extension/core/scheduler.mjs");
  scheduleModule = await import(pathToFileURL(schedulerPath).href);
  agent = new BrowserAgent({
    profilePath: path.join(app.getPath("userData"), "studio-profile"),
    onUpdate: ({ videoId, status, attemptCount, message, retryable }) => {
      const items = [...(state.queue.items ?? [])];
      const index = items.findIndex((item) => item.videoId === videoId);
      if (index >= 0) items[index] = { ...items[index], status, attemptCount, lastResult: { message, retryable, at: new Date().toISOString() } };
      const queueIndex = state.queue.videoIds.indexOf(videoId);
      const queue = appendHistory({ ...state.queue, index: Math.max(0, queueIndex), currentVideoId: videoId, items }, {
        event: "video_status",
        videoId,
        status,
        attemptCount,
        message: String(message ?? "").slice(0, 500),
      });
      persist({ ...state, queue });
    },
  });
  registerIpc();
  createWindow();
}

app.whenReady().then(initialize).catch((error) => {
  dialog.showErrorBox("Flash Creator no pudo iniciarse", error.message || String(error));
  app.quit();
});

app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  if (agent) {
    event.preventDefault();
    void agent.close().finally(() => app.quit());
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
