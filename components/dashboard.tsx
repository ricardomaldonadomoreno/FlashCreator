import {
  ArrowDownRight,
  ArrowUpRight,
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
  ShieldCheck,
  Sparkles,
  Video,
  WifiOff,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

const studioUrl = "https://www.tiktok.com/tiktokstudio/upload";

export function Dashboard() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <a className="brand-lockup" href="#overview" aria-label="Flash Creator, inicio">
          <BrandMark compact />
          <span className="brand-copy">
            <span className="brand-name">Flash Creator</span>
            <span className="brand-edition">Creator workspace</span>
          </span>
        </a>

        <p className="sidebar-label">Espacio de trabajo</p>
        <nav className="nav-list">
          <a className="nav-link active" href="#overview" aria-current="page">
            <LayoutDashboard /><span>Resumen</span>
          </a>
          <a className="nav-link" href="#agenda">
            <CalendarDays /><span>Agenda</span><span className="nav-soon">MVP</span>
          </a>
          <a className="nav-link" href="#cola">
            <ListVideo /><span>Biblioteca local</span><span className="nav-soon">MVP</span>
          </a>
          <a className="nav-link" href="#agente">
            <MonitorPlay /><span>Agente Chrome</span>
          </a>
        </nav>

        <p className="sidebar-label">Cuenta</p>
        <nav className="nav-list">
          <a className="nav-link" href="#acceso">
            <ShieldCheck /><span>Acceso y pagos</span><span className="nav-soon">Pronto</span>
          </a>
          <a className="nav-link" href="#ayuda">
            <CircleHelp /><span>Ayuda</span>
          </a>
        </nav>

        <div className="sidebar-spacer" />
        <div className="local-card">
          <div className="local-card-top"><HardDrive size={14} /> Tus medios, en local</div>
          <p>Los archivos de video se quedarán en este equipo. El backend no recibirá tus videos.</p>
          <a href="#privacidad">Cómo cuidamos tus datos <ArrowUpRight /></a>
        </div>
        <div className="sidebar-foot">Flash Creator · versión inicial</div>
      </aside>

      <main className="main" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>FLASH CREATOR</span><ChevronRight size={12} /><strong>RESUMEN</strong></div>
          <div className="topbar-right">
            <span className="system-pill"><span className="system-dot" /> Prototipo local</span>
            <a className="help-button" id="ayuda" href="#agente" aria-label="Ayuda y guía"><CircleHelp /></a>
          </div>
        </header>

        <section className="hero" aria-labelledby="hero-title">
          <div>
            <p className="eyebrow"><span className="eyebrow-mark" /> ESTUDIO DE CONTENIDO LOCAL</p>
            <h1 id="hero-title">Tu agenda, <span>antes de subir.</span></h1>
            <p className="hero-copy">
              Organiza videos y horarios desde una sola estación de trabajo. Flash Creator está construyendo un agente local para acompañar TikTok Studio; esta primera entrega prepara la base y aún no publica ni programa automáticamente.
            </p>
            <div className="hero-actions">
              <a className="button-primary" href="#agente"><Sparkles /> Conocer el agente local</a>
              <a className="button-secondary" href={studioUrl} target="_blank" rel="noreferrer"><MonitorPlay /> Abrir TikTok Studio <ArrowUpRight /></a>
            </div>
          </div>
          <div className="hero-aside" aria-hidden="true">
            <div className="hero-symbol"><BrandMark /></div>
            <span className="symbol-caption">Plan · Revisa · Programa</span>
          </div>
        </section>

        <section aria-labelledby="status-title">
          <div className="section-head">
            <div>
              <h2 className="section-title" id="status-title">Estado del espacio</h2>
              <p className="section-subtitle">Una lectura honesta de lo que está listo en esta versión.</p>
            </div>
          </div>
          <div className="status-grid">
            <article className="status-card">
              <div className="status-label"><MonitorPlay /> AGENTE LOCAL</div>
              <div className="status-value"><span className="state-dot" /> En preparación</div>
              <div className="status-note">El panel lateral aún no está conectado a TikTok.</div>
            </article>
            <article className="status-card">
              <div className="status-label"><HardDrive /> BIBLIOTECA</div>
              <div className="status-value">Almacenamiento local</div>
              <div className="status-note">Los archivos no se envían a la web.</div>
            </article>
            <article className="status-card warm">
              <div className="status-label"><CalendarDays /> PUBLICACIONES</div>
              <div className="status-value">Sin programación</div>
              <div className="status-note">La automatización se habilitará después de validarla.</div>
            </article>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel-card queue-card" id="cola" aria-labelledby="queue-title">
            <div className="queue-head">
              <div>
                <h2 className="section-title" id="queue-title">Biblioteca y cola</h2>
                <p className="section-subtitle">Los clips se seleccionarán desde el agente de Chrome.</p>
              </div>
              <span className="count-badge"><Video /> 0 videos</span>
            </div>
            <div className="empty-state">
              <span className="empty-icon"><Clapperboard /></span>
              <div>
                <strong>Tu primera tanda empieza aquí</strong>
                <p>La importación local aparecerá en el Side Panel. No es necesario subir archivos a esta página.</p>
              </div>
            </div>
            <div className="queue-foot">
              <span><LockKeyhole /> Archivos guardados en este equipo</span>
              <span>MP4 · MOV <ArrowDownRight /></span>
            </div>
          </section>

          <section className="panel-card agenda-card" id="agenda" aria-labelledby="agenda-title">
            <div className="agenda-top">
              <div>
                <h2 className="section-title" id="agenda-title">Vista de agenda</h2>
                <p className="section-subtitle">Ajustes antes de enviar nada a TikTok.</p>
              </div>
              <span className="agenda-icon"><Clock3 /></span>
            </div>
            <div className="agenda-empty">
              <WifiOff />
              <span>Sin cola calculada. La agenda completa se preparará y validará en el agente antes de iniciar una carga.</span>
            </div>
            <div className="agenda-footer"><span>Zona horaria <strong>del equipo</strong></span><span>PRÓXIMA FASE</span></div>
          </section>
        </div>

        <section className="agent-strip" id="agente" aria-labelledby="agent-title">
          <div>
            <p className="eyebrow"><span className="eyebrow-mark" /> CÓMO FUNCIONARÁ</p>
            <h2 id="agent-title">Web y TikTok Studio, juntos en Chrome.</h2>
            <p>La web administrará tu cuenta. El agente abrirá sus controles en el Side Panel mientras TikTok Studio permanece en la pestaña principal. La PC debe estar encendida durante la carga; una vez que TikTok confirme la programación, la publicación futura queda en la cuenta.</p>
          </div>
          <div className="agent-steps" aria-label="Flujo previsto">
            <div className="agent-step"><span className="step-index">01</span> Elige clips</div>
            <div className="agent-step"><span className="step-index">02</span> Revisa horarios</div>
            <div className="agent-step"><span className="step-index">03</span> Confirma en Studio</div>
          </div>
        </section>

        <footer className="footer" id="privacidad">
          <span><strong>Flash Creator</strong> — plataforma y agente local en desarrollo.</span>
          <span><Check size={12} /> Videos fuera de la base de datos remota.</span>
        </footer>
      </main>
    </div>
  );
}
