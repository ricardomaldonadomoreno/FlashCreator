"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Clock3,
  HardDrive,
  LayoutDashboard,
  ListVideo,
  LockKeyhole,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/brand-mark";

type VideoRecord = {
  id: string;
  name: string;
  path: string;
  size: number;
  lastModified: number;
};

type Slot = { instant: string; localDate: string; localTime: string; display: string };
type QueueItem = { videoId: string; status: string; attemptCount: number; lastResult?: { message?: string; retryable?: boolean } | null };
type HistoryEvent = { at: string; event: string; videoId?: string; status?: string; message?: string; decision?: string };
type ScheduleConfig = {
  startDelayMinutes: number;
  intervalMinutes: number;
  windowStart: string;
  windowEnd: string;
  activeDays: number[];
  maxPerDay: number;
  jitterMinutes: number;
  maxHorizonDays: number;
};
type DesktopState = {
  videos: VideoRecord[];
  queue: {
    status: string;
    index: number;
    videoIds: string[];
    plannedVideoIds?: string[];
    slots: Slot[];
    config: ScheduleConfig | null;
    timeZone: string;
    items?: QueueItem[];
    preflightIssues?: Array<{ message: string }>;
    history?: HistoryEvent[];
    lastError?: string;
  };
};
type ImportResult = { added: VideoRecord[]; rejected: Array<{ name: string; reason: string }>; duplicates: Array<{ name: string }> };
type DesktopBridge = {
  getState: () => Promise<DesktopState>;
  importVideos: () => Promise<{ state: DesktopState; result: ImportResult }>;
  removeVideo: (id: string) => Promise<DesktopState>;
  moveVideo: (id: string, offset: number) => Promise<DesktopState>;
  resolveItem: (id: string, decision: "scheduled" | "retry") => Promise<DesktopState>;
  planQueue: (config: ScheduleConfig) => Promise<{ state: DesktopState; issues: Array<{ message: string }> }>;
  openStudio: () => Promise<{ ok: boolean; message?: string }>;
  startAgent: () => Promise<{ started: boolean }>;
  pauseAgent: () => Promise<{ paused: boolean }>;
  stopAgent: () => Promise<{ stopped: boolean }>;
  onState: (listener: (state: DesktopState) => void) => () => void;
};

declare global {
  interface Window { flashCreator?: DesktopBridge }
}

const DEFAULT_CONFIG: ScheduleConfig = {
  startDelayMinutes: 20,
  intervalMinutes: 35,
  windowStart: "08:00",
  windowEnd: "22:00",
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  maxPerDay: 6,
  jitterMinutes: 5,
  maxHorizonDays: 10,
};

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const STATUS_LABELS: Record<string, string> = {
  pending: "En cola",
  uploading: "Cargando a Studio",
  awaiting_schedule: "Carga completa · preparando horario",
  submitting: "Confirmando programación",
  scheduled: "Programado en Studio",
  failed: "Error previo al envío",
  needs_verification: "Revisar en Studio",
  needs_user: "Esperando intervención",
};

function formatSize(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function Dashboard() {
  const [state, setState] = useState<DesktopState | null>(null);
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG);
  const [message, setMessage] = useState("Abre la aplicación de escritorio para administrar videos y ejecutar la cola.");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const bridge = typeof window !== "undefined" ? window.flashCreator : undefined;
  const videosById = useMemo(() => new Map((state?.videos ?? []).map((video) => [video.id, video])), [state?.videos]);
  const orderedVideos = useMemo(() => (state?.queue.videoIds ?? []).map((id) => videosById.get(id)).filter((video): video is VideoRecord => Boolean(video)), [state?.queue.videoIds, videosById]);
  const queueItems = useMemo(() => new Map((state?.queue.items ?? []).map((item) => [item.videoId, item])), [state?.queue.items]);
  const plannedVideoIds = state?.queue.plannedVideoIds ?? [];
  const plannedVideos = plannedVideoIds.map((id) => videosById.get(id)).filter((video): video is VideoRecord => Boolean(video));
  const slots = state?.queue.slots ?? [];
  const slotByVideoId = new Map(plannedVideoIds.map((id, index) => [id, slots[index]]));
  const remainingVideoIds = plannedVideoIds.filter((id) => queueItems.get(id)?.status !== "scheduled");
  const issues = state?.queue.preflightIssues ?? [];
  const queueRunning = state?.queue.status === "running";
  const queueHasUnresolved = (state?.queue.items ?? []).some((item) => ["uploading", "awaiting_schedule", "submitting", "needs_verification", "needs_user"].includes(item.status)
    || (item.status === "failed" && item.lastResult?.retryable !== true));
  const resumableStatuses = remainingVideoIds.every((id) => {
    const item = queueItems.get(id);
    return item?.status === "pending" || (item?.status === "failed" && item.lastResult?.retryable === true);
  });
  const planned = (state?.queue.status === "planned" || state?.queue.status === "paused")
    && slots.length === plannedVideoIds.length && slots.length > 0 && remainingVideoIds.length > 0
    && resumableStatuses && issues.length === 0;

  useEffect(() => {
    const api = window.flashCreator;
    if (!api) return;
    let active = true;
    api.getState().then((current) => {
      if (!active) return;
      setState(current);
      if (current.queue.config) setConfig(current.queue.config);
      setMessage("Biblioteca local lista. Los videos permanecen en este equipo.");
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "No se pudo abrir el estado local."));
    const unsubscribe = api.onState((current) => {
      if (!active) return;
      setState(current);
      if (current.queue.config) setConfig(current.queue.config);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!window.flashCreator || working) return;
    setWorking(true);
    setError("");
    try {
      await action();
      setMessage(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La operación no se pudo completar.");
    } finally {
      setWorking(false);
    }
  }

  async function importVideos() {
    if (!window.flashCreator || working) return;
    setWorking(true);
    setError("");
    try {
      const result = await window.flashCreator.importVideos();
      setState(result.state);
      const parts = [];
      if (result.result.added.length) parts.push(`Se copiaron ${result.result.added.length} video(s) a la biblioteca local.`);
      if (result.result.duplicates.length) parts.push(`Se omitieron ${result.result.duplicates.length} posible(s) duplicado(s).`);
      if (result.result.rejected.length) parts.push(result.result.rejected.map((item) => `${item.name}: ${item.reason}`).join(" "));
      setMessage(parts.join(" ") || "No se agregaron videos.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron importar los videos.");
    } finally {
      setWorking(false);
    }
  }

  async function planQueue() {
    if (!window.flashCreator || working) return;
    setWorking(true);
    setError("");
    try {
      const result = await window.flashCreator.planQueue(config);
      setState(result.state);
      setMessage(result.issues.length ? "La agenda tiene advertencias; corrige la configuración antes de iniciar." : `Agenda calculada para ${result.state.queue.slots.length} video(s).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo calcular la agenda.");
    } finally {
      setWorking(false);
    }
  }

  async function startQueue() {
    if (!window.flashCreator || !state || working || !planned) return;
    const remaining = remainingVideoIds.map((id) => ({ video: videosById.get(id), slot: slotByVideoId.get(id) })).filter((entry) => entry.video);
    const summary = remaining.map((entry, index) => `${index + 1}. ${entry.video!.name} — ${entry.slot?.display}`).join("\n");
    const action = state.queue.status === "paused" ? "reanudar con los horarios guardados" : "iniciar esta tanda";
    const confirmed = window.confirm(`Flash Creator abrirá TikTok Studio y procesará esta tanda, un video a la vez. ${state.queue.status === "paused" ? "Se conservarán los horarios originales." : "Revisa el orden y los horarios."} Si el resultado de un paso no es claro, el agente pausará la cola.\n\n${summary}\n\n¿Quieres ${action}?`);
    if (!confirmed) return;
    await runAction(() => window.flashCreator!.startAgent(), state.queue.status === "paused" ? "La tanda se reanudó con la agenda local guardada." : "La tanda comenzó en el navegador local visible.");
  }

  async function resolveVideo(id: string, decision: "scheduled" | "retry") {
    if (!window.flashCreator || working) return;
    const prompt = decision === "scheduled"
      ? "Confirma que revisaste TikTok Studio y verificaste que este video sí aparece programado."
      : "Confirma que revisaste TikTok Studio y verificaste que este video NO quedó programado. Se autorizará un nuevo intento con el horario guardado.";
    if (!window.confirm(prompt)) return;
    await runAction(
      () => window.flashCreator!.resolveItem(id, decision),
      decision === "scheduled" ? "El video quedó confirmado manualmente en el historial local." : "Se autorizó un nuevo intento usando el horario original.",
    );
  }

  function updateConfig<K extends keyof ScheduleConfig>(key: K, value: ScheduleConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <a className="brand-lockup" href="#overview" aria-label="Flash Creator, inicio">
          <BrandMark compact />
          <span className="brand-copy"><span className="brand-name">Flash Creator</span><span className="brand-edition">Local desktop agent</span></span>
        </a>
        <p className="sidebar-label">Espacio de trabajo</p>
        <nav className="nav-list">
          <a className="nav-link active" href="#overview" aria-current="page"><LayoutDashboard /><span>Resumen</span></a>
          <a className="nav-link" href="#agenda"><CalendarDays /><span>Agenda</span></a>
          <a className="nav-link" href="#cola"><ListVideo /><span>Biblioteca local</span></a>
          <a className="nav-link" href="#agente"><MonitorPlay /><span>Agente local</span></a>
        </nav>
        <p className="sidebar-label">Cuenta</p>
        <nav className="nav-list"><a className="nav-link" href="#privacidad"><ShieldCheck /><span>Privacidad local</span></a></nav>
        <div className="sidebar-spacer" />
        <div className="local-card">
          <div className="local-card-top"><HardDrive size={14} /> Tus medios, en local</div>
          <p>Los videos y el perfil dedicado del navegador se guardan en este equipo. No se envían al backend de Flash Creator.</p>
        </div>
        <div className="sidebar-foot">Flash Creator · agente local</div>
      </aside>

      <main className="main" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>FLASH CREATOR</span><ChevronRight size={12} /><strong>ESTACIÓN LOCAL</strong></div>
          <div className="topbar-right"><span className="system-pill"><span className="system-dot" /> {bridge ? "Ejecutable local" : "Vista web"}</span><a className="help-button" href="#agente" aria-label="Ayuda y guía"><CircleHelp /></a></div>
        </header>

        {!bridge && <div className="notice notice-warn" role="status">Esta vista está abierta en un navegador web. Instala y abre el ejecutable de Flash Creator para importar archivos y controlar el perfil local de Chrome.</div>}
        {message && <div className="notice" role="status">{message}</div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {queueHasUnresolved && <div className="notice notice-warn" role="status">Hay un video que debes revisar en Studio. Hasta resolverlo, la app bloquea importar, borrar o reordenar para evitar duplicados.</div>}

        <section className="hero" aria-labelledby="hero-title">
          <div>
            <p className="eyebrow"><span className="eyebrow-mark" /> ESTUDIO DE CONTENIDO LOCAL</p>
            <h1 id="hero-title">Tu agenda, <span>antes de subir.</span></h1>
            <p className="hero-copy">Organiza la cola en tu equipo y deja que el agente procese los videos de forma secuencial en una ventana visible de Chrome. Cada estado se guarda localmente para poder revisar el progreso.</p>
            <div className="hero-actions">
              <button className="button-primary" type="button" onClick={importVideos} disabled={!bridge || working || queueRunning || queueHasUnresolved}><Plus /> Agregar videos</button>
              <button className="button-secondary" type="button" onClick={() => runAction(() => window.flashCreator!.openStudio(), "TikTok Studio se abrió en el perfil local de Flash Creator.")} disabled={!bridge || working}><MonitorPlay /> Abrir TikTok Studio</button>
            </div>
          </div>
          <div className="hero-aside" aria-hidden="true"><div className="hero-symbol"><BrandMark /></div><span className="symbol-caption">Cola · Agenda · Programa</span></div>
        </section>

        <section aria-labelledby="status-title">
          <div className="section-head"><div><h2 className="section-title" id="status-title">Estado del espacio</h2><p className="section-subtitle">Archivos locales, navegador visible y ejecución recuperable.</p></div></div>
          <div className="status-grid">
            <article className="status-card"><div className="status-label"><MonitorPlay /> AGENTE LOCAL</div><div className="status-value"><span className="state-dot" /> {state?.queue.status ?? "Esperando ejecutable"}</div><div className="status-note">{queueRunning ? `Procesando video ${Math.min((state?.queue.index ?? 0) + 1, orderedVideos.length)} de ${orderedVideos.length}` : "Solo controla el flujo de carga de la cola."}</div></article>
            <article className="status-card"><div className="status-label"><HardDrive /> BIBLIOTECA</div><div className="status-value">{orderedVideos.length} videos</div><div className="status-note">Copias locales en la biblioteca de Flash Creator.</div></article>
            <article className="status-card warm"><div className="status-label"><CalendarDays /> PUBLICACIONES</div><div className="status-value">{state?.queue.items?.filter((item) => item.status === "scheduled").length ?? 0} programadas</div><div className="status-note">Solo tras observar confirmación en Studio.</div></article>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel-card queue-card" id="cola" aria-labelledby="queue-title">
            <div className="queue-head"><div><h2 className="section-title" id="queue-title">Biblioteca y cola</h2><p className="section-subtitle">MP4 y MOV guardados dentro de la biblioteca local.</p></div><span className="count-badge"><Video /> {orderedVideos.length} videos</span></div>
            {orderedVideos.length === 0 ? <div className="empty-state"><span className="empty-icon"><Clapperboard /></span><div><strong>Tu primera tanda empieza aquí</strong><p>Agrega clips y calcula la agenda antes de iniciar el agente local.</p></div></div> : <ol className="video-list">
              {orderedVideos.map((video, index) => {
                const item = queueItems.get(video.id);
                  const slot = slotByVideoId.get(video.id);
                return <li className="video-row" key={video.id}>
                  <span className="video-index">{String(index + 1).padStart(2, "0")}</span>
                  <div className="video-meta"><strong className="video-name" title={video.name}>{video.name}</strong><span className="video-size">{formatSize(video.size)} · {slot?.display ?? "Agenda pendiente"}</span><span className={`video-state ${item?.status === "needs_verification" || item?.status === "failed" ? "state-error" : ""}`}>{STATUS_LABELS[item?.status ?? "pending"] ?? item?.status ?? "En cola"}</span>{item?.lastResult?.message && <small className="video-message">{item.lastResult.message}</small>}{item && ["needs_verification", "needs_user", "failed"].includes(item.status) && <div className="video-review"><strong>Revisa este video en TikTok Studio antes de continuar.</strong>{item.status === "needs_verification" && <button type="button" disabled={!bridge || working || queueRunning} onClick={() => resolveVideo(video.id, "scheduled")}>Confirmar programado</button>}<button type="button" disabled={!bridge || working || queueRunning} onClick={() => resolveVideo(video.id, "retry")}>{item.status === "needs_user" ? "Ya resolví · permitir reintento" : "No programado · permitir reintento"}</button></div>}</div>
                  <div className="video-actions"><button className="icon-button" aria-label="Mover video arriba" title="Mover arriba" disabled={!bridge || queueRunning || queueHasUnresolved || index === 0} onClick={() => runAction(() => window.flashCreator!.moveVideo(video.id, -1), "Orden actualizado.")}><ArrowUp /></button><button className="icon-button" aria-label="Mover video abajo" title="Mover abajo" disabled={!bridge || queueRunning || queueHasUnresolved || index === orderedVideos.length - 1} onClick={() => runAction(() => window.flashCreator!.moveVideo(video.id, 1), "Orden actualizado.")}><ArrowDown /></button><button className="icon-button remove" aria-label="Quitar video" title="Quitar video de la biblioteca local" disabled={!bridge || queueRunning || queueHasUnresolved} onClick={() => runAction(() => window.flashCreator!.removeVideo(video.id), "Video eliminado de la biblioteca local.")}><Trash2 /></button></div>
                </li>;
              })}
            </ol>}
            <div className="queue-foot"><span><LockKeyhole /> Archivo local · no se envía a Flash Creator</span><span>MP4 · MOV</span></div>
            {(state?.queue.history?.length ?? 0) > 0 && <details className="history-panel"><summary>Historial local · {state?.queue.history?.length}</summary><ol>{[...(state?.queue.history ?? [])].slice(-12).reverse().map((entry, index) => <li key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleString()}</time><span>{entry.message ?? [entry.event, entry.status, entry.videoId ? videosById.get(entry.videoId)?.name ?? entry.videoId : ""].filter(Boolean).join(" · ")}</span></li>)}</ol></details>}
          </section>

          <section className="panel-card agenda-card" id="agenda" aria-labelledby="agenda-title">
            <div className="agenda-top"><div><h2 className="section-title" id="agenda-title">Agenda de la tanda</h2><p className="section-subtitle">Ajusta y revisa antes de iniciar.</p></div><span className="agenda-icon"><Clock3 /></span></div>
            <div className="settings-grid">
              <label>Intervalo (min)<input type="number" min="5" max="1440" value={config.intervalMinutes} disabled={!bridge || queueRunning} onChange={(event) => updateConfig("intervalMinutes", Number(event.target.value))} /></label>
              <label>Inicio (min)<input type="number" min="0" max="1440" value={config.startDelayMinutes} disabled={!bridge || queueRunning} onChange={(event) => updateConfig("startDelayMinutes", Number(event.target.value))} /></label>
              <label>Desde<input type="time" value={config.windowStart} disabled={!bridge || queueRunning} onChange={(event) => updateConfig("windowStart", event.target.value)} /></label>
              <label>Hasta<input type="time" value={config.windowEnd} disabled={!bridge || queueRunning} onChange={(event) => updateConfig("windowEnd", event.target.value)} /></label>
              <label>Tope diario<input type="number" min="1" max="100" value={config.maxPerDay} disabled={!bridge || queueRunning} onChange={(event) => updateConfig("maxPerDay", Number(event.target.value))} /></label>
              <label>Horizonte (días)<input type="number" min="1" max="365" value={config.maxHorizonDays} disabled={!bridge || queueRunning} onChange={(event) => updateConfig("maxHorizonDays", Number(event.target.value))} /></label>
              <label>Variación (min)<input type="number" min="0" max="30" value={config.jitterMinutes} disabled={!bridge || queueRunning} onChange={(event) => updateConfig("jitterMinutes", Number(event.target.value))} /></label>
            </div>
            <div className="day-picker" aria-label="Días activos">{DAYS.map((day, index) => <label key={day} title={day}><input type="checkbox" checked={config.activeDays.includes(index)} disabled={!bridge || queueRunning} onChange={(event) => updateConfig("activeDays", event.target.checked ? [...config.activeDays, index].sort() : config.activeDays.filter((value) => value !== index))} /><span>{day}</span></label>)}</div>
            <div className="agenda-actions"><button className="button-secondary" type="button" disabled={!bridge || working || queueRunning || queueHasUnresolved || orderedVideos.length === 0} onClick={planQueue}><CalendarDays /> Calcular agenda</button><span>{state?.queue.timeZone ?? "Zona horaria local"}</span></div>
            {issues.length > 0 && <div className="schedule-errors" role="alert">{issues.map((issue, index) => <p key={`${index}-${issue.message}`}>{issue.message}</p>)}</div>}
            {slots.length > 0 && <ol className="schedule-list">{slots.map((slot, index) => <li key={`${slot.instant}-${index}`}><span>{String(index + 1).padStart(2, "0")} · {plannedVideos[index]?.name ?? "Video"}</span><small>{slot.display}</small></li>)}</ol>}
            <div className="agenda-footer"><span>Estado <strong>{planned ? "lista para iniciar" : state?.queue.status ?? "sin plan"}</strong></span><span>{state?.queue.timeZone ?? "—"}</span></div>
          </section>
        </div>

        <section className="agent-strip" id="agente" aria-labelledby="agent-title">
          <div><p className="eyebrow"><span className="eyebrow-mark" /> EJECUCIÓN LOCAL</p><h2 id="agent-title">Chrome visible. Cola secuencial. Estado persistente.</h2><p>Al iniciar una tanda, el agente trabaja un video a la vez. Si no puede confirmar una carga o una programación, pausa y te indica qué revisar en Studio antes de continuar.</p></div>
          <div className="agent-controls">
            <button className="button-primary" type="button" disabled={!bridge || !planned || working || queueRunning} onClick={startQueue}><Play /> {state?.queue.status === "paused" ? "Reanudar tanda" : "Iniciar tanda"}</button>
            <button className="button-secondary" type="button" disabled={!bridge || !queueRunning || working} onClick={() => runAction(() => window.flashCreator!.pauseAgent(), "La cola se pausará al terminar el paso actual.")}><Pause /> Pausar</button>
            <button className="button-secondary stop-button" type="button" disabled={!bridge || !queueRunning || working} onClick={() => runAction(() => window.flashCreator!.stopAgent(), "Se solicitó detener la cola.")}><Square /> Detener</button>
          </div>
        </section>

        <footer className="footer" id="privacidad"><span><strong>Flash Creator</strong> — estación local para creadores.</span><span><Check size={12} /> Videos fuera del backend de Flash Creator.</span></footer>
      </main>
    </div>
  );
}
