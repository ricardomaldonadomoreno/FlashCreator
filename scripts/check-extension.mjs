import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
const permissions = new Set(manifest.permissions ?? []);
const hosts = manifest.host_permissions ?? [];
const forbidden = ["cookies", "tabs", "scripting"];
const violations = forbidden.filter((permission) => permissions.has(permission));

if (manifest.manifest_version !== 3) throw new Error("Flash Creator requiere Manifest V3.");
if (!manifest.side_panel?.default_path) throw new Error("Falta side_panel.default_path.");
if (violations.length) throw new Error(`Permisos de prototipo que no deben solicitarse aún: ${violations.join(", ")}`);
if (hosts.length) throw new Error("El prototipo local no necesita host_permissions todavía.");

console.log("Manifiesto validado: Side Panel habilitado, sin cookies/tabs/scripting ni hosts externos.");
