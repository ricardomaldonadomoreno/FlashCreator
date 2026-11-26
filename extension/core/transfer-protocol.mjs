export const TRANSFER_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
export const TRANSFER_TIMEOUT_MS = 30_000;

const cleanString = (value) => typeof value === "string" ? value.trim() : "";

export function isValidTransferDescriptor(value) {
  if (!value || typeof value !== "object") return false;
  const id = cleanString(value.id);
  const name = cleanString(value.name);
  return id.length > 0
    && name.length > 0
    && Number.isSafeInteger(value.size)
    && value.size > 0
    && Number.isSafeInteger(value.lastModified)
    && value.lastModified >= 0
    && typeof value.type === "string";
}

export function transferMetadataMatches(stored, expected, blobSize) {
  return isValidTransferDescriptor(stored)
    && isValidTransferDescriptor(expected)
    && stored.id === expected.id
    && stored.name === expected.name
    && stored.size === expected.size
    && stored.size === blobSize
    && stored.lastModified === expected.lastModified
    && stored.type === expected.type;
}

export function getTransferChunkRange(index, totalBytes, chunkSize = TRANSFER_CHUNK_SIZE_BYTES) {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("El índice de fragmento no es válido.");
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) throw new RangeError("El tamaño del video no es válido.");
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new RangeError("El tamaño del fragmento no es válido.");
  const start = index * chunkSize;
  if (start >= totalBytes) throw new RangeError("El fragmento está fuera del video.");
  return { start, end: Math.min(start + chunkSize, totalBytes) };
}

export function transferChunkCount(totalBytes, chunkSize = TRANSFER_CHUNK_SIZE_BYTES) {
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) throw new RangeError("El tamaño del video no es válido.");
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new RangeError("El tamaño del fragmento no es válido.");
  return Math.ceil(totalBytes / chunkSize);
}

export const TRANSFER_AUTH_TTL_MS = 60_000;

export function transferAuthorizationKey(transferId) {
  if (typeof transferId !== "string" || !/^[\w-]{1,128}$/.test(transferId)) {
    throw new TypeError("El identificador de transferencia no es válido.");
  }
  return `flashCreatorTransferAuth:${transferId}`;
}

export function isValidTransferAuthorization(authorization, request, now = Date.now()) {
  if (!authorization || typeof authorization !== "object" || !request || typeof request !== "object") return false;
  if (authorization.transferId !== request.transferId || authorization.videoId !== request.videoId) return false;
  if (typeof request.authorizationToken !== "string"
    || request.authorizationToken.length < 32
    || authorization.authorizationToken !== request.authorizationToken) return false;
  if (!Number.isSafeInteger(authorization.expiresAt)
    || authorization.expiresAt <= now
    || authorization.expiresAt > now + TRANSFER_AUTH_TTL_MS) return false;
  return transferMetadataMatches(authorization.expected, request.expected, request.expected?.size);
}
