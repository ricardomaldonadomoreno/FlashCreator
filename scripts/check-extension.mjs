import { readFile } from "node:fs/promises";
const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
const permissions = new Set(manifest.permissions ?? []);
const hosts = manifest.host_permissions ?? [];
const optionalHosts = manifest.optional_host_permissions ?? [];
const background = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
const panel = await readFile(new URL("../extension/panel.js", import.meta.url), "utf8");
const forbidden = ["cookies", "tabs"];
const violations = forbidden.filter((permission) => permissions.has(permission));
const missing = ["activeTab", "scripting"].filter((permission) => !permissions.has(permission));
if (manifest.manifest_version !== 3) throw new Error("Flash Creator requiere Manifest V3.");
if (!manifest.side_panel?.default_path) throw new Error("Falta side_panel.default_path.");
if (violations.length) throw new Error(`Permisos de prototipo que no deben solicitarse aún: ${violations.join(", ")}`);
if (missing.length) throw new Error(`Faltan permisos temporales para la conexión iniciada por el usuario: ${missing.join(", ")}`);
if (hosts.length || optionalHosts.length) throw new Error("La beta debe usar activeTab y no declarar permisos de host persistentes u opcionales.");
if (Number(manifest.minimum_chrome_version) < 116
  || !background.includes("chrome.action.onClicked.addListener")
  || !background.includes("chrome.sidePanel.open({ tabId: tab.id })")
  || !background.includes("chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })")
  || !background.includes('files: ["content/studio-adapter.js"]')
  || !background.includes("isSupportedStudioUploadUrl(tab.url)")
  || background.includes("setPanelBehavior({ openPanelOnActionClick: true })")
  || panel.includes("chrome.scripting.executeScript")) {
  throw new Error("La conexión debe usar el gesto del icono de acción en Chrome 116+, limitar la inyección a la ruta admitida y no inyectar desde el Side Panel.");
}
const adapter = await readFile(new URL("../extension/content/studio-adapter.js", import.meta.url), "utf8");
if (!adapter.includes('location.origin === "https://www.tiktok.com"') || !adapter.includes("\\/tiktokstudio\\/upload")) {
  throw new Error("El adaptador debe autolimitarse al host y ruta de carga admitidos.");
}
if (!adapter.includes("const supportedRoute = isSupportedRoute();")
  || !adapter.includes("supportedRoute ? getVideoFileInputs() : []")) {
  throw new Error("El adaptador debe comprobar la ruta antes de inspeccionar controles de archivo.");
}

const bridge = await readFile(new URL("../extension/transfer/bridge.js", import.meta.url), "utf8");
const resources = manifest.web_accessible_resources ?? [];
if (resources.length !== 1
  || JSON.stringify(resources[0].resources) !== JSON.stringify(["transfer/bridge.html", "transfer/bridge.js"])
  || JSON.stringify(resources[0].matches) !== JSON.stringify(["https://www.tiktok.com/*"])) {
  throw new Error("El puente debe usar el patrón de origen válido de TikTok, sin abrir hosts externos.");
}
if (!bridge.includes("chrome.storage.session.get")
  || !bridge.includes("isValidTransferAuthorization")
  || !bridge.includes("chrome.storage.session.remove")) {
  throw new Error("El puente debe consumir una autorización efímera antes de leer el video local.");
}
if (!adapter.includes('attachShadow({ mode: "closed" })')
  || !adapter.includes("new MessageChannel()")
  || !adapter.includes("iframe.contentWindow.postMessage")
  || adapter.includes('postMessage("') && adapter.includes(', "*"')) {
  throw new Error("El adaptador debe usar un canal privado, Shadow DOM cerrado y un origen de destino explícito.");
}
if (!bridge.includes("getVideoForTransfer") || !bridge.includes("Blob.slice") && !bridge.includes("record.blob.slice")
  || !bridge.includes("CHUNK_ACK")) {
  throw new Error("La transferencia debe leer un video local y usar fragmentos con ACK.");
}
if (/\b(?:btoa|atob)\s*\(/.test(adapter + bridge)
  || /FileReader|readAsDataURL|toDataURL/.test(adapter + bridge)) {
  throw new Error("El transporte de video no puede convertir el archivo a Base64.");
}

console.log("Manifiesto validado: conexión y transferencia supervisadas, sin permisos de cuenta ni transporte Base64.");
