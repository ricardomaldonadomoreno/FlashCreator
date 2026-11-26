const DATABASE_NAME = "flash-creator-local";
const DATABASE_VERSION = 1;
const METADATA_STORE = "video_metadata";
const BLOB_STORE = "video_blobs";
const HISTORY_STORE = "publish_history";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(METADATA_STORE)) database.createObjectStore(METADATA_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(BLOB_STORE)) database.createObjectStore(BLOB_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(HISTORY_STORE)) database.createObjectStore(HISTORY_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir el almacenamiento local."));
    request.onblocked = () => reject(new Error("Cierra las otras ventanas de Flash Creator para actualizar la base local."));
  });
}

function transact(database, stores, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(stores, mode);
    let result;
    try {
      result = operation(transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error("Falló una operación del almacenamiento local."));
    transaction.onabort = () => reject(transaction.error ?? new Error("La operación local se canceló; revisa el espacio disponible."));
  });
}

export const MAX_VIDEO_SIZE_BYTES = 2 * 1024 ** 3;

function duplicateFingerprint(file) {
  const name = String(file?.name ?? "").normalize("NFC").trim().toLowerCase();
  const size = Number(file?.size);
  const lastModified = Number(file?.lastModified);
  if (!name || !Number.isFinite(size) || size < 0 || !Number.isFinite(lastModified) || lastModified < 0) return null;
  return JSON.stringify([name, size, lastModified]);
}

/** Match likely duplicate metadata only; this does not read or hash video blobs. */
export function findPossibleDuplicateFiles(files, existingMetadata = []) {
  const known = new Map();
  for (const record of existingMetadata) {
    const fingerprint = duplicateFingerprint(record);
    if (fingerprint && !known.has(fingerprint)) known.set(fingerprint, record.name);
  }

  const duplicates = [];
  [...files].forEach((file, index) => {
    const fingerprint = duplicateFingerprint(file);
    if (!fingerprint) return;
    if (known.has(fingerprint)) {
      duplicates.push({ index, name: file.name, matchesName: known.get(fingerprint) });
    } else {
      known.set(fingerprint, file.name);
    }
  });
  return duplicates;
}

export function validateVideoFile(file) {
  const extensionOkay = /\.(mp4|mov)$/i.test(file.name);
  const mimeOkay = !file.type || ["video/mp4", "video/quicktime", "application/octet-stream"].includes(file.type.toLowerCase());
  if (!extensionOkay || !mimeOkay) return "Solo se aceptan archivos MP4 o MOV con un tipo de video compatible.";
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return "El archivo está vacío o su tamaño no es válido.";
  if (file.size > MAX_VIDEO_SIZE_BYTES) return "El límite beta es 2 GiB por video.";
  return null;
}

export async function addVideos(files) {
  const database = await openDatabase();
  const added = [];
  const rejected = [];

  try {
    for (const file of files) {
      const validationError = validateVideoFile(file);
      if (validationError) {
        rejected.push({ name: file.name, reason: validationError });
        continue;
      }
      const id = crypto.randomUUID();
      const metadata = {
        id,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        lastModified: file.lastModified,
        addedAt: new Date().toISOString(),
      };
      try {
        await transact(database, [METADATA_STORE, BLOB_STORE], "readwrite", (transaction) => {
          transaction.objectStore(METADATA_STORE).put(metadata);
          transaction.objectStore(BLOB_STORE).put({ id, blob: file });
        });
        added.push(metadata);
      } catch (error) {
        const reason = error?.name === "QuotaExceededError"
          ? "No hay suficiente espacio local para guardar este video. Libera espacio y vuelve a intentarlo."
          : `No se pudo guardar este video: ${error?.message ?? "error de almacenamiento"}`;
        rejected.push({ name: file.name, reason });
        if (error?.name === "QuotaExceededError") break;
      }
    }
  } finally {
    database.close();
  }

  return { added, rejected };
}

/** Reads metadata only; video blobs are never retrieved by the listing path. */
export async function listVideoMetadata() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(METADATA_STORE, "readonly");
    const records = await new Promise((resolve, reject) => {
      const request = transaction.objectStore(METADATA_STORE).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error ?? new Error("No se pudo leer la lista local."));
    });
    return records.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  } finally {
    database.close();
  }
}

export async function getVideoBlob(id) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BLOB_STORE, "readonly");
    const record = await new Promise((resolve, reject) => {
      const request = transaction.objectStore(BLOB_STORE).get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("No se pudo recuperar el archivo local."));
    });
    return record?.blob ?? null;
  } finally {
    database.close();
  }
}

export async function removeVideo(id) {
  const database = await openDatabase();
  try {
    await transact(database, [METADATA_STORE, BLOB_STORE], "readwrite", (transaction) => {
      transaction.objectStore(METADATA_STORE).delete(id);
      transaction.objectStore(BLOB_STORE).delete(id);
    });
  } finally {
    database.close();
  }
}
