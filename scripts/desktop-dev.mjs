import { spawn } from "node:child_process";
import process from "node:process";

const npmExec = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const env = { ...process.env, FLASH_CREATOR_DEV_URL: "http://127.0.0.1:3000" };
const web = spawn(npmExec, ["dev", "--", "--hostname", "127.0.0.1"], { stdio: "inherit", env, shell: process.platform === "win32" });
let desktop;
let shuttingDown = false;

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (web.exitCode !== null) throw new Error("El servidor local de Next terminó antes de iniciar Electron.");
    try {
      const response = await fetch("http://127.0.0.1:3000");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("El servidor local de Next no estuvo listo en 90 segundos.");
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (desktop?.pid) desktop.kill();
  if (web.pid) web.kill();
  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

try {
  await waitForServer();
  desktop = spawn(npmExec, ["exec", "electron", "."], { stdio: "inherit", env, shell: process.platform === "win32" });
  desktop.on("exit", (code) => shutdown(code ?? 0));
  web.on("exit", (code) => { if (!shuttingDown && code) shutdown(code); });
} catch (error) {
  console.error(error.message);
  shutdown(1);
}
