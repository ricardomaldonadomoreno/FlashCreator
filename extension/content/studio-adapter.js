(() => {
  const supportedRoute = location.origin === "https://www.tiktok.com"
    && /^\/tiktokstudio\/upload\/?$/.test(location.pathname);
  if (!supportedRoute || globalThis.__flashCreatorStudioAdapterV1) return;
  globalThis.__flashCreatorStudioAdapterV1 = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "FLASH_CREATOR_STUDIO_PING") return false;

    // This handshake only reports the presence of file inputs. It does not inspect
    // account identity, login state, captions, analytics, cookies, or page content.
    const uploadInputCount = document.querySelectorAll('input[type="file"]').length;
    sendResponse({ ok: true, version: 1, uploadInputCount });
    return false;
  });
})();
