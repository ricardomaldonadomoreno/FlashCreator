import { getVideoForTransfer } from "../core/local-media-store.mjs";
import {
  getTransferChunkRange,
  isValidTransferDescriptor,
  transferChunkCount,
  transferMetadataMatches,
  isValidTransferAuthorization,
  transferAuthorizationKey,
  TRANSFER_CHUNK_SIZE_BYTES,
  TRANSFER_TIMEOUT_MS,
} from "../core/transfer-protocol.mjs";

const TRUSTED_PARENT_ORIGIN = "https://www.tiktok.com";
const EXPECTED_NONCE = location.hash.slice(1);
const pendingChannels = new Set();

function sendError(port, transferId, message) {
  try {
    port.postMessage({ type: "ERROR", transferId, message });
  } catch {
    // If the receiving tab has already closed, there is no endpoint to report to.
  }
}

function waitForAck(port, transferId, expectedIndex) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("TikTok Studio dejó de confirmar la transferencia del fragmento."));
    }, TRANSFER_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      port.removeEventListener("message", handleMessage);
    }

    function handleMessage(event) {
      const message = event.data;
      if (!message || message.transferId !== transferId) return;
      if (message.type === "CANCEL") {
        cleanup();
        reject(new Error("Transferencia cancelada por el usuario."));
        return;
      }
      if (message.type === "ERROR") {
        cleanup();
        reject(new Error(typeof message.message === "string" ? message.message : "Falló la transferencia local."));
        return;
      }
      if (message.type !== "CHUNK_ACK") return;
      if (message.index !== expectedIndex) {
        cleanup();
        reject(new Error("La confirmación del fragmento no coincide; se detuvo la transferencia."));
        return;
      }
      cleanup();
      resolve();
    }

    port.addEventListener("message", handleMessage);
  });
}

async function runTransfer(port, request) {
  const { transferId, videoId, expected } = request;
  if (!isValidTransferDescriptor(expected) || expected.id !== videoId) {
    throw new Error("Los datos del video no son válidos para iniciar la transferencia.");
  }

  const authorizationKey = transferAuthorizationKey(transferId);
  const storedAuthorization = await chrome.storage.session.get(authorizationKey);
  const authorization = storedAuthorization[authorizationKey];
  if (!isValidTransferAuthorization(authorization, request)) {
    throw new Error("El puente no recibió una autorización local vigente del panel.");
  }
  await chrome.storage.session.remove(authorizationKey);

  const record = await getVideoForTransfer(videoId);
  if (!record?.metadata || !record.blob) throw new Error("El video ya no está disponible en el almacenamiento local.");
  if (!transferMetadataMatches(record.metadata, expected, record.blob.size)) {
    throw new Error("Los metadatos del video cambiaron. Vuelve a conectar la biblioteca y revisa la cola.");
  }

  const totalBytes = record.blob.size;
  const totalChunks = transferChunkCount(totalBytes);
  port.postMessage({
    type: "TRANSFER_BEGIN",
    transferId,
    metadata: record.metadata,
    totalBytes,
    totalChunks,
    chunkSize: TRANSFER_CHUNK_SIZE_BYTES,
  });

  for (let index = 0; index < totalChunks; index += 1) {
    const { start, end } = getTransferChunkRange(index, totalBytes);
    const chunk = record.blob.slice(start, end, record.blob.type || record.metadata.type);
    const acknowledgement = waitForAck(port, transferId, index);
    port.postMessage({ type: "CHUNK", transferId, index, start, end, chunk });
    await acknowledgement;
  }

  port.postMessage({ type: "TRANSFER_DONE", transferId, totalBytes, totalChunks });
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.origin !== TRUSTED_PARENT_ORIGIN) return;
  const message = event.data;
  const port = event.ports?.[0];
  if (message?.type !== "FLASH_CREATOR_TRANSFER_CONNECT" || !port) return;
  if (!EXPECTED_NONCE || message.nonce !== EXPECTED_NONCE) return;
  if (typeof message.transferId !== "string" || typeof message.videoId !== "string") return;
  if (pendingChannels.has(port)) return;

  pendingChannels.add(port);
  port.start();
  port.postMessage({ type: "BRIDGE_READY", transferId: message.transferId });
  runTransfer(port, message)
    .catch((error) => sendError(port, message.transferId, error?.message || "No se pudo leer el video local."))
    .finally(() => {
      pendingChannels.delete(port);
      try { port.close(); } catch {}
    });
}, { once: false });
