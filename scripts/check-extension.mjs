import { readFile } from "node:fs/promises";
const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
const permissions = new Set(manifest.permissions ?? []);
const hosts = manifest.host_permissions ?? [];
const optionalHosts = manifest.optional_host_permissions ?? [];
const forbidden = ["cookies", "tabs"];
const violations = forbidden.filter((permission) => permissions.has(permission));
const missing = ["activeTab", "scripting"].filter((permission) => !permissions.has(permission));
if (manifest.manifest_version !== 3) throw new Error("Flash Creator requiere Manifest V3.");
if (!manifest.side_panel?.default_path) throw new Error("Falta side_panel.default_path.");
if (violations.length) throw new Error(`Permisos de prototipo que no deben solicitarse aún: ${violations.join(", ")}`);
if (missing.length) throw new Error(`Faltan permisos temporales para la conexión iniciada por el usuario: ${missing.join(", ")}`);
if (hosts.length || optionalHosts.length) throw new Error("La beta debe usar activeTab y no declarar permisos de host persistentes u opcionales.");
const adapter = await readFile(new URL("../extension/content/studio-adapter.js", import.meta.url), "utf8");
if (!adapter.includes('location.origin === "https://www.tiktok.com"') || !adapter.includes("\\/tiktokstudio\\/upload")) {
  throw new Error("El adaptador debe autolimitarse al host y ruta de carga admitidos.");
}

const bridge = await readFile(new URL("../extension/transfer/bridge.js", import.meta.url), "utf8");
const resources = manifest.web_accessible_resources ?? [];
if (resources.length !== 1
  || JSON.stringify(resources[0].resources) !== JSON.stringify(["transfer/bridge.html", "transfer/bridge.js"])
  || JSON.stringify(resources[0].matches) !== JSON.stringify(["https://www.tiktok.com/tiktokstudio/upload*"])) {
  throw new Error("El puente solo puede exponerse en la ruta de carga de TikTok Studio.");
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
