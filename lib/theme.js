/**
 * Tema global del panel (maestro + sub-bots).
 * Source of truth: storage/databases/branding.json → theme
 *
 * Estilo base: panel Códigos (minimal oscuro, tipografía limpia).
 * Los presets solo cambian los 3 colores seed; el resto se deriva.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'

const BRANDING_PATH = path.join(process.cwd(), 'storage', 'databases', 'branding.json')

/** @typedef {{ primary: string, bg: string, surface: string }} ThemeSeed */
/** @typedef {Record<string, string>} ThemeTokens */

/**
 * Presets: misma estructura visual (fondo casi negro + tarjetas planas).
 * Solo varían acento / matiz del fondo.
 */
export const THEME_PRESETS = {
  codigos: {
    id: 'codigos',
    name: 'Códigos',
    desc: 'Minimal oscuro (recomendado)',
    seed: { primary: '#c4a574', bg: '#0c0d0f', surface: '#14161a' },
  },
  ultra: {
    id: 'ultra',
    name: 'Ultra',
    desc: 'Oscuro con acento teal',
    seed: { primary: '#14b8a6', bg: '#0c0d0f', surface: '#14161a' },
  },
  oscuro: {
    id: 'oscuro',
    name: 'Oscuro',
    desc: 'Negro puro, acento plata',
    seed: { primary: '#a8b0bc', bg: '#080809', surface: '#121214' },
  },
  grafito: {
    id: 'grafito',
    name: 'Grafito',
    desc: 'Pizarra con azul frío',
    seed: { primary: '#7d8fa8', bg: '#0c0d0f', surface: '#16181d' },
  },
  medianoche: {
    id: 'medianoche',
    name: 'Medianoche',
    desc: 'Azul noche, acento índigo',
    seed: { primary: '#8b9cf7', bg: '#0a0c12', surface: '#141824' },
  },
  esmeralda: {
    id: 'esmeralda',
    name: 'Esmeralda',
    desc: 'Verde bosque elegante',
    seed: { primary: '#6fbf8a', bg: '#0a0d0b', surface: '#121816' },
  },
  blanco: {
    id: 'blanco',
    name: 'Claro',
    desc: 'Fondo claro para oficina',
    seed: { primary: '#a8895c', bg: '#f3f4f6', surface: '#ffffff' },
  },
}

export const DEFAULT_THEME = {
  id: 'codigos',
  custom: { primary: '#c4a574', bg: '#0c0d0f', surface: '#14161a' },
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n))
}

function sanitizeHex(value, fallback = '#c4a574') {
  const raw = String(value || '').trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) {
    if (raw.length === 4) {
      const r = raw[1], g = raw[2], b = raw[3]
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
    }
    return raw.slice(0, 7).toLowerCase()
  }
  return fallback
}

function hexToRgb(hex) {
  const h = sanitizeHex(hex, '#000000').slice(1)
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function rgbToHex(r, g, b) {
  const to = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  const lin = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

function mix(a, b, t) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex(
    A.r + (B.r - A.r) * t,
    A.g + (B.g - A.g) * t,
    A.b + (B.b - A.b) * t
  )
}

function lighten(hex, t) {
  return mix(hex, '#ffffff', t)
}

function darken(hex, t) {
  return mix(hex, '#000000', t)
}

function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${clamp(a, 0, 1)})`
}

/** Construye la paleta completa a partir de 3 colores base (estilo Códigos). */
export function buildThemeTokens(seed = {}) {
  const primary = sanitizeHex(seed.primary, '#c4a574')
  const bg = sanitizeHex(seed.bg, '#0c0d0f')
  const surface = sanitizeHex(seed.surface, '#14161a')
  const isLight = luminance(bg) > 0.45
  const textMain = isLight ? '#0f172a' : '#e8eaed'
  const textDim = isLight ? '#64748b' : '#8b929e'
  const card = isLight
    ? (luminance(surface) > 0.85 ? surface : lighten(surface, 0.08))
    : surface
  const input = isLight ? darken(card, 0.03) : mix(bg, '#000000', 0.22)
  // Bordes sólidos (no translúcidos) = look Códigos
  const border = isLight ? rgba('#0f172a', 0.12) : lighten(mix(surface, '#ffffff', 0.08), 0.04)
  const lineSolid = isLight ? rgba('#0f172a', 0.12) : '#2a2e36'
  const secondary = isLight ? darken(primary, 0.12) : lighten(primary, 0.18)
  const danger = isLight ? '#dc2626' : '#d97a7a'
  const warning = isLight ? '#d97706' : '#d4a574'
  const success = isLight ? '#059669' : '#6fbf8a'
  // Acento secundario (dashboard / badges neutros) — no pisar primary
  const accent = isLight ? '#64748b' : '#6b7280'

  return {
    bgBody: bg,
    bgCard: isLight ? rgba(card, 0.98) : card,
    bgCardSolid: card,
    bgInput: input,
    primary,
    primaryDim: rgba(primary, isLight ? 0.12 : 0.16),
    primaryGlow: rgba(primary, isLight ? 0.2 : 0.28),
    primarySoft: rgba(primary, isLight ? 0.08 : 0.1),
    secondary,
    accent,
    danger,
    warning,
    success,
    textMain,
    textDim,
    border: isLight ? border : lineSolid,
    line: lineSolid,
    shadow: 'none',
    radiusLg: '0px',
    radiusMd: '0px',
    isLight: isLight ? '1' : '0',
    colorScheme: isLight ? 'light' : 'dark',
  }
}

export function getThemeSeedForId(id, custom = null) {
  if (id === 'custom' && custom) {
    return {
      primary: sanitizeHex(custom.primary, DEFAULT_THEME.custom.primary),
      bg: sanitizeHex(custom.bg, DEFAULT_THEME.custom.bg),
      surface: sanitizeHex(custom.surface, DEFAULT_THEME.custom.surface),
    }
  }
  const preset = THEME_PRESETS[id] || THEME_PRESETS.codigos
  return { ...preset.seed }
}

export function normalizeThemeConfig(raw = {}) {
  const id = String(raw.id || 'codigos')
  const known = id === 'custom' || !!THEME_PRESETS[id]
  const themeId = known ? id : 'codigos'
  const custom = {
    primary: sanitizeHex(raw.custom?.primary, DEFAULT_THEME.custom.primary),
    bg: sanitizeHex(raw.custom?.bg, DEFAULT_THEME.custom.bg),
    surface: sanitizeHex(raw.custom?.surface, DEFAULT_THEME.custom.surface),
  }
  const seed = getThemeSeedForId(themeId, custom)
  const tokens = buildThemeTokens(seed)
  return {
    id: themeId,
    custom,
    seed,
    tokens,
  }
}

export function readThemeFromBrandingFile() {
  try {
    if (!existsSync(BRANDING_PATH)) return normalizeThemeConfig(DEFAULT_THEME)
    const raw = JSON.parse(readFileSync(BRANDING_PATH, 'utf8'))
    return normalizeThemeConfig(raw?.theme || DEFAULT_THEME)
  } catch {
    return normalizeThemeConfig(DEFAULT_THEME)
  }
}

export function getThemeConfig() {
  return readThemeFromBrandingFile()
}

/** Persiste theme fusionando con branding.json existente (sin borrar brand/logo). */
export function saveThemeConfig(partial = {}) {
  let branding = {}
  try {
    if (existsSync(BRANDING_PATH)) {
      branding = JSON.parse(readFileSync(BRANDING_PATH, 'utf8')) || {}
    }
  } catch {
    branding = {}
  }
  const current = normalizeThemeConfig(branding.theme || DEFAULT_THEME)
  const nextId = partial.id != null ? String(partial.id) : current.id
  const nextCustom = {
    primary: partial.primary != null ? sanitizeHex(partial.primary, current.custom.primary) : current.custom.primary,
    bg: partial.bg != null ? sanitizeHex(partial.bg, current.custom.bg) : current.custom.bg,
    surface: partial.surface != null ? sanitizeHex(partial.surface, current.custom.surface) : current.custom.surface,
  }
  const theme = normalizeThemeConfig({
    id: nextId,
    custom: nextId === 'custom' ? nextCustom : current.custom,
  })
  // Si elige preset, igual guardamos custom por si vuelve a personalizar
  branding.theme = {
    id: theme.id,
    custom: theme.id === 'custom' ? theme.custom : nextCustom,
  }
  mkdirSync(path.dirname(BRANDING_PATH), { recursive: true })
  writeFileSync(BRANDING_PATH, JSON.stringify(branding, null, 2), 'utf8')
  return theme
}

/** CSS global inyectable (gana a :root locales por ir después del head).
 * Incluye la “piel” visual del panel Códigos: tipografía, tarjetas planas, sin glow IA.
 */
export function renderThemeCss(theme = null) {
  const t = theme || getThemeConfig()
  const tok = t.tokens
  const fontLink =
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">`
  const css = `
html {
  color-scheme: ${tok.colorScheme};
}
:root {
  --bg-body: ${tok.bgBody};
  --bg: ${tok.bgBody};
  --bg-card: ${tok.bgCard};
  --bg-card-solid: ${tok.bgCardSolid};
  --card: ${tok.bgCardSolid};
  --panel: ${tok.bgCardSolid};
  --bg-input: ${tok.bgInput};
  --input: ${tok.bgInput};
  --primary: ${tok.primary};
  --primary-dim: ${tok.primaryDim};
  --primary-glow: transparent;
  --primary-soft: ${tok.primarySoft};
  --secondary: ${tok.secondary};
  --accent: ${tok.accent};
  --danger: ${tok.danger};
  --warning: ${tok.warning};
  --success: ${tok.success};
  --warn: ${tok.warning};
  --ok: ${tok.success};
  --bad: ${tok.danger};
  --text-main: ${tok.textMain};
  --text: ${tok.textMain};
  --text-dim: ${tok.textDim};
  --dim: ${tok.textDim};
  --mute: ${tok.textDim};
  --border: ${tok.border};
  --line: ${tok.line || tok.border};
  --shadow: none;
  --shadow-glow: none;
  --radius-lg: 0px;
  --radius-md: 0px;
  --radius: 0px;
  --r: 0px;
  --theme-is-light: ${tok.isLight};
  --font-ui: "IBM Plex Sans", system-ui, -apple-system, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}
body {
  background-color: var(--bg-body) !important;
  background-image: none !important;
  color: var(--text-main) !important;
  font-family: var(--font-ui) !important;
  -webkit-font-smoothing: antialiased;
}
/* Quitar aurora / orbes / grilla “IA” */
body::before,
body::after,
.ambient,
.orb,
.orb-1,
.orb-2,
.lp-aurora,
.lp-noise {
  display: none !important;
  opacity: 0 !important;
  animation: none !important;
  background: none !important;
  filter: none !important;
}

/* Tipografía */
h1, h2, h3, h4,
.brand-heading,
.header-title h1,
.clients-title,
.hero h1,
.section-title {
  font-family: var(--font-ui) !important;
  letter-spacing: -0.02em;
  background: none !important;
  -webkit-text-fill-color: unset !important;
  filter: none !important;
  text-shadow: none !important;
}
.header-title h1 i,
.clients-title i,
.hero h1 i {
  color: var(--primary) !important;
  -webkit-text-fill-color: var(--primary) !important;
  filter: none !important;
  text-shadow: none !important;
}
.dash-stat-val,
.mono,
code,
pre,
.pairing-code,
#pairing-code-principal {
  font-family: var(--font-mono) !important;
}

/* Tarjetas / paneles planos (estilo Códigos) */
.header,
.nav-bar,
.dash-stat,
.codes-section,
.code-card,
.bot-card,
.client-card,
.card,
.panel,
.modal-content,
.hero,
.guide-panel,
.folder-section,
.folder-card,
.rule-card,
.ar-card,
.section-box,
.form-card,
.pub-item,
.campaign-box,
.stat-card,
.feature-card,
.account-card,
.profile-card,
.mother-card,
.link-card,
.flash,
.toast,
.help-box,
.theme-card,
.theme-live-preview,
.cfg-pane,
.custom-colors {
  background: var(--panel) !important;
  background-image: none !important;
  border: 1px solid var(--line) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.header::before,
.header::after,
.dash-stat::before,
.code-card::before {
  display: none !important;
}
.dash-stat:hover,
.code-card:hover,
.bot-card:hover,
.client-card:hover {
  transform: none !important;
  border-color: #3d4450 !important;
}
.dash-stat.stat-online .dash-stat-val,
.dash-stat-val {
  text-shadow: none !important;
}
.dash-stats {
  gap: 1px !important;
  background: var(--line) !important;
  border: 1px solid var(--line) !important;
}
.dash-stats .dash-stat {
  margin: 0 !important;
}

/* Nav tipo pestañas Códigos */
.nav-bar {
  background: transparent !important;
  border: none !important;
  border-bottom: 1px solid var(--line) !important;
  border-radius: 0 !important;
  padding: 0 0 0 0 !important;
  margin-bottom: 18px !important;
}
.nav-links {
  gap: 0 !important;
  width: 100%;
}
.nav-links a,
.nav-link-btn,
.top-nav a,
.tab {
  border-radius: 0 !important;
  box-shadow: none !important;
  font-weight: 500 !important;
  font-size: 13px !important;
}
.nav-links a {
  padding: 10px 14px !important;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  margin-bottom: -1px !important;
  background: transparent !important;
  color: var(--mute) !important;
}
.nav-links a:hover {
  color: var(--text) !important;
  background: transparent !important;
}
.nav-links a.active {
  color: var(--text) !important;
  background: transparent !important;
  border-bottom-color: var(--primary) !important;
  box-shadow: none !important;
}

/* Botones planos */
.btn,
.btn-primary,
.btn-ghost,
.btn-danger,
.btn-secondary,
button.btn,
.codes-more-btn,
.nav-link-btn,
.ar-feature-link,
input[type="submit"],
button[type="submit"] {
  border-radius: 0 !important;
  box-shadow: none !important;
  font-family: var(--font-ui) !important;
  font-weight: 600 !important;
  transform: none !important;
}
.btn-primary,
button.btn-primary {
  background: var(--primary) !important;
  border: 1px solid var(--primary) !important;
  color: var(--bg-body) !important;
}
.btn-primary:hover,
button.btn-primary:hover {
  filter: brightness(1.05);
  transform: none !important;
  background: var(--primary) !important;
}
.btn-ghost,
.btn.ghost,
.codes-more-btn {
  background: transparent !important;
  color: var(--text) !important;
  border: 1px solid var(--line) !important;
}
.codes-more-btn:hover {
  color: var(--text) !important;
  border-color: #3d4450 !important;
  background: transparent !important;
}

/* Inputs */
input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]),
select,
textarea {
  border-radius: 0 !important;
  background: var(--input) !important;
  border: 1px solid var(--line) !important;
  color: var(--text) !important;
  font-family: var(--font-ui) !important;
  box-shadow: none !important;
}
input:focus,
select:focus,
textarea:focus {
  outline: none !important;
  border-color: var(--primary) !important;
  box-shadow: none !important;
}
label {
  color: var(--mute) !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Modales */
.modal .modal-content,
.modal-content {
  background: var(--panel) !important;
  border: 1px solid var(--line) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
.cfg-tab {
  border-radius: 0 !important;
  background: transparent !important;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  color: var(--mute) !important;
}
.cfg-tab.is-on {
  color: var(--text) !important;
  border-bottom-color: var(--primary) !important;
  background: transparent !important;
  box-shadow: none !important;
}

/* Hero / paneles con degradado “IA” → plano */
.hero,
.guide-panel,
.ar-feature-link,
.folder-section,
.rule-card {
  background-image: none !important;
}
.hero-actions a {
  background: var(--primary-dim) !important;
  color: var(--primary) !important;
  border: 1px solid var(--line) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
`.trim()
  return `${fontLink}<style id="app-global-theme" data-theme-id="${escapeAttr(t.id)}">${css}</style>`
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

/** Swatches de preview para el selector (html). */
export function themePreviewHtml(selectedId = 'codigos') {
  const items = Object.values(THEME_PRESETS).map((p) => {
    const on = selectedId === p.id
    return `
      <label class="theme-card ${on ? 'is-on' : ''}" data-theme-id="${p.id}">
        <input type="radio" name="themeId" value="${p.id}" ${on ? 'checked' : ''} style="position:absolute;opacity:0;pointer-events:none">
        <span class="theme-swatch" style="background:${p.seed.bg}">
          <i style="background:${p.seed.surface};border:2px solid ${p.seed.primary}"></i>
          <b style="background:${p.seed.primary}"></b>
        </span>
        <span class="theme-meta">
          <strong>${escapeAttr(p.name)}</strong>
          <small>${escapeAttr(p.desc)}</small>
        </span>
      </label>`
  }).join('')
  const customOn = selectedId === 'custom'
  return items + `
    <label class="theme-card ${customOn ? 'is-on' : ''}" data-theme-id="custom">
      <input type="radio" name="themeId" value="custom" ${customOn ? 'checked' : ''} style="position:absolute;opacity:0;pointer-events:none">
      <span class="theme-swatch theme-swatch-custom">
        <i></i><b></b>
      </span>
      <span class="theme-meta">
        <strong>Personalizado</strong>
        <small>Tú eliges 3 colores</small>
      </span>
    </label>`
}
