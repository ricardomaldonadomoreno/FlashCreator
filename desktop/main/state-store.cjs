const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov"]);

function createEmptyState() {
  return {
    version: 1,
    videos: [],
    queue: {
      status: "idle",
      index: 0,
      videoIds: [],
      plannedVideoIds: [],
      slots: [],
      items: [],
      config: null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      history: [],
      updatedAt: new Date().toISOString(),
    },
  };
}

function ensureDirectories(userDataPath) {
  const root = path.join(userDataPath, "flash-creator");
  const library = path.join(root, "library");
  fs.mkdirSync(library, { recursive: true });
  return { root, library, stateFile: path.join(root, "state.json") };
}

function readState(stateFile) {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (!state || typeof state !== "object" || !Array.isArray(state.videos)) return createEmptyState();
    return {
      ...createEmptyState(),
      ...state,
      queue: { ...createEmptyState().queue, ...(state.queue ?? {}) },
    };
  } catch (error) {
    if (error.code === "ENOENT") return createEmptyState();
    throw new Error(`No se pudo leer el estado local: ${error.message}`);
  }
}

function writeState(stateFile, state) {
  const directory = path.dirname(stateFile);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryFile = path.join(directory, `.state-${process.pid}-${crypto.randomUUID()}.tmp`);
  const next = { ...state, queue: { ...state.queue, updatedAt: new Date().toISOString() } };
  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryFile, stateFile);
  } finally {
    if (fs.existsSync(temporaryFile)) fs.rmSync(temporaryFile, { force: true });
  }
  return next;
}

function fingerprint(name, size, lastModified) {
  return JSON.stringify([String(name).normalize("NFC").trim().toLowerCase(), Number(size), Number(lastModified)]);
}

function readIsoBox(descriptor, offset, parentEnd) {
  if (offset < 0 || offset + 8 > parentEnd) return null;
  const header = Buffer.alloc(16);
  const bytesRead = fs.readSync(descriptor, header, 0, Math.min(header.length, parentEnd - offset), offset);
  if (bytesRead < 8) return null;
  const size32 = header.readUInt32BE(0);
  const type = header.toString("ascii", 4, 8);
  let headerSize = 8;
  let boxSize = size32;
  if (size32 === 1) {
    if (bytesRead < 16) return null;
    const extendedSize = header.readBigUInt64BE(8);
    if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    boxSize = Number(extendedSize);
    headerSize = 16;
  } else if (size32 === 0) {
    boxSize = parentEnd - offset;
  }
  const end = offset + boxSize;
  if (boxSize < headerSize || end > parentEnd) return null;
  return { type, offset, headerSize, dataStart: offset + headerSize, end, size: boxSize };
}

function hasVideoHandlerInMoov(descriptor, moov) {
  for (let trackOffset = moov.dataStart; trackOffset < moov.end;) {
    const track = readIsoBox(descriptor, trackOffset, moov.end);
    if (!track) return false;
    trackOffset = track.end;
    if (track.type !== "trak") continue;

    for (let mediaOffset = track.dataStart; mediaOffset < track.end;) {
      const media = readIsoBox(descriptor, mediaOffset, track.end);
      if (!media) return false;
      mediaOffset = media.end;
      if (media.type !== "mdia") continue;

      for (let childOffset = media.dataStart; childOffset < media.end;) {
        const child = readIsoBox(descriptor, childOffset, media.end);
        if (!child) return false;
        childOffset = child.end;
        if (child.type !== "hdlr" || child.end - child.dataStart < 12) continue;
        const handler = Buffer.alloc(12);
        if (fs.readSync(descriptor, handler, 0, handler.length, child.dataStart) === handler.length
          && handler.toString("ascii", 8, 12) === "vide") return true;
      }
    }
  }
  return false;
}

function hasIsoBmffVideoTrack(filePath, fileSize, extension) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    let offset = 0;
    let hasFileType = false;
    let hasMediaData = false;
    let moov = null;
    while (offset < fileSize) {
      const box = readIsoBox(descriptor, offset, fileSize);
      if (!box) return false;
      if (box.type === "ftyp") {
        if (offset !== 0 || box.size < 16) return false;
        hasFileType = true;
      } else if (box.type === "moov") {
        moov = box;
      } else if (box.type === "mdat") {
        hasMediaData = true;
      }
      offset = box.end;
    }
    if (offset !== fileSize || !hasMediaData || !moov) return false;
    if (extension === ".mp4" && !hasFileType) return false;
    return hasVideoHandlerInMoov(descriptor, moov);
  } finally {
    fs.closeSync(descriptor);
  }
}

function importVideoFiles(paths, libraryPath, state) {
  const videos = [...state.videos];
  const queue = {
    ...state.queue,
    videoIds: [...state.queue.videoIds],
    plannedVideoIds: [],
    slots: [],
    preflightIssues: [],
    status: "idle",
    items: [...(state.queue.items ?? [])],
  };
  const added = [];
  const rejected = [];
  const duplicates = [];

  for (const sourcePath of paths) {
    try {
      const stat = fs.statSync(sourcePath);
      const extension = path.extname(sourcePath).toLowerCase();
      if (!stat.isFile()) throw new Error("No es un archivo.");
      if (!VIDEO_EXTENSIONS.has(extension)) throw new Error("Solo se aceptan archivos MP4 o MOV.");
      if (stat.size <= 0) throw new Error("El archivo está vacío.");
      if (stat.size > MAX_VIDEO_BYTES) throw new Error("El límite es 2 GiB por video.");
      if (!hasIsoBmffVideoTrack(sourcePath, stat.size, extension)) throw new Error("El archivo no contiene una pista de video MP4/MOV válida.");

      const name = path.basename(sourcePath);
      const lastModified = Math.trunc(stat.mtimeMs);
      const fileFingerprint = fingerprint(name, stat.size, lastModified);
      const duplicate = videos.find((video) => fingerprint(video.sourceName, video.size, video.lastModified) === fileFingerprint);
      if (duplicate) {
        duplicates.push({ name, existingId: duplicate.id });
        continue;
      }

      const id = crypto.randomUUID();
      const storedPath = path.join(libraryPath, `${id}${extension}`);
      fs.copyFileSync(sourcePath, storedPath, fs.constants.COPYFILE_EXCL);
      const record = {
        id,
        name,
        sourceName: name,
        path: storedPath,
        type: extension === ".mov" ? "video/quicktime" : "video/mp4",
        size: stat.size,
        lastModified,
        addedAt: new Date().toISOString(),
      };
      videos.push(record);
      queue.videoIds.push(id);
      queue.items.push({ videoId: id, status: "pending", attemptCount: 0, lastResult: null });
      added.push(record);
    } catch (error) {
      rejected.push({ name: path.basename(sourcePath), reason: error.message || "No se pudo importar el archivo." });
    }
  }

  return { state: { ...state, videos, queue }, added, rejected, duplicates };
}

function removeVideo(state, id) {
  const video = state.videos.find((entry) => entry.id === id);
  if (video?.path && fs.existsSync(video.path)) fs.rmSync(video.path, { force: true });
  const videos = state.videos.filter((entry) => entry.id !== id);
  const videoIds = state.queue.videoIds.filter((videoId) => videoId !== id);
  const items = (state.queue.items ?? []).filter((item) => item.videoId !== id);
  return {
    ...state,
    videos,
    queue: {
      ...state.queue,
      videoIds,
      plannedVideoIds: [],
      slots: [],
      preflightIssues: [],
      items,
      index: Math.min(state.queue.index, videoIds.length),
      status: state.queue.status === "running" ? "paused" : state.queue.status,
    },
  };
}

module.exports = {
  MAX_VIDEO_BYTES,
  createEmptyState,
  ensureDirectories,
  readState,
  writeState,
  importVideoFiles,
  removeVideo,
};
