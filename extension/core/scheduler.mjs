export const MIN_LEAD_MINUTES = 16;
export const FIVE_MINUTES_MS = 5 * 60 * 1000;

export const DEFAULT_SCHEDULE = Object.freeze({
  startDelayMinutes: 20,
  intervalMinutes: 35,
  windowStart: "08:00",
  windowEnd: "22:00",
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  maxPerDay: 6,
  jitterMinutes: 5,
  maxHorizonDays: 10,
});

const pad = (value) => String(value).padStart(2, "0");
const toLocalDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toLocalTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

export function roundToNextFiveMinutes(value) {
  const date = new Date(value);
  return new Date(Math.ceil(date.getTime() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS);
}

export function parseClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function moveToNextDayAt(date, minutesAfterMidnight) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  next.setHours(Math.floor(minutesAfterMidnight / 60), minutesAfterMidnight % 60, 0, 0);
  return next;
}

function validateConfig(config) {
  const issues = [];
  const start = parseClock(config.windowStart);
  const end = parseClock(config.windowEnd);
  if (start === null || end === null || end <= start) {
    issues.push({ code: "invalid-window", message: "La hora final debe ser posterior a la hora inicial dentro del mismo día." });
  }
  if (!Array.isArray(config.activeDays) || !config.activeDays.some((day) => Number.isInteger(day) && day >= 0 && day <= 6)) {
    issues.push({ code: "no-active-days", message: "Selecciona al menos un día activo." });
  }
  if (!Number.isFinite(config.intervalMinutes) || config.intervalMinutes < 5 || config.intervalMinutes > 1440) {
    issues.push({ code: "invalid-interval", message: "El intervalo debe estar entre 5 y 1440 minutos." });
  }
  if (!Number.isFinite(config.startDelayMinutes) || config.startDelayMinutes < 0 || config.startDelayMinutes > 1440) {
    issues.push({ code: "invalid-delay", message: "El retraso inicial debe estar entre 0 y 1440 minutos." });
  }
  if (!Number.isInteger(config.maxPerDay) || config.maxPerDay < 1 || config.maxPerDay > 100) {
    issues.push({ code: "invalid-daily-cap", message: "El tope diario debe estar entre 1 y 100 videos." });
  }
  if (!Number.isFinite(config.jitterMinutes) || config.jitterMinutes < 0 || config.jitterMinutes > 30) {
    issues.push({ code: "invalid-jitter", message: "La variación debe estar entre 0 y 30 minutos." });
  }
  if (!Number.isInteger(config.maxHorizonDays) || config.maxHorizonDays < 1 || config.maxHorizonDays > 365) {
    issues.push({ code: "invalid-horizon", message: "El horizonte configurado debe estar entre 1 y 365 días." });
  }
  return issues;
}

function nextPermittedSlot(cursorValue, config, counts, windowStart, windowEnd) {
  let cursor = roundToNextFiveMinutes(cursorValue);
  const activeDays = new Set(config.activeDays.map(Number));

  for (let attempts = 0; attempts < 370; attempts += 1) {
    const weekday = cursor.getDay();
    const dateKey = toLocalDateKey(cursor);
    const count = counts.get(dateKey) ?? 0;

    if (!activeDays.has(weekday) || count >= config.maxPerDay) {
      cursor = moveToNextDayAt(cursor, windowStart);
      continue;
    }

    const dayStart = new Date(cursor);
    dayStart.setHours(Math.floor(windowStart / 60), windowStart % 60, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setHours(Math.floor(windowEnd / 60), windowEnd % 60, 0, 0);

    if (cursor < dayStart) cursor = roundToNextFiveMinutes(dayStart);
    if (cursor <= dayEnd) return cursor;
    cursor = moveToNextDayAt(cursor, windowStart);
  }

  return null;
}

/**
 * Generate a complete, local-time schedule. Persist the returned ISO instants and do not
 * recalculate them automatically when resuming a queue.
 */
export function planSchedule(itemCount, inputConfig = {}, options = {}) {
  const config = { ...DEFAULT_SCHEDULE, ...inputConfig };
  const issues = validateConfig(config);
  if (!Number.isInteger(itemCount) || itemCount < 0) {
    issues.push({ code: "invalid-count", message: "La cantidad de videos debe ser un número entero no negativo." });
  }
  if (issues.length || itemCount === 0) {
    if (itemCount === 0 && !issues.length) {
      issues.push({ code: "empty-queue", message: "Agrega al menos un video antes de calcular la agenda." });
    }
    return { slots: [], issues };
  }

  const now = new Date(options.now ?? Date.now());
  const random = typeof options.random === "function" ? options.random : Math.random;
  const windowStart = parseClock(config.windowStart);
  const windowEnd = parseClock(config.windowEnd);
  const counts = new Map(Object.entries(config.existingByDate ?? {}).map(([date, count]) => [date, Number(count) || 0]));
  const earliest = new Date(now.getTime() + MIN_LEAD_MINUTES * 60 * 1000);
  let cursor = new Date(earliest.getTime() + config.startDelayMinutes * 60 * 1000);
  let previous = null;
  const slots = [];

  for (let index = 0; index < itemCount; index += 1) {
    if (previous) {
      const randomUnit = Math.max(0, Math.min(1, Number(random()) || 0));
      const jitterSteps = Math.round(((randomUnit * 2) - 1) * config.jitterMinutes / 5);
      const variationMinutes = jitterSteps * 5;
      cursor = new Date(previous.getTime() + Math.max(5, config.intervalMinutes + variationMinutes) * 60 * 1000);
    }

    const slot = nextPermittedSlot(cursor, config, counts, windowStart, windowEnd);
    if (!slot) {
      issues.push({ code: "no-slot", index, message: `No se encontró un horario permitido para el video ${index + 1}.` });
      break;
    }

    const dateKey = toLocalDateKey(slot);
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
    slots.push({
      index,
      instant: slot.toISOString(),
      localDate: dateKey,
      localTime: toLocalTime(slot),
      display: new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(slot),
    });
    previous = slot;
  }

  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + config.maxHorizonDays);
  const beyondHorizon = slots.find((slot) => new Date(slot.instant) > horizon);
  if (beyondHorizon) {
    issues.push({
      code: "horizon-exceeded",
      index: beyondHorizon.index,
      message: `El último horario supera el horizonte configurado de ${config.maxHorizonDays} días. Confirma el límite de esta cuenta en TikTok Studio, recalcula o cancela.`,
    });
  }

  return { slots, issues };
}

export function formatSlotForDisplay(slot, locale = "es") {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(slot.instant));
}
