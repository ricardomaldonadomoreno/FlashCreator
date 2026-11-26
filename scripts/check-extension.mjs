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

console.log("Manifiesto validado: conexión por acción explícita con activeTab/scripting; sin cookies, tabs ni hosts persistentes.");
