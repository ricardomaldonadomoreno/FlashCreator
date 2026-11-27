import { isSupportedStudioUploadUrl } from "./core/studio-target.mjs";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => {
    console.error("Flash Creator: no se pudo desactivar la apertura automática anterior", error);
  });
});

chrome.action.onClicked.addListener((tab) => {
  if (!Number.isInteger(tab?.id)) return;

  // Opening the panel through setPanelBehavior does not grant activeTab.
  // Run both APIs directly from the toolbar-action gesture instead.
  void chrome.sidePanel.open({ tabId: tab.id }).catch((error) => {
    console.error("Flash Creator: no se pudo abrir el Side Panel", error);
  });

  if (!isSupportedStudioUploadUrl(tab.url)) return;

  void chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content/studio-adapter.js"],
  }).catch((error) => {
    console.error("Flash Creator: no se pudo preparar la pestaña de TikTok Studio", error);
  });
});
