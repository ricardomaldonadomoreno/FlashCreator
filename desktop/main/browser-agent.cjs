const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

const STUDIO_URL = "https://www.tiktok.com/tiktokstudio/upload";
const MAX_PRE_SUBMIT_RETRIES = 2;
const RETRY_DELAY_MS = 20_000;

class AgentError extends Error {
  constructor(message, { phase = "before_submit", retryable = false, needsUser = false } = {}) {
    super(message);
    this.name = "AgentError";
    this.phase = phase;
    this.retryable = retryable;
    this.needsUser = needsUser;
  }
}

function isUploadRoute(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && url.hostname === "www.tiktok.com" && url.pathname === "/tiktokstudio/upload";
  } catch {
    return false;
  }
}

function localSlot(instant) {
  const date = new Date(instant);
  const pad = (value) => String(value).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function slotFields(slot) {
  const fields = slot?.localDate && slot?.localTime
    ? { date: slot.localDate, time: slot.localTime }
    : localSlot(slot?.instant ?? slot);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fields.date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(fields.time);
  if (!dateMatch || !timeMatch) throw new Error("Formato de horario local no válido.");
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hours > 23 || minutes > 59) {
    throw new Error("El horario guardado está fuera de rango.");
  }
  return fields;
}

class BrowserAgent {
  constructor({ profilePath, onUpdate = () => {}, retryDelayMs = RETRY_DELAY_MS }) {
    this.profilePath = profilePath;
    this.onUpdate = onUpdate;
    this.retryDelayMs = retryDelayMs;
    this.context = null;
    this.page = null;
    this.pauseRequested = false;
    this.stopRequested = false;
    this.running = false;
  }

  async ensureBrowser() {
    if (this.context && this.page && !this.page.isClosed()) return this.page;
    fs.mkdirSync(this.profilePath, { recursive: true });
    const launchOptions = {
      headless: false,
      viewport: { width: 1440, height: 960 },
      acceptDownloads: false,
    };
    if (process.env.FLASH_CREATOR_BROWSER_PATH) {
      launchOptions.executablePath = process.env.FLASH_CREATOR_BROWSER_PATH;
    } else {
      launchOptions.channel = "chrome";
    }

    try {
      this.context = await chromium.launchPersistentContext(this.profilePath, launchOptions);
    } catch (error) {
      throw new AgentError(
        `No se pudo abrir Chrome. Instala Google Chrome estable o configura FLASH_CREATOR_BROWSER_PATH. ${error.message}`,
        { needsUser: true },
      );
    }
    this.context.setDefaultTimeout(15_000);
    this.page = this.context.pages()[0] ?? await this.context.newPage();
    this.context.on("page", (page) => { this.page = page; });
    return this.page;
  }

  async openStudio() {
    const page = await this.ensureBrowser();
    await page.goto(STUDIO_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(800);
    if (!isUploadRoute(page.url())) {
      return { ok: false, url: page.url(), message: "Chrome abrió Studio, pero la sesión requiere atención. Inicia sesión o resuelve la verificación en la ventana visible y vuelve a intentar." };
    }
    return { ok: true, url: page.url(), title: await page.title() };
  }

  async waitUntilUploadReady(page) {
    try {
      await page.waitForFunction(() => {
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };
        const body = document.body?.innerText ?? "";
        const readyWords = /upload complete|uploaded|video uploaded|subido|cargado|envio conclu[ií]do|carregado/i;
        if (readyWords.test(body)) return true;
        const progress = [...document.querySelectorAll('[role="progressbar"]')]
          .filter(visible)
          .some((element) => Number(element.getAttribute("aria-valuenow")) >= 100);
        return progress;
      }, { timeout: 5 * 60_000, polling: 1_000 });
    } catch {
      throw new AgentError(
        "No pude confirmar que TikTok Studio terminó de recibir el video. Revisa la ventana; no lo volveré a subir automáticamente.",
        { phase: "after_submit", retryable: false },
      );
    }
  }

  async setScheduledTime(page, savedSlot) {
    let slot;
    try {
      slot = slotFields(savedSlot);
    } catch (error) {
      throw new AgentError(`El horario local guardado no es válido: ${error.message}`, { phase: "after_submit" });
    }
    let dateInput = page.locator('input[type="date"]:visible');
    let timeInput = page.locator('input[type="time"]:visible');
    let dateCount = await dateInput.count();
    let timeCount = await timeInput.count();

    if (dateCount !== 1 || timeCount !== 1) {
      const scheduleToggle = page.getByRole("checkbox", { name: /schedule|programar|agendar/i });
      const toggleCount = await scheduleToggle.count();
      if (toggleCount === 1 && await scheduleToggle.isVisible() && !(await scheduleToggle.isChecked())) {
        await scheduleToggle.check();
        dateInput = page.locator('input[type="date"]:visible');
        timeInput = page.locator('input[type="time"]:visible');
        dateCount = await dateInput.count();
        timeCount = await timeInput.count();
      }
    }

    if (dateCount !== 1 || timeCount !== 1) {
      throw new AgentError(
        "No encontré un único campo visible de fecha y hora para programar. La página pudo cambiar; revisa Studio antes de continuar.",
        { phase: "after_submit", retryable: false },
      );
    }
    await dateInput.fill(slot.date);
    await timeInput.fill(slot.time);
    const values = await Promise.all([dateInput.inputValue(), timeInput.inputValue()]);
    if (values[0] !== slot.date || values[1] !== slot.time) {
      throw new AgentError("TikTok Studio no conservó el horario solicitado. La cola quedó pausada para revisión.", { phase: "after_submit" });
    }
  }

  async clickUniqueScheduleButton(page) {
    const expression = /^(schedule|programar|agendar)(\s+(video|post|publicaci[oó]n))?$/i;
    const buttons = page.getByRole("button").filter({ hasText: expression });
    const count = await buttons.count();
    if (count !== 1 || !(await buttons.first().isVisible()) || !(await buttons.first().isEnabled())) {
      throw new AgentError("No encontré un único botón de programación habilitado; el agente se detuvo sin pulsar otro control.", { phase: "after_submit" });
    }
    await buttons.first().click();
  }

  async confirmSchedule(page) {
    try {
      await page.getByText(/scheduled successfully|video scheduled|programado correctamente|programaci[oó]n (completada|exitosa)|agendado com sucesso/i).first().waitFor({ state: "visible", timeout: 30_000 });
      return true;
    } catch {
      throw new AgentError(
        "Pulsé Programar, pero no apareció una confirmación inequívoca. Revisa TikTok Studio antes de reintentar para evitar duplicados.",
        { phase: "after_submit", retryable: false },
      );
    }
  }

  async processItem(item, slot, attempt) {
    const page = await this.ensureBrowser();
    await page.goto(STUDIO_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!isUploadRoute(page.url())) {
      throw new AgentError("La sesión de Studio no está lista. Inicia sesión o resuelve cualquier verificación en Chrome y vuelve a iniciar la cola.", { needsUser: true });
    }

    const inputInfo = await page.locator('input[type="file"]').evaluateAll((inputs) => inputs.map((input, index) => ({
      index,
      accept: input.getAttribute("accept") || "",
      multiple: input.hasAttribute("multiple"),
    })));
    const candidates = inputInfo.filter((input) => /video|mp4|mov/i.test(input.accept) || inputInfo.length === 1);
    if (candidates.length !== 1) {
      throw new AgentError("No se detectó un único control de video. Se detuvo antes de seleccionar el archivo.", { retryable: true });
    }
    if (!fs.existsSync(item.path)) throw new AgentError(`No se encontró el archivo local “${item.name}”.`, { retryable: true });

    const fileInput = page.locator('input[type="file"]').nth(candidates[0].index);

    await this.onUpdate({ videoId: item.id, status: "uploading", attemptCount: attempt, message: "Seleccionando el archivo local en Studio…" });
    await fileInput.setInputFiles(item.path);
    await this.waitUntilUploadReady(page);
    await this.onUpdate({ videoId: item.id, status: "awaiting_schedule", attemptCount: attempt, message: "Studio indica que el video terminó de cargarse." });
    await this.setScheduledTime(page, slot);
    await this.onUpdate({ videoId: item.id, status: "submitting", attemptCount: attempt, message: "Confirmando la programación…" });
    await this.clickUniqueScheduleButton(page);
    await this.confirmSchedule(page);
  }

  async runBatch(items, slots) {
    if (this.running) throw new Error("El agente ya está procesando una cola.");
    this.running = true;
    this.pauseRequested = false;
    this.stopRequested = false;
    try {
      for (let index = 0; index < items.length; index += 1) {
        if (this.pauseRequested || this.stopRequested) break;
        const item = items[index];
        const slot = slots[index];
        let attempt = 0;
        while (attempt <= MAX_PRE_SUBMIT_RETRIES) {
          if (this.pauseRequested || this.stopRequested) break;
          attempt += 1;
          try {
            await this.processItem(item, slot, attempt);
            await this.onUpdate({ videoId: item.id, status: "scheduled", attemptCount: attempt, message: "TikTok Studio confirmó la programación." });
            break;
          } catch (error) {
            const safeRetry = error instanceof AgentError && error.retryable && error.phase === "before_submit" && attempt <= MAX_PRE_SUBMIT_RETRIES;
            const status = error.needsUser ? "needs_user" : error.phase === "after_submit" ? "needs_verification" : "failed";
            await this.onUpdate({
              videoId: item.id,
              status,
              attemptCount: attempt,
              message: error.message || "La acción se detuvo; revisa Studio.",
              retryable: safeRetry,
            });
            if (safeRetry) {
              await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
              continue;
            }
            this.pauseRequested = true;
            break;
          }
        }
      }
      if (this.stopRequested) return { status: "stopped" };
      if (this.pauseRequested) return { status: "paused" };
      return { status: "completed" };
    } finally {
      this.running = false;
    }
  }

  requestPause() { this.pauseRequested = true; }
  requestStop() { this.stopRequested = true; this.pauseRequested = true; }

  async close() {
    this.requestStop();
    if (this.context) await this.context.close().catch(() => {});
    this.context = null;
    this.page = null;
  }
}

module.exports = { BrowserAgent, AgentError, STUDIO_URL, isUploadRoute, localSlot, slotFields };
