// ============================================================================
//  TEXTO 3D + LOADER  ·  CONFIGURACIÓN
// ----------------------------------------------------------------------------
//  brand / loaderTagline / author → editables desde el panel maestro.
//  version → SOLO se cambia aquí en el código (no desde el panel).
// ============================================================================
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { renderThemeCss } from './theme.js'
import { renderPanelPerformanceBlock } from './panel-performance.js'

export const TEXT3D_DEFAULTS = {
  brand: 'BOT SPAM ULTRA',
  version: 'V8', // Solo desde código — no editable en el panel
  loaderTagline: 'Cargando panel del bot...',
  author: 'Sunkovv </>',
  loaderLogo: '', 
}

const BRANDING_PATH = path.join(process.cwd(), 'storage', 'databases', 'branding.json')
export const BRANDING_ASSETS_DIR = path.join(process.cwd(), 'storage', 'branding')

function sanitizeField(value, fallback = '') {
  if (value == null) return fallback
  return String(value).trim().slice(0, 120)
}

function sanitizeLogoName(value) {
  const name = sanitizeField(value, '')
  if (!name) return ''
  
  const base = path.basename(name)
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) return ''
  if (!/\.(png|jpe?g|webp|gif|ico|svg)$/i.test(base)) return ''
  return base
}

/** Ruta absoluta del logo si existe en disco. */
export function getLoaderLogoPath(cfg = null) {
  const name = sanitizeLogoName(cfg ? cfg.loaderLogo : getText3dConfig().loaderLogo)
  if (!name) return null
  const full = path.join(BRANDING_ASSETS_DIR, name)
  return existsSync(full) ? full : null
}

/** Lee la config actual (archivo + defaults). La versión siempre viene del código. */
export function getText3dConfig() {
  const cfg = { ...TEXT3D_DEFAULTS }
  try {
    if (existsSync(BRANDING_PATH)) {
      const raw = JSON.parse(readFileSync(BRANDING_PATH, 'utf8'))
      if (raw && typeof raw === 'object') {
        if (raw.brand != null) cfg.brand = sanitizeField(raw.brand, cfg.brand) || cfg.brand
        if (raw.loaderTagline != null) cfg.loaderTagline = sanitizeField(raw.loaderTagline, cfg.loaderTagline)
        if (raw.author != null) cfg.author = sanitizeField(raw.author, '')
        if (raw.loaderLogo != null) cfg.loaderLogo = sanitizeLogoName(raw.loaderLogo)
        if (raw.theme != null) cfg.theme = raw.theme
      }
    }
  } catch (e) {
    console.error('[TEXT3D] Error leyendo branding.json:', e.message)
  }
  // La versión nunca se sobrescribe desde archivo/panel
  cfg.version = TEXT3D_DEFAULTS.version
  // Si el archivo no existe, limpiar referencia
  if (cfg.loaderLogo) {
    const full = path.join(BRANDING_ASSETS_DIR, cfg.loaderLogo)
    if (!existsSync(full)) cfg.loaderLogo = ''
  }
  return cfg
}

/** Compat: objeto espejo de la config actual (se recalcula al leer). */
export const TEXT3D_CONFIG = new Proxy({}, {
  get(_t, prop) {
    return getText3dConfig()[prop]
  },
})

/** Guarda brand / tagline / author / logo. La versión se ignora (solo código). Preserva theme. */
export function saveText3dConfig(fields = {}) {
  const current = getText3dConfig()
  let existingTheme = null
  try {
    if (existsSync(BRANDING_PATH)) {
      const raw = JSON.parse(readFileSync(BRANDING_PATH, 'utf8'))
      if (raw?.theme) existingTheme = raw.theme
    }
  } catch (_) {}

  let loaderLogo = current.loaderLogo
  if (Object.prototype.hasOwnProperty.call(fields, 'loaderLogo')) {
    loaderLogo = sanitizeLogoName(fields.loaderLogo)
  }
  if (fields.clearLogo) loaderLogo = ''

  const next = {
    brand: sanitizeField(fields.brand, current.brand) || current.brand,
    loaderTagline: sanitizeField(fields.loaderTagline, current.loaderTagline),
    author: sanitizeField(fields.author, ''),
    loaderLogo,
  }
  if (existingTheme) next.theme = existingTheme
  // Si el caller manda theme, respetarlo
  if (fields.theme && typeof fields.theme === 'object') next.theme = fields.theme

  mkdirSync(path.dirname(BRANDING_PATH), { recursive: true })
  writeFileSync(BRANDING_PATH, JSON.stringify(next, null, 2), 'utf8')
  return getText3dConfig()
}
// ============================================================================

/** CSS compartido: marca, chip de versión y pantalla de carga. */
export const text3dStyles = `
    .brand-3d {
        font-family: 'Space Grotesk', 'Inter', sans-serif;
        font-weight: 800;
        letter-spacing: 0.04em;
        background: linear-gradient(120deg, #ffffff 0%, var(--primary, #5eead4) 42%, var(--primary, #14b8a6) 78%, var(--secondary, #38bdf8) 100%);
        background-size: 220% 220%;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        -webkit-text-fill-color: transparent;
        animation: ultraShift 6s linear infinite;
    }

    /* Chip de versión — siempre legible (ignora text-fill del h1 padre) */
    .ultra-badge {
        display: inline-flex !important;
        align-items: center;
        gap: 0;
        position: relative;
        overflow: hidden;
        vertical-align: middle;
        font-family: 'Space Grotesk', 'Inter', sans-serif;
        font-weight: 700;
        font-style: normal;
        font-size: 0.72em;
        letter-spacing: 0.08em;
        padding: 0.28em 0.75em;
        margin-left: 0.45em;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.92) !important;
        color: #5eead4 !important;
        -webkit-text-fill-color: #5eead4 !important;
        background-clip: padding-box !important;
        -webkit-background-clip: padding-box !important;
        text-shadow: none !important;
        border: 1px solid rgba(45, 212, 191, 0.35);
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            0 0 0 1px rgba(0, 0, 0, 0.25),
            0 4px 14px rgba(0, 0, 0, 0.25);
        transform: none !important;
        animation: none !important;
        line-height: 1.2;
        white-space: nowrap;
    }
    .ultra-badge::before,
    .ultra-badge::after { display: none !important; content: none !important; }
    @keyframes ultraShift {
        0% { background-position: 0% 50%; }
        100% { background-position: 220% 50%; }
    }
    @keyframes ultraFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
    }

    /* ── Pantalla de carga (minimal profesional) ────────── */
    .t3d-loader {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 28px 20px;
        background: #07090c;
        transition: opacity 0.5s ease, visibility 0.5s ease;
    }
    .t3d-loader.hide {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
    }
    html.t3d-lock, body.t3d-lock { overflow: hidden !important; height: 100% !important; touch-action: none !important; }

    /* Ambiente: luz suave + malla + grano (sin blobs de IA) */
    .t3d-loader-fx {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
    }
    .t3d-loader-fx .amb-glow {
        position: absolute;
        left: 50%;
        top: 42%;
        width: min(720px, 120vw);
        height: min(420px, 70vh);
        transform: translate(-50%, -50%);
        background:
            radial-gradient(ellipse 70% 55% at 50% 45%, rgba(45, 212, 191, 0.11), transparent 70%),
            radial-gradient(ellipse 40% 50% at 30% 60%, rgba(56, 189, 248, 0.05), transparent 65%);
        animation: ambBreathe 7s ease-in-out infinite;
    }
    .t3d-loader-fx .amb-vignette {
        position: absolute;
        inset: 0;
        background:
            radial-gradient(ellipse 85% 75% at 50% 45%, transparent 35%, rgba(0, 0, 0, 0.55) 100%),
            linear-gradient(180deg, rgba(8, 12, 16, 0.35) 0%, transparent 28%, transparent 72%, rgba(4, 6, 8, 0.65) 100%);
    }
    .t3d-loader-fx .amb-grid {
        position: absolute;
        inset: 0;
        opacity: 0.045;
        background-image:
            linear-gradient(rgba(148, 163, 184, 0.55) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.55) 1px, transparent 1px);
        background-size: 48px 48px;
        mask-image: radial-gradient(ellipse 65% 55% at 50% 48%, #000 10%, transparent 72%);
        -webkit-mask-image: radial-gradient(ellipse 65% 55% at 50% 48%, #000 10%, transparent 72%);
    }
    .t3d-loader-fx .amb-grain {
        position: absolute;
        inset: 0;
        opacity: 0.04;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
        background-size: 180px 180px;
    }
    .t3d-loader-fx .amb-line {
        position: absolute;
        left: 0; right: 0;
        top: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(94, 234, 212, 0.35), transparent);
        opacity: 0.7;
    }

    @keyframes ambBreathe {
        0%, 100% { opacity: 0.75; transform: translate(-50%, -50%) scale(1); }
        50% { opacity: 1; transform: translate(-50%, -48%) scale(1.04); }
    }

    /* Contenido centrado, sin tarjeta “glass” */
    .t3d-loader-card {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: min(320px, 92vw);
        gap: 0;
        padding: 8px 0 0;
        background: none;
        border: none;
        box-shadow: none;
        border-radius: 0;
        animation: cardIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .t3d-loader-card::before,
    .t3d-loader-card::after { display: none; content: none; }

    @keyframes cardIn {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .t3d-loader-mark-wrap {
        position: relative;
        width: 88px;
        height: 88px;
        margin-bottom: 28px;
        display: grid;
        place-items: center;
    }
    .t3d-loader-ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .t3d-loader-ring::after {
        content: '';
        position: absolute;
        inset: -1px;
        border-radius: 50%;
        border: 1.5px solid transparent;
        border-top-color: rgba(94, 234, 212, 0.85);
        border-right-color: rgba(94, 234, 212, 0.15);
        animation: t3dspin 1.1s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
    }

    .t3d-loader-mark {
        width: 64px;
        height: 64px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        font-family: 'Space Grotesk', system-ui, sans-serif;
        font-weight: 700;
        font-size: 1.4rem;
        letter-spacing: -0.02em;
        color: #ecfdf5;
        -webkit-text-fill-color: #ecfdf5;
        background: linear-gradient(160deg, #134e4a 0%, #0f766e 55%, #115e59 100%);
        border: 1px solid rgba(94, 234, 212, 0.22);
        box-shadow:
            0 12px 32px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
        position: relative;
        z-index: 1;
        overflow: hidden;
    }
    .t3d-loader-mark.has-logo {
        width: 68px;
        height: 68px;
        border-radius: 18px;
        background: #0c1218;
        padding: 0;
        border: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    }
    .t3d-loader-mark.has-logo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .t3d-loader h2 {
        font-size: clamp(1.15rem, 3.5vw, 1.45rem);
        margin: 0 0 6px;
        text-align: center;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 10px;
        line-height: 1.2;
        color: #f1f5f9;
        -webkit-text-fill-color: #f1f5f9;
        font-weight: 600;
        letter-spacing: -0.02em;
        animation: fadeUpSoft 0.6s ease 0.06s both;
    }
    .t3d-loader h2 .brand-3d {
        font-weight: 700;
    }
    .t3d-loader h2 .ultra-badge {
        font-size: 0.65rem;
        padding: 4px 8px;
        border-radius: 6px;
        letter-spacing: 0.04em;
    }

    /* Sin órbitas / cores (legacy hidden by omission) */
    .t3d-orbit { display: none !important; }

    @keyframes t3dspin { to { transform: rotate(360deg); } }
    @keyframes fadeUpSoft {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .t3d-progress {
        width: 100%;
        max-width: 200px;
        margin-top: 22px;
        position: relative;
        z-index: 1;
        animation: fadeUpSoft 0.6s ease 0.12s both;
    }
    .t3d-progress-meta {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 10px;
        font-size: 0.68rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #5b6578;
        font-weight: 500;
    }
    .t3d-progress-meta strong {
        color: #a7b0c0;
        -webkit-text-fill-color: #a7b0c0;
        font-family: 'Space Grotesk', ui-monospace, monospace;
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.04em;
    }
    .t3d-loader-bar {
        width: 100%;
        height: 2px;
        border-radius: 99px;
        background: rgba(148, 163, 184, 0.12);
        overflow: hidden;
        position: relative;
    }
    .t3d-loader-bar i {
        display: block;
        height: 100%;
        width: 8%;
        border-radius: 99px;
        background: linear-gradient(90deg, #0f766e, #2dd4bf);
        box-shadow: 0 0 10px rgba(45, 212, 191, 0.35);
        transition: width 0.2s ease-out;
    }

    .t3d-loader-steps {
        display: flex;
        gap: 5px;
        align-items: center;
        margin-top: 14px;
        z-index: 1;
        animation: fadeUpSoft 0.6s ease 0.16s both;
    }
    .t3d-loader-steps b {
        width: 18px;
        height: 2px;
        border-radius: 99px;
        background: rgba(148, 163, 184, 0.18);
        transition: background 0.3s ease, width 0.3s ease;
    }
    .t3d-loader-steps b.on {
        background: rgba(45, 212, 191, 0.75);
        width: 22px;
        box-shadow: none;
        transform: none;
    }

    .t3d-loader-tag {
        color: #7a8499;
        font-size: 0.82rem;
        letter-spacing: 0.01em;
        text-align: center;
        max-width: 260px;
        line-height: 1.5;
        margin-top: 18px;
        position: relative;
        z-index: 1;
        min-height: 1.5em;
        font-weight: 450;
        animation: fadeUpSoft 0.6s ease 0.2s both;
    }

    .t3d-loader-by {
        margin-top: 28px;
        font-family: system-ui, sans-serif;
        font-weight: 500;
        font-size: 0.68rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #4a5568;
        position: relative;
        z-index: 1;
        animation: fadeUpSoft 0.6s ease 0.26s both;
    }
    .t3d-loader-by .by-label {
        color: #3d4656;
        margin-right: 6px;
        font-weight: 500;
    }
    .t3d-loader-by .by-name {
        color: #6b7588;
        -webkit-text-fill-color: #6b7588;
        background: none;
        filter: none;
        animation: none;
        letter-spacing: 0.08em;
    }

    @media (prefers-reduced-motion: reduce) {
        .t3d-loader-ring::after,
        .t3d-loader-fx .amb-glow,
        .brand-3d,
        .t3d-loader-card {
            animation: none !important;
        }
        .t3d-loader-fx .amb-glow { opacity: 0.85; }
    }
`

/** Escapa caracteres HTML para que textos como "</>" se muestren tal cual. */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Devuelve el <h1> del título con el nombre + chip de versión. */
export function renderBrandHeading(iconClass = 'fas fa-terminal', { extraClass = '' } = {}) {
  const { brand, version } = getText3dConfig()
  return `<h1 class="brand-heading ${extraClass}"><i class="${iconClass}"></i> <span class="brand-3d">${escapeHtml(brand)}</span> <span class="ultra-badge" aria-label="Versión ${escapeHtml(version)}">${escapeHtml(version)}</span></h1>`
}

/** Link favicon (usa el logo del loader si existe). */
export function renderFaviconLink() {
  const logoPath = getLoaderLogoPath()
  if (!logoPath) return ''
  const ext = path.extname(logoPath).toLowerCase()
  const type =
    ext === '.svg' ? 'image/svg+xml'
      : ext === '.ico' ? 'image/x-icon'
        : ext === '.webp' ? 'image/webp'
          : ext === '.gif' ? 'image/gif'
            : 'image/png'
  return `<link rel="icon" type="${type}" href="/branding-logo?v=${Date.now()}">`
}

/** Devuelve el HTML de la pantalla de carga. */
export function renderLoader() {
  const cfg = getText3dConfig()
  const { brand, version, loaderTagline, author } = cfg
  const mark = (brand || 'B').trim().charAt(0).toUpperCase() || 'B'
  const hasLogo = !!getLoaderLogoPath(cfg)
  const markHtml = hasLogo
    ? `<div class="t3d-loader-mark has-logo"><img src="/branding-logo?v=${Date.now()}" alt="${escapeHtml(brand)}"></div>`
    : `<div class="t3d-loader-mark">${escapeHtml(mark)}</div>`
  const byHtml = author && author.trim()
    ? `<div class="t3d-loader-by"><span class="by-label">By</span><span class="by-name">${escapeHtml(author.trim())}</span></div>`
    : ''
  return `
    <div class="t3d-loader" id="t3dLoader">
        <div class="t3d-loader-fx" aria-hidden="true">
            <div class="amb-glow"></div>
            <div class="amb-grid"></div>
            <div class="amb-vignette"></div>
            <div class="amb-grain"></div>
            <div class="amb-line"></div>
        </div>
        <div class="t3d-loader-card">
            <div class="t3d-loader-mark-wrap">
                <div class="t3d-loader-ring" aria-hidden="true"></div>
                ${markHtml}
            </div>
            <h2><span class="brand-3d">${escapeHtml(brand)}</span> <span class="ultra-badge">${escapeHtml(version)}</span></h2>
            <div class="t3d-progress">
                <div class="t3d-progress-meta"><span>Cargando</span><strong id="t3dPct">0%</strong></div>
                <div class="t3d-loader-bar"><i id="t3dBar"></i></div>
            </div>
            <div class="t3d-loader-steps" id="t3dSteps" aria-hidden="true"><b></b><b></b><b></b><b></b></div>
            <div class="t3d-loader-tag" id="t3dTag">${escapeHtml(loaderTagline)}</div>
            ${byHtml}
        </div>
    </div>`
}

/** Script que oculta el loader al cargar y lo muestra al navegar/refrescar. */
export const loaderScript = `
(function(){
    var l = document.getElementById('t3dLoader');
    if (!l) return;
    var root = document.documentElement, body = document.body;
    var bar = document.getElementById('t3dBar');
    var pct = document.getElementById('t3dPct');
    var steps = document.getElementById('t3dSteps');
    var tag = document.getElementById('t3dTag');
    var tips = [
        'Abriendo el panel...',
        'Cargando tu sesión...',
        'Preparando el escritorio...',
        'Ya casi...'
    ];
    var tipIdx = 0;
    var progress = 0;
    var done = false;
    var tipTimer = null;
    var tickTimer = null;

    function lock(){ root.classList.add('t3d-lock'); if (body) body.classList.add('t3d-lock'); }
    function unlock(){ root.classList.remove('t3d-lock'); if (body) body.classList.remove('t3d-lock'); }

    function setProgress(n){
        progress = Math.max(progress, Math.min(100, n|0));
        if (bar) bar.style.width = progress + '%';
        if (pct) pct.textContent = progress + '%';
        if (steps) {
            var dots = steps.querySelectorAll('b');
            var active = Math.min(dots.length, Math.ceil(progress / 25));
            for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < active);
        }
    }

    function startAnim(){
        tipTimer = setInterval(function(){
            if (!tag || tipIdx >= tips.length) return;
            tag.textContent = tips[tipIdx++];
        }, 380);
        tickTimer = setInterval(function(){
            if (done) return;
            var step = progress < 55 ? 7 : (progress < 85 ? 4 : 2);
            setProgress(progress + step);
            if (progress >= 92) clearInterval(tickTimer);
        }, 120);
    }

    function finish(){
        done = true;
        clearInterval(tickTimer);
        clearInterval(tipTimer);
        setProgress(100);
        if (tag) tag.textContent = 'Listo';
        setTimeout(function(){ l.classList.add('hide'); unlock(); }, 220);
    }

    try {
        if (sessionStorage.getItem('t3dSkipLoader')) {
            sessionStorage.removeItem('t3dSkipLoader');
            l.classList.add('hide');
            return;
        }
    } catch (e) {}

    var start = Date.now();
    var MIN_MS = 1400 + Math.floor(Math.random() * 500); // 1.4–1.9s para ver la animación
    lock();
    startAnim();
    setProgress(8);

    function hide(){
        var wait = Math.max(0, MIN_MS - (Date.now() - start));
        setTimeout(finish, wait);
    }
    function show(){ l.classList.remove('hide'); lock(); }

    if (document.readyState === 'complete') { hide(); }
    else { window.addEventListener('load', hide); }
    window.addEventListener('pageshow', function(e){ if (e.persisted) { l.classList.add('hide'); unlock(); } });
    window.addEventListener('beforeunload', show);
})();
`

/** Bloque listo para inyectar tras <body>: tema global + estilos + loader + script. */
export function renderLoaderBlock() {
  return `${renderFaviconLink()}${renderThemeCss()}${renderPanelPerformanceBlock()}<style>${text3dStyles}</style>${renderLoader()}<script>${loaderScript}</script>`
}
