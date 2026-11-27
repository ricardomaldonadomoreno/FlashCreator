const { contextBridge, ipcRenderer } = require("electron");

const api = Object.freeze({
  getState: () => ipcRenderer.invoke("flashcreator:state:get"),
  importVideos: () => ipcRenderer.invoke("flashcreator:videos:import"),
  removeVideo: (id) => ipcRenderer.invoke("flashcreator:videos:remove", id),
  moveVideo: (id, offset) => ipcRenderer.invoke("flashcreator:videos:move", { id, offset }),
  resolveItem: (id, decision) => ipcRenderer.invoke("flashcreator:videos:resolve", { id, decision }),
  planQueue: (config) => ipcRenderer.invoke("flashcreator:queue:plan", config),
  openStudio: () => ipcRenderer.invoke("flashcreator:studio:open"),
  startAgent: () => ipcRenderer.invoke("flashcreator:agent:start"),
  pauseAgent: () => ipcRenderer.invoke("flashcreator:agent:pause"),
  stopAgent: () => ipcRenderer.invoke("flashcreator:agent:stop"),
  onState: (listener) => {
    if (typeof listener !== "function") return () => {};
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("flashcreator:state", handler);
    return () => ipcRenderer.removeListener("flashcreator:state", handler);
  },
});

contextBridge.exposeInMainWorld("flashCreator", api);
