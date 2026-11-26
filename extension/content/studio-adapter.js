(() => {
  function isSupportedRoute() {
    return location.origin === "https://www.tiktok.com"
      && /^\/tiktokstudio\/upload\/?$/.test(location.pathname);
  }
  if (!isSupportedRoute() || globalThis.__flashCreatorStudioAdapterV1) return;
  globalThis.__flashCreatorStudioAdapterV1 = true;

  const TRUSTED_PAGE_ORIGIN = "https://www.tiktok.com";
  const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
  const CHANNEL_TIMEOUT_MS = 30_000;
  const activeTransfers = new Map();

  function getVideoFileInputs() {
    return [...document.querySelectorAll('input[type="file"]')].filter((input) => {
      if (input.disabled) return false;
      const accept = (input.getAttribute("accept") ?? "").toLowerCase();
      return !accept || /video|\.mp4|\.mov/.test(accept);
    });
  }

  function validDescriptor(value) {
    return Boolean(value && typeof value === "object"
      && typeof value.id === "string" && value.id.length > 0
      && typeof value.name === "string" && value.name.length > 0
      && Number.isSafeInteger(value.size) && value.size > 0
      && Number.isSafeInteger(value.lastModified) && value.lastModified >= 0
      && typeof value.type === "string");
  }

  function randomNonce() {
    return [...crypto.getRandomValues(new Uint8Array(24))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function notifyPanel(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      return null;
    }
  }

  function createBridgeTransfer(request, transfer) {
    return new Promise((resolve, reject) => {
      const nonce = randomNonce();
      const host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      Object.assign(host.style, {
        position: "fixed",
        left: "-10000px",
        top: "0",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        opacity: "0",
        pointerEvents: "none",
      });

      const shadow = host.attachShadow({ mode: "closed" });
      const iframe = document.createElement("iframe");
      iframe.setAttribute("title", "Flash Creator local transfer");
      Object.assign(iframe.style, { width: "1px", height: "1px", border: "0" });
      iframe.src = `${chrome.runtime.getURL("transfer/bridge.html")}#${nonce}`;
      shadow.append(iframe);
      document.documentElement.append(host);

      const channel = new MessageChannel();
      const port = channel.port1;
      let timer = null;
      let started = false;
      let totalBytes = 0;
      let totalChunks = 0;
      let nextIndex = 0;
      let receivedBytes = 0;
      let metadata = null;
      const chunks = [];
      let settled = false;

      function cleanup() {
        clearTimeout(timer);
        iframe.removeEventListener("load", handleLoad);
        host.remove();
        try { port.close(); } catch {}
      }

      function fail(error) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error("La transferencia local se detuvo."));
      }

      function armTimeout() {
        clearTimeout(timer);
        timer = setTimeout(() => fail(new Error("El puente local dejó de responder; revisa TikTok Studio antes de volver a intentar.")), CHANNEL_TIMEOUT_MS);
      }

      function handleLoad() {
        if (started || !iframe.contentWindow) return;
        started = true;
        const targetOrigin = new URL(iframe.src).origin;
        port.onmessage = handlePortMessage;
        port.onmessageerror = () => fail(new Error("Chrome no pudo leer un mensaje del puente local."));
        port.start();
        try {
          iframe.contentWindow.postMessage({
            type: "FLASH_CREATOR_TRANSFER_CONNECT",
            nonce,
            transferId: request.transferId,
            videoId: request.videoId,
            expected: request.expected,
          }, targetOrigin, [channel.port2]);
        } catch (error) {
          fail(new Error(error?.message || "No se pudo abrir el canal privado de transferencia."));
          return;
        }
        armTimeout();
      }

      function isMatchingFileMetadata(value) {
        return value && value.id === request.expected.id
          && value.name === request.expected.name
          && value.size === request.expected.size
          && value.lastModified === request.expected.lastModified
          && value.type === request.expected.type;
      }

      function handlePortMessage(event) {
        const message = event.data;
        if (!message || message.transferId !== request.transferId) return;
        armTimeout();

        if (message.type === "BRIDGE_READY") return;
        if (message.type === "ERROR") {
          fail(new Error(typeof message.message === "string" ? message.message : "Falló la lectura local del video."));
          return;
        }
        if (message.type === "TRANSFER_BEGIN") {
          if (!isMatchingFileMetadata(message.metadata)
            || message.totalBytes !== request.expected.size
            || message.totalChunks !== Math.ceil(message.totalBytes / CHUNK_SIZE_BYTES)
            || message.chunkSize !== CHUNK_SIZE_BYTES) {
            fail(new Error("El puente devolvió metadatos o límites de transferencia inesperados."));
            return;
          }
          metadata = message.metadata;
          totalBytes = message.totalBytes;
          totalChunks = message.totalChunks;
          void notifyPanel({
            type: "FLASH_CREATOR_STUDIO_TRANSFER_PROGRESS",
            transferId: request.transferId,
            videoId: request.videoId,
            bytesReceived: 0,
            totalBytes,
          });
          return;
        }
        if (message.type === "CHUNK") {
          if (!metadata || message.index !== nextIndex || message.start !== receivedBytes
            || !Number.isSafeInteger(message.end) || message.end <= message.start
            || !(message.chunk instanceof Blob)
            || message.end - message.start !== message.chunk.size
            || message.chunk.size > CHUNK_SIZE_BYTES
            || message.end > totalBytes) {
            fail(new Error("El fragmento no coincide con la secuencia esperada; se detuvo sin continuar."));
            return;
          }
          chunks.push(message.chunk);
          receivedBytes = message.end;
          nextIndex += 1;
          try {
            port.postMessage({ type: "CHUNK_ACK", transferId: request.transferId, index: message.index });
          } catch (error) {
            fail(new Error(error?.message || "No se pudo confirmar el fragmento recibido."));
            return;
          }
          void notifyPanel({
            type: "FLASH_CREATOR_STUDIO_TRANSFER_PROGRESS",
            transferId: request.transferId,
            videoId: request.videoId,
            bytesReceived: receivedBytes,
            totalBytes,
          });
          return;
        }
        if (message.type === "TRANSFER_DONE") {
          if (!metadata || message.totalBytes !== totalBytes || message.totalChunks !== totalChunks
            || nextIndex !== totalChunks || receivedBytes !== totalBytes) {
            fail(new Error("La transferencia terminó con fragmentos faltantes; no se aplicó el archivo."));
            return;
          }
          try {
            const file = new File(chunks, metadata.name, {
              type: metadata.type || "application/octet-stream",
              lastModified: metadata.lastModified,
            });
            if (file.size !== metadata.size) throw new Error("El tamaño reconstruido no coincide con el original.");
            settled = true;
            cleanup();
            resolve({ file, metadata });
          } catch (error) {
            fail(error);
          }
        }
      }

      transfer.cancel = () => {
        if (settled) return;
        try { port.postMessage({ type: "CANCEL", transferId: request.transferId }); } catch {}
        fail(new Error("Transferencia cancelada por el usuario antes de aplicar el archivo a TikTok Studio."));
      };
      iframe.addEventListener("load", handleLoad, { once: true });
      iframe.addEventListener("error", () => fail(new Error("Chrome no pudo cargar el puente local de Flash Creator.")), { once: true });
      armTimeout();
    });
  }

  async function performTransfer(request, transfer) {
    const inputs = getVideoFileInputs();
    if (inputs.length !== 1) {
      throw new Error(inputs.length === 0
        ? "No se encontró un control de video compatible en esta pantalla. No se envió el archivo."
        : `Se encontraron ${inputs.length} controles candidatos; la transferencia se detuvo para evitar elegir el equivocado.`);
    }
    const input = inputs[0];
    const result = await createBridgeTransfer(request, transfer);
    if (transfer.cancelled) throw new Error("Transferencia cancelada por el usuario.");

    const approval = await chrome.runtime.sendMessage({
      type: "FLASH_CREATOR_STUDIO_TRANSFER_BEFORE_FILE_SET",
      transferId: request.transferId,
      videoId: request.videoId,
      metadata: result.metadata,
    }).catch(() => null);
    if (!approval?.ok) throw new Error(approval?.message || "El panel no pudo guardar el estado seguro; el archivo no se aplicó.");

    // From this point onward a file may have reached TikTok's upload UI. Failures
    // require manual verification and must never trigger an automatic retry.
    transfer.safeToRetry = false;
    if (!isSupportedRoute() || !input.isConnected || getVideoFileInputs().length !== 1) {
      throw new Error("La pantalla de carga cambió antes de aplicar el archivo; verifica TikTok Studio antes de reintentar.");
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(result.file);
    input.files = dataTransfer.files;
    const selectedFile = input.files?.[0];
    if (!selectedFile || selectedFile.name !== result.metadata.name
      || selectedFile.size !== result.metadata.size
      || selectedFile.lastModified !== result.metadata.lastModified) {
      throw new Error("Chrome no confirmó el archivo en el control de carga; verifica Studio antes de volver a intentar.");
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const recorded = await chrome.runtime.sendMessage({
      type: "FLASH_CREATOR_STUDIO_TRANSFER_FILE_SET",
      transferId: request.transferId,
      videoId: request.videoId,
      metadata: result.metadata,
    }).catch(() => null);
    if (!recorded?.ok) {
      throw new Error("El archivo se entregó al control de carga, pero no se pudo guardar la confirmación local. Revisa TikTok Studio y no vuelvas a enviarlo a ciegas.");
    }
    return { ok: true, stage: "file-selected", message: "El archivo está en el control de TikTok Studio. La página puede iniciar la carga; revisa allí el resultado. Flash Creator no pulsó Programar." };
  }

  async function handleTransfer(message, sendResponse) {
    const request = message;
    if (!isSupportedRoute()) {
      sendResponse({ ok: false, message: "La ruta cambió. Abre la ruta de carga admitida y vuelve a comprobar la pestaña." });
      return;
    }
    if (activeTransfers.size > 0) {
      sendResponse({ ok: false, message: "Ya hay una transferencia local en curso." });
      return;
    }
    if (typeof request.transferId !== "string" || !request.transferId
      || typeof request.videoId !== "string" || request.videoId !== request.expected?.id
      || !validDescriptor(request.expected)) {
      sendResponse({ ok: false, message: "La solicitud del video no es válida." });
      return;
    }

    const transfer = { transferId: request.transferId, videoId: request.videoId, safeToRetry: true, cancelled: false, cancel: null };
    activeTransfers.set(request.transferId, transfer);
    try {
      const result = await performTransfer(request, transfer);
      sendResponse(result);
    } catch (error) {
      const messageText = error?.message || "Falló la transferencia local.";
      await notifyPanel({
        type: "FLASH_CREATOR_STUDIO_TRANSFER_FAILED",
        transferId: request.transferId,
        videoId: request.videoId,
        retryable: transfer.safeToRetry,
        phase: transfer.safeToRetry ? "before_submit" : "after_submit",
        message: messageText,
      });
      sendResponse({ ok: false, retryable: transfer.safeToRetry, message: messageText });
    } finally {
      activeTransfers.delete(request.transferId);
      transfer.cancel = null;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FLASH_CREATOR_STUDIO_PING") {
      // This reports only file-control presence; it never reads account or page content.
      const uploadInputs = getVideoFileInputs();
      sendResponse({ ok: true, version: 2, uploadInputCount: document.querySelectorAll('input[type="file"]').length, eligibleUploadInputCount: uploadInputs.length });
      return false;
    }
    if (message?.type === "FLASH_CREATOR_STUDIO_TRANSFER_VIDEO") {
      void handleTransfer(message, sendResponse);
      return true;
    }
    if (message?.type === "FLASH_CREATOR_STUDIO_CANCEL_TRANSFER") {
      const transfer = activeTransfers.get(message.transferId);
      if (!transfer) {
        sendResponse({ ok: false, message: "No se encontró una transferencia activa." });
        return false;
      }
      if (!transfer.safeToRetry) {
        sendResponse({ ok: false, message: "El archivo pudo haber llegado a TikTok. No se cancela a ciegas; verifica la pestaña." });
        return false;
      }
      transfer.cancelled = true;
      transfer.cancel?.();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})();
