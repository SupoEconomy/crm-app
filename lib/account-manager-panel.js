/**
 * Panel HTML — Gestor General (UX profesional, colapsable, editable).
 */
import {
  CATEGORIES,
  formatDateDisplay,
  toDateInputValue,
  rentalStatusLabel,
  isRentalActive,
  daysUntilExpiry,
  getMother,
  getClient,
  getProfile,
} from './account-manager.js'
import {
  getReminderPreviewSample,
  reminderVarsHintHtml,
} from './reminder-template.js'

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function catLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || id || 'General'
}

/** Alquiler activo de un perfil (si hay). */
export function activeRentalForProfile(cfg, profileId) {
  return (cfg.rentals || []).find((r) => r.profileId === profileId && isRentalActive(r)) || null
}

/** Valor sensible: censurado por defecto, clic para revelar. */
function secretToggle(value) {
  if (!value) return `<span class="muted-dash">—</span>`
  return `<button type="button" class="secret-tog" title="Mostrar / ocultar">
    <span class="secret-mask">••••••••</span>
    <span class="secret-val" hidden>${esc(value)}</span>
    <i class="fas fa-eye" aria-hidden="true"></i>
  </button>`
}

function credLine(items) {
  const parts = items.filter((x) => x && (x.always || x.value))
  if (!parts.length) return ''
  return `<div class="cred-grid">${parts
    .map(
      (x) =>
        `<div class="cred-item">
          <span class="cred-k">${esc(x.label)}</span>
          <span class="cred-v">${x.secret ? secretToggle(x.value) : esc(x.value || '—')}</span>
        </div>`
    )
    .join('')}</div>`
}

/**
 * @param {{ cfg, brand, version, homeLink, loaderBlock, toast, tab }} opts
 */
export function renderAccountManagerPage(opts = {}) {
  const {
    cfg,
    brand = 'Bot Spam',
    version = '',
    homeLink = '/',
    loaderBlock = '',
    toast = '',
    tab = 'resumen',
  } = opts

  const mothers = cfg.mothers || []
  const clients = cfg.clients || []
  const rentals = cfg.rentals || []

  const activeRentals = rentals.filter(isRentalActive)
  const expiringSoon = activeRentals.filter((r) => {
    const d = daysUntilExpiry(r)
    return d != null && d >= 0 && d <= 3
  })
  const totalProfiles = mothers.reduce((n, m) => n + (m.profiles || []).length, 0)
  let freeCount = 0
  let rentedCount = 0
  for (const m of mothers) {
    for (const p of m.profiles || []) {
      if (activeRentalForProfile(cfg, p.id)) rentedCount++
      else freeCount++
    }
  }

  const tabs = [
    { id: 'resumen', label: 'Resumen', icon: 'fa-gauge-high' },
    { id: 'madres', label: 'Cuentas y perfiles', icon: 'fa-server' },
    { id: 'clientes', label: 'Clientes', icon: 'fa-users' },
    { id: 'alquileres', label: 'Alquileres', icon: 'fa-handshake' },
    { id: 'ajustes', label: 'Ajustes', icon: 'fa-sliders' },
  ]

  const tabNav = tabs
    .map(
      (t) =>
        `<a class="am-tab${tab === t.id ? ' is-on' : ''}" href="/gestor-general?tab=${t.id}">
          <i class="fas ${t.icon}"></i> ${esc(t.label)}
        </a>`
    )
    .join('')

  let body = ''
  if (tab === 'madres') body = renderMothers(cfg, mothers, clients)
  else if (tab === 'clientes') body = renderClients(clients, cfg)
  else if (tab === 'alquileres') body = renderRentals(cfg, rentals, clients, mothers)
  else if (tab === 'ajustes') body = renderSettings(cfg)
  else {
    body = renderSummary({
      mothers,
      clients,
      rentals,
      activeRentals,
      expiringSoon,
      freeCount,
      rentedCount,
      totalProfiles,
      cfg,
    })
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gestor General · ${esc(brand)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0c0d0f;
      --card: #14161a;
      --input: #0f1114;
      --primary: #c4a574;
      --primary-dim: rgba(196, 165, 116, 0.16);
      --secondary: #d4b896;
      --danger: #d97a7a;
      --warn: #d4a574;
      --ok: #6fbf8a;
      --text: #e8eaed;
      --dim: #8b929e;
      --border: #2a2e36;
      --r: 10px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "IBM Plex Sans", Inter, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 18px 14px 56px;
      background-image: none;
    }
    .wrap { max-width: 980px; margin: 0 auto; }
    .top { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; margin-bottom: 18px; }
    .nav-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 0;
      border: 1px solid var(--border); background: var(--input);
      color: var(--text); text-decoration: none; font-size: 13px; font-weight: 500;
    }
    .head h1 {
      font-family: "IBM Plex Sans", Inter, sans-serif;
      font-size: 1.2rem; font-weight: 600; letter-spacing: -0.02em;
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    }
    .head h1 i { color: var(--primary); }
    .head p { color: var(--dim); font-size: 0.88rem; margin-top: 6px; max-width: 620px; line-height: 1.5; }
    .toast {
      margin: 0 0 14px; padding: 12px 14px; border-radius: 10px;
      background: rgba(20,184,166,0.12); border: 1px solid rgba(20,184,166,0.35);
      color: #99f6e4; font-size: 0.86rem;
    }
    .toast.err { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.35); color: #fca5a5; }
    .tabs {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 6px; margin-bottom: 18px;
      border: 1px solid var(--border); border-radius: 12px;
      background: rgba(15,18,26,0.9);
    }
    .am-tab {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 9px 13px; border-radius: 9px;
      color: var(--dim); text-decoration: none; font-size: 0.8rem; font-weight: 600;
    }
    .am-tab.is-on, .am-tab:hover {
      color: var(--text); background: var(--primary-dim);
      box-shadow: inset 0 0 0 1px rgba(20,184,166,0.22);
    }
    .am-tab.is-on i { color: var(--primary); }

    .guide {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
      margin-bottom: 14px;
    }
    @media (max-width: 800px) { .guide { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 480px) { .guide { grid-template-columns: 1fr; } }
    .guide-step {
      border: 1px solid var(--border); border-radius: 10px;
      background: rgba(0,0,0,0.22); padding: 10px 11px 12px;
    }
    .guide-step .n {
      display: inline-grid; place-items: center;
      width: 22px; height: 22px; border-radius: 7px;
      background: var(--primary); color: #042f2e;
      font-size: 0.7rem; font-weight: 800; margin-bottom: 6px;
    }
    .guide-step strong { display: block; font-size: 0.8rem; margin-bottom: 2px; }
    .guide-step span { font-size: 0.72rem; color: var(--dim); line-height: 1.35; }

    .grid-stats {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 10px; margin-bottom: 16px;
    }
    .stat {
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--r); padding: 14px 12px;
    }
    .stat b {
      display: block; font-family: "Space Grotesk", sans-serif;
      font-size: 1.35rem; font-weight: 700;
    }
    .stat span { font-size: 0.68rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }

    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 16px; padding: 16px 14px; margin-bottom: 14px;
    }
    .card h2 {
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: 1rem; color: var(--primary); margin-bottom: 6px;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .help { font-size: 0.82rem; color: var(--dim); margin: 0 0 12px; line-height: 1.5; max-width: 720px; }

    .field-group {
      border: 1px solid var(--border); border-radius: 12px;
      padding: 12px 12px 4px; margin-bottom: 10px;
      background: rgba(0,0,0,0.16);
    }
    .field-group legend {
      padding: 0 8px; font-size: 0.7rem; font-weight: 700;
      letter-spacing: 0.06em; text-transform: uppercase; color: var(--primary);
    }
    .field-group .sub {
      font-size: 0.74rem; color: var(--dim); margin: -2px 0 10px; line-height: 1.4;
    }
    label { display: block; font-size: 0.74rem; color: var(--dim); margin-bottom: 5px; font-weight: 600; }
    label .opt { font-weight: 500; color: #64748b; }
    label .req { color: #fca5a5; font-weight: 700; }
    .hint { font-size: 0.7rem; color: #64748b; margin: -6px 0 10px; line-height: 1.35; }
    input, select, textarea {
      width: 100%; padding: 10px 12px; border-radius: 10px;
      border: 1px solid var(--border); background: var(--input); color: var(--text);
      font: inherit; font-size: 0.86rem; margin-bottom: 12px;
    }
    input:focus, select:focus, textarea:focus {
      outline: none; border-color: rgba(20,184,166,0.45);
    }
    input::placeholder, textarea::placeholder { color: #5b6578; }
    textarea { min-height: 72px; resize: vertical; }
    .form-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 2px 12px; align-items: start;
    }
    .form-grid .full { grid-column: 1 / -1; }
    .btn {
      appearance: none; border: 1px solid var(--border);
      background: var(--input); color: var(--text);
      font: inherit; font-size: 0.82rem; font-weight: 700;
      padding: 10px 14px; border-radius: 10px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 7px; justify-content: center;
      text-decoration: none;
    }
    .btn-primary { background: #0f766e; border-color: rgba(45,212,191,0.3); color: #ecfdf5; }
    .btn-secondary { background: rgba(56,189,248,0.12); border-color: rgba(56,189,248,0.35); color: #7dd3fc; }
    .btn-danger { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.35); color: #fca5a5; }
    .btn-ghost { background: transparent; color: var(--dim); }
    .btn-sm { padding: 6px 10px; font-size: 0.74rem; }
    .btn-block { width: 100%; }

    .chip {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 0.68rem; font-weight: 700; padding: 4px 9px;
      border-radius: 999px; border: 1px solid var(--border); color: var(--dim);
      background: rgba(0,0,0,0.2);
    }
    .chip.ok { color: var(--ok); border-color: rgba(74,222,128,0.35); background: rgba(74,222,128,0.08); }
    .chip.warn { color: var(--warn); border-color: rgba(251,191,36,0.35); background: rgba(251,191,36,0.08); }
    .chip.bad { color: #fca5a5; border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.08); }
    .chip.teal { color: var(--primary); border-color: rgba(20,184,166,0.35); background: var(--primary-dim); }
    .chip.blue { color: #7dd3fc; border-color: rgba(56,189,248,0.35); background: rgba(56,189,248,0.1); }
    .chip.muted { color: #64748b; }
    .pills { display: flex; flex-wrap: wrap; gap: 6px; }

    .list { display: grid; gap: 10px; }
    .toolbar {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      margin-bottom: 12px;
    }
    .toolbar .search {
      flex: 1; min-width: 180px; margin: 0;
    }

    /* Tarjeta de cuenta colapsable (cerrada por defecto) */
    details.acc-card {
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(0,0,0,0.22);
      overflow: hidden;
    }
    details.acc-card[open] { border-color: rgba(20,184,166,0.28); }
    details.acc-card > summary.acc-sum {
      list-style: none;
      cursor: pointer;
      display: flex; flex-wrap: wrap; gap: 10px 14px;
      justify-content: space-between; align-items: center;
      padding: 13px 14px;
      background: rgba(15, 20, 28, 0.75);
      user-select: none;
    }
    details.acc-card > summary.acc-sum::-webkit-details-marker { display: none; }
    .acc-sum-left { flex: 1; min-width: 200px; }
    .acc-title {
      font-family: "Space Grotesk", Inter, sans-serif;
      font-size: 1.02rem; font-weight: 700;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .acc-chevron {
      width: 28px; height: 28px; border-radius: 8px;
      display: inline-grid; place-items: center;
      background: var(--primary-dim); color: var(--primary);
      font-size: 0.75rem; flex-shrink: 0;
      transition: transform 0.18s ease;
    }
    details.acc-card[open] .acc-chevron { transform: rotate(90deg); }
    .acc-open-hint {
      font-size: 0.72rem; font-weight: 700; color: var(--secondary);
      white-space: nowrap;
    }
    .acc-body { padding: 0 14px 14px; border-top: 1px solid var(--border); }
    .acc-section-title {
      font-size: 0.72rem; font-weight: 700; color: var(--dim);
      text-transform: uppercase; letter-spacing: 0.05em;
      margin: 14px 0 8px;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }

    .cred-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px; margin: 10px 0;
    }
    .cred-item {
      background: rgba(0,0,0,0.25); border: 1px solid var(--border);
      border-radius: 10px; padding: 9px 11px;
    }
    .cred-k {
      display: block; font-size: 0.66rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin-bottom: 4px;
    }
    .cred-v {
      font-size: 0.84rem; color: #e2e8f0; word-break: break-all;
      display: flex; align-items: center; gap: 6px; min-height: 1.4em;
    }
    .muted-dash { color: #475569; }

    .secret-tog {
      appearance: none; border: 0; background: transparent; color: inherit;
      font: inherit; font-size: 0.84rem; font-weight: 600;
      cursor: pointer; display: inline-flex; align-items: center; gap: 7px;
      padding: 2px 6px; margin: -2px -4px; border-radius: 6px;
    }
    .secret-tog:hover { background: rgba(255,255,255,0.05); }
    .secret-tog i { color: var(--secondary); font-size: 0.78rem; }
    .secret-mask { letter-spacing: 0.12em; color: #94a3b8; }
    .secret-val { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #fde68a; }

    .profile-row {
      border: 1px solid var(--border); border-radius: 12px;
      background: rgba(10, 14, 20, 0.55); margin-bottom: 8px;
      overflow: hidden;
    }
    .profile-row:last-child { margin-bottom: 0; }
    details.profile-row > summary.prof-sum {
      list-style: none; cursor: pointer;
      display: flex; flex-wrap: wrap; gap: 8px 12px;
      justify-content: space-between; align-items: center;
      padding: 11px 12px;
      user-select: none;
    }
    details.profile-row > summary.prof-sum::-webkit-details-marker { display: none; }
    .prof-name { font-weight: 700; font-size: 0.92rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .prof-mini { font-size: 0.74rem; color: var(--dim); }
    .prof-body { padding: 0 12px 12px; border-top: 1px solid var(--border); }

    .assign-box {
      margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border);
    }
    .assign-current {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      padding: 10px 12px; border-radius: 10px;
      background: rgba(20,184,166,0.08); border: 1px solid rgba(20,184,166,0.25);
      font-size: 0.82rem; margin-bottom: 8px;
    }
    .assign-current strong { color: var(--text); }

    .empty-profiles {
      text-align: center; padding: 18px 12px; color: var(--dim); font-size: 0.86rem;
      border: 1px dashed var(--border); border-radius: 12px; background: rgba(0,0,0,0.15);
    }
    .empty-profiles i { display: block; font-size: 1.3rem; margin-bottom: 8px; opacity: 0.5; color: var(--primary); }

    details.soft {
      border: 1px solid var(--border); border-radius: 12px;
      background: rgba(0,0,0,0.15); margin-top: 10px;
    }
    details.soft > summary {
      list-style: none; cursor: pointer;
      padding: 10px 12px; font-size: 0.82rem; font-weight: 700;
      color: var(--secondary); display: flex; align-items: center; gap: 8px;
      user-select: none;
    }
    details.soft > summary::-webkit-details-marker { display: none; }
    details.soft[open] > summary { border-bottom: 1px solid var(--border); margin-bottom: 0; }
    details.soft .soft-body { padding: 12px; }

    .empty {
      text-align: center; color: var(--dim); padding: 28px 14px; font-size: 0.9rem; line-height: 1.5;
    }
    .empty a { color: var(--primary); font-weight: 600; }
    .item {
      border: 1px solid var(--border); border-radius: 12px;
      background: rgba(0,0,0,0.18); padding: 12px 14px;
    }
    .item-head {
      display: flex; flex-wrap: wrap; gap: 8px 12px;
      justify-content: space-between; align-items: flex-start; margin-bottom: 6px;
    }
    .meta { font-size: 0.78rem; color: var(--dim); line-height: 1.5; }
    .meta b { color: #cbd5e1; font-weight: 600; }
    .row-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .hint-vars {
      font-size: 0.72rem; color: var(--dim); margin: 4px 0 10px; line-height: 1.5;
    }
    .hint-vars code {
      background: rgba(20,184,166,0.1); color: #5eead4;
      padding: 1px 5px; border-radius: 4px; font-size: 0.7rem;
    }
    .remind-compose {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      align-items: start;
    }
    @media (max-width: 800px) {
      .remind-compose { grid-template-columns: 1fr; }
    }
    .wa-preview {
      border: 1px solid var(--border);
      background: #0a0c0e;
      min-height: 220px;
    }
    .wa-preview-head {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--dim);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .wa-preview-head i { color: var(--primary); }
    .wa-preview-chat {
      padding: 14px 12px 18px;
      min-height: 160px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.02), transparent 40%),
        #0a0c0e;
    }
    .wa-preview-note {
      font-size: 0.72rem;
      color: var(--dim);
      margin-top: 8px;
      line-height: 1.45;
    }
    .wa-row {
      display: flex;
      justify-content: flex-end;
    }
    .wa-bubble {
      max-width: 92%;
      background: #1f2c34;
      border: 1px solid #2a3942;
      padding: 8px 10px 6px;
      color: #e9edef;
      font-size: 13px;
      line-height: 1.45;
      word-break: break-word;
    }
    .wa-bubble strong { font-weight: 600; }
    .wa-bubble em { font-style: italic; opacity: 0.95; }
    .wa-meta {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      margin-top: 4px;
      font-size: 10px;
      color: #8696a0;
    }
    .wa-typing {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      padding: 8px 12px;
      background: #1f2c34;
      border: 1px solid #2a3942;
    }
    .wa-typing span {
      width: 6px; height: 6px; border-radius: 50%;
      background: #8696a0;
      animation: waDot 1.2s infinite ease-in-out;
    }
    .wa-typing span:nth-child(2) { animation-delay: 0.15s; }
    .wa-typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes waDot {
      0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-2px); }
    }
    .callout {
      border-left: 3px solid var(--primary);
      background: var(--primary-dim);
      padding: 10px 12px; border-radius: 0 10px 10px 0;
      font-size: 0.8rem; color: #a7f3d0; margin-bottom: 12px; line-height: 1.45;
    }
    .acc-card.is-hidden { display: none; }
    @media (max-width: 640px) {
      .form-grid { grid-template-columns: 1fr; }
      .acc-open-hint { width: 100%; }
    }
  </style>
</head>
<body>
  ${loaderBlock}
  <div class="wrap">
    <div class="top">
      <a class="nav-btn" href="${esc(homeLink)}"><i class="fas fa-arrow-left"></i> Panel</a>
      <div class="head" style="flex:1; min-width:220px;">
        <h1><i class="fas fa-briefcase"></i> Gestor General ${version ? `<span class="chip teal">${esc(version)}</span>` : ''}</h1>
        <p>Cuentas, perfiles y clientes en un solo lugar. Vinculá un perfil a un cliente y avisale antes del vencimiento.</p>
      </div>
    </div>
    ${toast ? `<div class="toast${/error|fall|invalid|faltan|encontr|fecha/i.test(toast) ? ' err' : ''}">${esc(toast)}</div>` : ''}
    <nav class="tabs">${tabNav}</nav>
    ${body}
  </div>
  <script>
    (function () {
      document.addEventListener('click', function (e) {
        var btn = e.target.closest('.secret-tog');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        var mask = btn.querySelector('.secret-mask');
        var val = btn.querySelector('.secret-val');
        var icon = btn.querySelector('i');
        if (!mask || !val) return;
        var show = val.hasAttribute('hidden');
        if (show) {
          val.removeAttribute('hidden');
          mask.setAttribute('hidden', '');
          if (icon) icon.className = 'fas fa-eye-slash';
        } else {
          val.setAttribute('hidden', '');
          mask.removeAttribute('hidden');
          if (icon) icon.className = 'fas fa-eye';
        }
      });

      var q = document.getElementById('acc-search');
      if (q) {
        q.addEventListener('input', function () {
          var term = (q.value || '').toLowerCase().trim();
          document.querySelectorAll('.acc-card[data-search]').forEach(function (el) {
            var hay = (el.getAttribute('data-search') || '');
            el.classList.toggle('is-hidden', term && hay.indexOf(term) === -1);
          });
        });
      }

      var openAll = document.getElementById('acc-open-all');
      var closeAll = document.getElementById('acc-close-all');
      if (openAll) openAll.addEventListener('click', function () {
        document.querySelectorAll('details.acc-card:not(.is-hidden)').forEach(function (d) { d.open = true; });
      });
      if (closeAll) closeAll.addEventListener('click', function () {
        document.querySelectorAll('details.acc-card').forEach(function (d) { d.open = false; });
      });

      var sample = ${JSON.stringify(getReminderPreviewSample())};

      function escHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }
      function fillRemindTpl(tpl, ctx) {
        var correo = String(ctx.correo || ctx.email || '');
        var usuario = String(ctx.usuario || ctx.user || '');
        var pass = String(ctx.pass || ctx.contraseña || ctx.contrasena || ctx.clave || '');
        var wa = String(ctx.whatsapp || ctx.wa || '');
        var map = {
          nombre: ctx.nombre || '',
          whatsapp: wa, wa: wa, telefono: wa, tel: wa,
          perfil: ctx.perfil || '',
          cuenta: ctx.cuenta || '',
          inicio: ctx.inicio || '',
          vence: ctx.vence || '',
          plan: ctx.plan || '',
          pin: ctx.pin || '',
          correo: correo, email: correo,
          usuario: usuario, user: usuario,
          pass: pass, contraseña: pass, contrasena: pass, clave: pass, password: pass,
          correo_cuenta: ctx.correo_cuenta || ctx.motherEmail || '',
          usuario_cuenta: ctx.usuario_cuenta || ctx.motherUser || '',
          id: ctx.id || ctx.id_perfil || ctx.extraId || '',
          id_perfil: ctx.id_perfil || ctx.extraId || ''
        };
        var s = String(tpl || '');
        Object.keys(map).sort(function(a,b){ return b.length - a.length; }).forEach(function(k) {
          var v = map[k] || '';
          s = s.replace(new RegExp('{{\\s*' + k + '\\s*}}', 'gi'), v);
          s = s.replace(new RegExp('(?<!\\\\{)\\\\{\\\\s*' + k + '\\\\s*\\\\}(?!\\\\})', 'gi'), v);
        });
        return s.trim();
      }
      function waFormat(text) {
        var s = escHtml(text);
        s = s.replace(/\\*([^*\\n]+)\\*/g, '<strong>$1</strong>');
        s = s.replace(/_([^_\\n]+)_/g, '<em>$1</em>');
        return s.replace(/\\n/g, '<br>');
      }
      function bindRemindPreview(taId, bubbleId, typingId) {
        var ta = document.getElementById(taId);
        var bubble = document.getElementById(bubbleId);
        var typing = typingId ? document.getElementById(typingId) : null;
        if (!ta || !bubble) return;
        var timer = null;
        function render() {
          clearTimeout(timer);
          if (typing) typing.style.display = 'inline-flex';
          bubble.style.display = 'none';
          timer = setTimeout(function() {
            if (typing) typing.style.display = 'none';
            var filled = fillRemindTpl(ta.value, sample);
            bubble.innerHTML = waFormat(filled || '(mensaje vacío)');
            bubble.style.display = 'block';
          }, 450);
        }
        ta.addEventListener('input', render);
        render();
      }
      bindRemindPreview('defaultRemindMsg', 'remindPreviewBubble', 'remindPreviewTyping');
      bindRemindPreview('rentalRemindMsg', 'rentalPreviewBubble', 'rentalPreviewTyping');
    })();
  </script>
</body>
</html>`
}

function renderReminderComposeBlock(opts = {}) {
  const {
    textareaName,
    textareaId,
    textareaValue = '',
    bubbleId,
    typingId,
    placeholder = '',
    showPreview = true,
  } = opts
  const previewHtml = showPreview
    ? `<div class="wa-preview">
        <div class="wa-preview-head"><i class="fab fa-whatsapp"></i> Vista previa (simulación)</div>
        <div class="wa-preview-chat">
          <div class="wa-row">
            <div class="wa-typing" id="${esc(typingId)}" style="display:none"><span></span><span></span><span></span></div>
            <div class="wa-bubble" id="${esc(bubbleId)}" style="display:none"></div>
          </div>
        </div>
        <p class="wa-preview-note">Ejemplo con datos ficticios: María · correo <code>maria@correo.com</code> · usuario <code>maria_login</code></p>
      </div>`
    : ''

  return `
    <div class="remind-compose">
      <div>
        <p class="hint-vars">Variables: ${reminderVarsHintHtml()}</p>
        <textarea
          name="${esc(textareaName)}"
          id="${esc(textareaId)}"
          class="remind-msg-input"
          placeholder="${esc(placeholder)}"
          rows="7"
        >${esc(textareaValue)}</textarea>
      </div>
      ${previewHtml}
    </div>`
}

function renderSummary({ mothers, clients, activeRentals, expiringSoon, freeCount, rentedCount, totalProfiles, cfg }) {
  let soonHtml = ''
  if (expiringSoon.length === 0) {
    soonHtml = `<p class="empty" style="padding:18px;">No hay vencimientos en los próximos 3 días.</p>`
  } else {
    soonHtml = `<div class="list">${expiringSoon
      .map((r) => {
        const c = getClient(cfg, r.clientId)
        const m = getMother(cfg, r.motherId)
        const p = getProfile(m, r.profileId)
        const d = daysUntilExpiry(r)
        return `<div class="item">
          <div class="item-head">
            <strong>${esc(c?.name || 'Cliente')}</strong>
            <span class="chip warn">${d === 0 ? 'Vence hoy' : `En ${d} día${d === 1 ? '' : 's'}`}</span>
          </div>
          <div class="meta">
            <b>WhatsApp:</b> ${esc(c?.whatsapp || '—')}<br>
            <b>Perfil:</b> ${esc(p?.name || '—')} · <b>Cuenta:</b> ${esc(m?.name || '—')}<br>
            <b>Vence:</b> ${esc(formatDateDisplay(r.expiresAt))}
          </div>
        </div>`
      })
      .join('')}</div>`
  }

  return `
    <div class="guide">
      <div class="guide-step"><div class="n">1</div><strong>Cuenta</strong><span>Creá la cuenta madre (Netflix, sede…).</span></div>
      <div class="guide-step"><div class="n">2</div><strong>Perfiles</strong><span>Agregá cupos dentro de esa cuenta.</span></div>
      <div class="guide-step"><div class="n">3</div><strong>Cliente</strong><span>Nombre + WhatsApp de quien alquila.</span></div>
      <div class="guide-step"><div class="n">4</div><strong>Vincular</strong><span>Abrí la cuenta → perfil → elegí cliente.</span></div>
    </div>

    <div class="grid-stats">
      <div class="stat"><b>${mothers.length}</b><span>Cuentas</span></div>
      <div class="stat"><b>${totalProfiles}</b><span>Perfiles</span></div>
      <div class="stat"><b>${freeCount}</b><span>Libres</span></div>
      <div class="stat"><b>${rentedCount}</b><span>Alquilados</span></div>
      <div class="stat"><b>${clients.length}</b><span>Clientes</span></div>
      <div class="stat"><b>${activeRentals.length}</b><span>Activos</span></div>
    </div>

    <div class="card">
      <h2><i class="fas fa-bell"></i> Vencimientos cercanos</h2>
      <p class="help">Acá ves quién se le está por vencer el alquiler. Si los avisos están activados, ese cliente recibe un WhatsApp el día del recordatorio.</p>
      ${soonHtml}
    </div>`
}

function motherFormFields(m = null) {
  const catOpts = CATEGORIES.map(
    (c) =>
      `<option value="${c.id}" ${m && m.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`
  ).join('')
  return `
    <fieldset class="field-group">
      <legend>Datos principales</legend>
      <div class="form-grid">
        <div class="full">
          <label>Nombre <span class="req">*</span></label>
          <input name="name" required value="${esc(m?.name || '')}" placeholder="Ej: Netflix Casa">
        </div>
        <div>
          <label>Tipo de servicio</label>
          <select name="category">${catOpts}</select>
        </div>
      </div>
    </fieldset>
    <fieldset class="field-group">
      <legend>Credenciales de la cuenta</legend>
      <p class="sub">Usuario y contraseña de la cuenta principal. Se guardan y se pueden ver (censuradas por defecto).</p>
      <div class="form-grid">
        <div>
          <label>Usuario madre</label>
          <input name="motherUser" value="${esc(m?.motherUser || '')}" placeholder="cuenta@mail.com">
        </div>
        <div>
          <label>Contraseña madre</label>
          <input name="motherPass" value="${esc(m?.motherPass || '')}" placeholder="••••••" autocomplete="off">
        </div>
        <div>
          <label>Correo</label>
          <input name="motherEmail" type="email" value="${esc(m?.motherEmail || '')}" placeholder="contacto@mail.com">
        </div>
        <div>
          <label>ID / referencia</label>
          <input name="motherId" value="${esc(m?.motherId || '')}" placeholder="código interno">
        </div>
        <div class="full">
          <label>Notas</label>
          <textarea name="notes" placeholder="Notas internas…">${esc(m?.notes || '')}</textarea>
        </div>
      </div>
    </fieldset>`
}

function profileFormFields(p = null) {
  return `
    <div class="form-grid">
      <div class="full">
        <label>Nombre del perfil <span class="req">*</span></label>
        <input name="name" required value="${esc(p?.name || '')}" placeholder="Ej: Perfil 1">
      </div>
      <div>
        <label>Usuario</label>
        <input name="user" value="${esc(p?.user || '')}" placeholder="login del perfil">
        <p class="meta" style="margin-top:4px;">Variable: <code>{{usuario}}</code></p>
      </div>
      <div>
        <label>Contraseña</label>
        <input name="pass" value="${esc(p?.pass || '')}" placeholder="••••••" autocomplete="off">
      </div>
      <div>
        <label>PIN</label>
        <input name="pin" value="${esc(p?.pin || '')}" placeholder="1234">
      </div>
      <div>
        <label>Correo</label>
        <input name="email" type="email" value="${esc(p?.email || '')}" placeholder="perfil@mail.com">
        <p class="meta" style="margin-top:4px;">Variable: <code>{{correo}}</code></p>
      </div>
      <div>
        <label>ID / ref.</label>
        <input name="extraId" value="${esc(p?.extraId || '')}" placeholder="código">
      </div>
      <div class="full">
        <label>Notas</label>
        <input name="notes" value="${esc(p?.notes || '')}" placeholder="opcional">
      </div>
    </div>`
}

function renderMothers(cfg, mothers, clients) {
  const clientOpts =
    clients.length === 0
      ? ''
      : clients
          .map(
            (c) =>
              `<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.whatsapp || 'sin WA')}</option>`
          )
          .join('')

  const list =
    mothers.length === 0
      ? `<div class="empty">
          <i class="fas fa-server" style="display:block;font-size:1.5rem;margin-bottom:10px;opacity:0.4;color:var(--primary);"></i>
          Todavía no hay cuentas.<br>
          Expandí “Nueva cuenta madre” y creá la primera (solo el nombre es obligatorio).
        </div>`
      : mothers
          .map((m) => {
            const profiles = m.profiles || []
            const total = profiles.length
            let rented = 0
            let free = 0
            for (const p of profiles) {
              if (activeRentalForProfile(cfg, p.id)) rented++
              else free++
            }

            const searchBlob = [
              m.name,
              m.category,
              catLabel(m.category),
              m.motherUser,
              m.motherEmail,
              m.motherId,
              m.notes,
              ...profiles.flatMap((p) => [p.name, p.user, p.email, p.extraId]),
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()

            const profilesHtml =
              total === 0
                ? `<div class="empty-profiles">
                    <i class="fas fa-user-slash"></i>
                    Esta cuenta <b>no tiene perfiles</b>.<br>
                    Usá “Agregar perfil” abajo.
                  </div>`
                : profiles
                    .map((p) => {
                      const rental = activeRentalForProfile(cfg, p.id)
                      const client = rental ? getClient(cfg, rental.clientId) : null
                      const assigned = !!rental && !!client
                      const miniBits = []
                      if (p.user) miniBits.push(p.user)
                      else if (p.email) miniBits.push(p.email)
                      if (assigned) miniBits.push(`→ ${client.name}`)

                      return `
                      <details class="profile-row">
                        <summary class="prof-sum">
                          <div>
                            <div class="prof-name">
                              <i class="fas fa-chevron-right" style="font-size:0.65rem;color:var(--dim);width:10px;"></i>
                              ${esc(p.name)}
                              <span class="chip ${assigned ? 'warn' : 'ok'}">${assigned ? 'Alquilado' : 'Libre'}</span>
                            </div>
                            ${miniBits.length ? `<div class="prof-mini">${esc(miniBits.join(' · '))}</div>` : ''}
                          </div>
                          <span class="chip muted" style="pointer-events:none;">Abrir</span>
                        </summary>
                        <div class="prof-body">
                          ${credLine([
                            { label: 'Usuario', value: p.user },
                            { label: 'Contraseña', value: p.pass, secret: true },
                            { label: 'PIN', value: p.pin, secret: true },
                            { label: 'Correo', value: p.email },
                            { label: 'ID / ref.', value: p.extraId },
                          ]) || '<p class="meta" style="margin:8px 0;">Sin credenciales cargadas. Editá el perfil para agregarlas.</p>'}
                          ${p.notes ? `<p class="meta" style="margin:6px 0 0;"><b>Notas:</b> ${esc(p.notes)}</p>` : ''}

                          <div class="row-actions" style="margin-top:10px;">
                            <details class="soft" style="flex:1;margin:0;">
                              <summary><i class="fas fa-pen"></i> Editar este perfil</summary>
                              <div class="soft-body">
                                <form action="/gestor-general/save-profile" method="post">
                                  <input type="hidden" name="motherId" value="${esc(m.id)}">
                                  <input type="hidden" name="profileId" value="${esc(p.id)}">
                                  ${profileFormFields(p)}
                                  <button class="btn btn-primary btn-sm" type="submit"><i class="fas fa-save"></i> Guardar cambios</button>
                                </form>
                              </div>
                            </details>
                            <form action="/gestor-general/delete-profile" method="post" onsubmit="return confirm('¿Borrar este perfil?')">
                              <input type="hidden" name="motherId" value="${esc(m.id)}">
                              <input type="hidden" name="profileId" value="${esc(p.id)}">
                              <button class="btn btn-danger btn-sm" type="submit"><i class="fas fa-trash"></i></button>
                            </form>
                          </div>

                          <div class="assign-box">
                            ${
                              assigned
                                ? `<div class="assign-current">
                                    <span class="chip teal"><i class="fas fa-link"></i> Vinculado</span>
                                    <strong>${esc(client.name)}</strong>
                                    <span class="meta">WA ${esc(client.whatsapp || '—')} · vence ${esc(formatDateDisplay(rental.expiresAt))}</span>
                                    <form action="/gestor-general/unassign-profile" method="post" style="margin-left:auto;" onsubmit="return confirm('¿Liberar este perfil?')">
                                      <input type="hidden" name="rentalId" value="${esc(rental.id)}">
                                      <button class="btn btn-ghost btn-sm" type="submit"><i class="fas fa-unlink"></i> Liberar</button>
                                    </form>
                                  </div>`
                                : `<div class="meta" style="margin-bottom:8px;"><i class="fas fa-user-check" style="color:var(--primary);"></i> <b>Vincular a un cliente</b></div>`
                            }
                            ${
                              clients.length === 0
                                ? `<p class="meta">Primero cargá un cliente en <a href="/gestor-general?tab=clientes" style="color:var(--primary);">Clientes</a>.</p>`
                                : assigned
                                  ? ''
                                  : `<form action="/gestor-general/assign-profile" method="post" class="form-grid">
                                      <input type="hidden" name="motherId" value="${esc(m.id)}">
                                      <input type="hidden" name="profileId" value="${esc(p.id)}">
                                      <div class="full">
                                        <label>Cliente</label>
                                        <select name="clientId" required>
                                          <option value="">— Elegí el cliente —</option>
                                          ${clientOpts}
                                        </select>
                                      </div>
                                      <div>
                                        <label>Inicio</label>
                                        <input type="date" name="startAt" required value="${esc(toDateInputValue(Date.now()))}">
                                      </div>
                                      <div>
                                        <label>Vence</label>
                                        <input type="date" name="expiresAt" required>
                                      </div>
                                      <div>
                                        <label>Aviso (días antes)</label>
                                        <input type="number" name="remindDaysBefore" min="0" max="30" value="${cfg.defaultRemindDays ?? 1}">
                                      </div>
                                      <div>
                                        <label>Hora del aviso</label>
                                        <input type="time" name="remindTime" value="${esc(cfg.defaultRemindTime || '10:00')}">
                                      </div>
                                      <div class="full">
                                        <button class="btn btn-primary btn-block" type="submit"><i class="fas fa-link"></i> Vincular perfil al cliente</button>
                                      </div>
                                    </form>`
                            }
                          </div>
                        </div>
                      </details>`
                    })
                    .join('')

            return `
            <details class="acc-card" data-search="${esc(searchBlob)}">
              <summary class="acc-sum">
                <div class="acc-sum-left">
                  <div class="acc-title">
                    <span class="acc-chevron"><i class="fas fa-chevron-right"></i></span>
                    ${esc(m.name)}
                  </div>
                  <div class="pills" style="margin-top:8px;">
                    <span class="chip teal">${esc(catLabel(m.category))}</span>
                    <span class="chip blue"><i class="fas fa-layer-group"></i> ${total} perfil${total === 1 ? '' : 'es'}</span>
                    ${total === 0 ? `<span class="chip muted">Sin perfiles</span>` : ''}
                    ${total > 0 ? `<span class="chip ok">${free} libre${free === 1 ? '' : 's'}</span>` : ''}
                    ${rented > 0 ? `<span class="chip warn">${rented} alquilado${rented === 1 ? '' : 's'}</span>` : ''}
                  </div>
                </div>
                <span class="acc-open-hint"><i class="fas fa-folder-open"></i> Abrir cuenta</span>
              </summary>
              <div class="acc-body">
                <div class="acc-section-title">
                  <span>Credenciales de la cuenta</span>
                </div>
                ${
                  credLine([
                    { label: 'Usuario', value: m.motherUser },
                    { label: 'Contraseña', value: m.motherPass, secret: true },
                    { label: 'Correo', value: m.motherEmail },
                    { label: 'ID / ref.', value: m.motherId },
                  ]) || '<p class="meta">Sin credenciales guardadas. Usá “Editar cuenta” para cargarlas.</p>'
                }
                ${m.notes ? `<p class="meta" style="margin-top:6px;"><b>Notas:</b> ${esc(m.notes)}</p>` : ''}

                <div class="row-actions" style="margin-top:10px;">
                  <details class="soft" style="flex:1;margin:0;">
                    <summary><i class="fas fa-pen"></i> Editar cuenta</summary>
                    <div class="soft-body">
                      <form action="/gestor-general/save-mother" method="post">
                        <input type="hidden" name="id" value="${esc(m.id)}">
                        ${motherFormFields(m)}
                        <button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Guardar cambios</button>
                      </form>
                    </div>
                  </details>
                  <form action="/gestor-general/delete-mother" method="post" onsubmit="return confirm('¿Eliminar esta cuenta y todos sus perfiles?')">
                    <input type="hidden" name="id" value="${esc(m.id)}">
                    <button class="btn btn-danger btn-sm" type="submit"><i class="fas fa-trash"></i> Eliminar</button>
                  </form>
                </div>

                <div class="acc-section-title">
                  <span>Perfiles (${total})</span>
                </div>
                ${profilesHtml}

                <details class="soft">
                  <summary><i class="fas fa-plus-circle"></i> Agregar perfil</summary>
                  <div class="soft-body">
                    <div class="callout">Un perfil es un cupo que alquilás. Después lo vinculás a un cliente.</div>
                    <form action="/gestor-general/save-profile" method="post">
                      <input type="hidden" name="motherId" value="${esc(m.id)}">
                      ${profileFormFields()}
                      <button class="btn btn-primary" type="submit"><i class="fas fa-plus"></i> Guardar perfil</button>
                    </form>
                  </div>
                </details>
              </div>
            </details>`
          })
          .join('')

  return `
    <div class="guide">
      <div class="guide-step"><div class="n">1</div><strong>Cuenta</strong><span>Creá la madre (nombre obligatorio).</span></div>
      <div class="guide-step"><div class="n">2</div><strong>Abrir</strong><span>Tocá la tarjeta para ver perfiles.</span></div>
      <div class="guide-step"><div class="n">3</div><strong>Perfiles</strong><span>Agregá o editá cupos y contraseñas.</span></div>
      <div class="guide-step"><div class="n">4</div><strong>Vincular</strong><span>Asigná cada perfil libre a un cliente.</span></div>
    </div>

    <details class="soft card" style="padding:0;border-radius:16px;background:var(--card);">
      <summary style="padding:14px 16px;color:var(--primary);font-size:0.95rem;">
        <i class="fas fa-plus-circle"></i> Nueva cuenta madre
      </summary>
      <div class="soft-body" style="padding:0 16px 16px;">
        <p class="help">Solo el nombre es obligatorio. Las contraseñas se guardan y se muestran censuradas hasta que las toques.</p>
        <form action="/gestor-general/save-mother" method="post">
          ${motherFormFields()}
          <button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Crear cuenta madre</button>
        </form>
      </div>
    </details>

    <div class="card">
      <h2>
        <i class="fas fa-layer-group"></i> Tus cuentas
        <span class="chip teal">${mothers.length}</span>
      </h2>
      <p class="help">Las tarjetas están <b>cerradas por defecto</b>. Abrí solo la cuenta que necesitás — no hace falta scrollear todo.</p>
      ${
        mothers.length
          ? `<div class="toolbar">
              <input class="search" id="acc-search" type="search" placeholder="Buscar cuenta, perfil, mail…" autocomplete="off">
              <button type="button" class="btn btn-sm btn-secondary" id="acc-open-all"><i class="fas fa-expand"></i> Abrir todas</button>
              <button type="button" class="btn btn-sm btn-ghost" id="acc-close-all"><i class="fas fa-compress"></i> Cerrar todas</button>
            </div>`
          : ''
      }
      <div class="list">${list}</div>
    </div>`
}

function clientFormFields(c = null) {
  return `
    <div class="form-grid">
      <div>
        <label>Nombre <span class="req">*</span></label>
        <input name="name" required value="${esc(c?.name || '')}" placeholder="Ej: Juan Pérez">
      </div>
      <div>
        <label>WhatsApp <span class="req">*</span></label>
        <input name="whatsapp" required value="${esc(c?.whatsapp || '')}" placeholder="51987654321" inputmode="tel">
        <p class="hint">Código de país, sin + ni espacios. Si te equivocaste del número, cambialo acá.</p>
      </div>
      <div>
        <label>Correo <span class="opt">(opcional)</span></label>
        <input name="email" type="email" value="${esc(c?.email || '')}" placeholder="cliente@mail.com">
      </div>
      <div class="full">
        <label>Notas <span class="opt">(opcional)</span></label>
        <input name="notes" value="${esc(c?.notes || '')}" placeholder="Cómo pagó, preferencias…">
      </div>
    </div>`
}

function renderClients(clients, cfg) {
  const rentalsByClient = {}
  for (const r of cfg.rentals || []) {
    if (!isRentalActive(r)) continue
    rentalsByClient[r.clientId] = (rentalsByClient[r.clientId] || 0) + 1
  }

  const list =
    clients.length === 0
      ? `<div class="empty">Sin clientes. Cargá el primero (nombre + WhatsApp con código de país).</div>`
      : clients
          .map((c) => {
            const n = rentalsByClient[c.id] || 0
            return `
            <div class="item">
              <div class="item-head">
                <div>
                  <strong style="font-size:0.98rem;">${esc(c.name)}</strong>
                  <div class="pills" style="margin-top:6px;">
                    <span class="chip teal"><i class="fab fa-whatsapp"></i> ${esc(c.whatsapp || '—')}</span>
                    <span class="chip ${n ? 'warn' : 'muted'}">${n} perfil${n === 1 ? '' : 'es'} activo${n === 1 ? '' : 's'}</span>
                  </div>
                  ${c.email ? `<div class="meta" style="margin-top:6px;"><b>Mail:</b> ${esc(c.email)}</div>` : ''}
                  ${c.notes ? `<div class="meta">${esc(c.notes)}</div>` : ''}
                </div>
                <div class="row-actions">
                  <form action="/gestor-general/delete-client" method="post" onsubmit="return confirm('¿Eliminar este cliente? Se liberan sus perfiles vinculados.')">
                    <input type="hidden" name="id" value="${esc(c.id)}">
                    <button class="btn btn-danger btn-sm" type="submit" title="Eliminar"><i class="fas fa-trash"></i></button>
                  </form>
                </div>
              </div>
              ${
                n === 0
                  ? `<div class="meta">Sin perfiles. Andá a <a href="/gestor-general?tab=madres" style="color:var(--primary);">Cuentas y perfiles</a>.</div>`
                  : `<div class="meta">Ver vínculos en <a href="/gestor-general?tab=alquileres" style="color:var(--primary);">Alquileres</a>.</div>`
              }
              <details class="soft" style="margin-top:10px;">
                <summary><i class="fas fa-pen"></i> Editar datos del cliente</summary>
                <div class="soft-body">
                  <form action="/gestor-general/save-client" method="post">
                    <input type="hidden" name="id" value="${esc(c.id)}">
                    ${clientFormFields(c)}
                    <button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Guardar cambios</button>
                  </form>
                </div>
              </details>
            </div>`
          })
          .join('')

  return `
    <div class="card">
      <h2><i class="fas fa-user-plus"></i> Nuevo cliente</h2>
      <p class="help">Guardá nombre y WhatsApp. Si después te equivocás en el número, lo podés corregir en “Editar datos del cliente”.</p>
      <form action="/gestor-general/save-client" method="post">
        ${clientFormFields()}
        <button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Guardar cliente</button>
      </form>
    </div>
    <div class="card">
      <h2><i class="fas fa-users"></i> Clientes <span class="chip teal">${clients.length}</span></h2>
      <div class="list">${list}</div>
    </div>`
}

function renderRentals(cfg, rentals, clients, mothers) {
  const list =
    rentals.length === 0
      ? `<div class="empty">
          No hay alquileres.<br>
          Abrí una cuenta → perfil <b>Libre</b> → vincular cliente.
        </div>`
      : [...rentals]
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          .map((r) => {
            const c = getClient(cfg, r.clientId)
            const m = getMother(cfg, r.motherId)
            const p = getProfile(m, r.profileId)
            const st = rentalStatusLabel(r)
            const d = daysUntilExpiry(r)
            const chip =
              st === 'Activo' ? (d != null && d <= 1 ? 'warn' : 'ok') : st === 'Vencido' ? 'bad' : 'blue'
            return `
            <div class="item">
              <div class="item-head">
                <div>
                  <strong>${esc(c?.name || '—')}</strong>
                  <span class="chip ${chip}">${esc(st)}</span>
                  ${r.remindEnabled ? `<span class="chip teal"><i class="fas fa-bell"></i> ${r.remindDaysBefore}d · ${esc(r.remindTime)}</span>` : ''}
                </div>
                <form action="/gestor-general/delete-rental" method="post" onsubmit="return confirm('¿Eliminar este alquiler?')">
                  <input type="hidden" name="id" value="${esc(r.id)}">
                  <button class="btn btn-danger btn-sm" type="submit"><i class="fas fa-trash"></i></button>
                </form>
              </div>
              <div class="meta">
                <b>WhatsApp:</b> ${esc(c?.whatsapp || '—')}<br>
                <b>Cuenta → perfil:</b> ${esc(m?.name || '—')} → ${esc(p?.name || '—')}<br>
                <b>Plan:</b> ${esc(r.planLabel || '—')} ·
                <b>Inicio:</b> ${esc(formatDateDisplay(r.startAt))} ·
                <b>Vence:</b> ${esc(formatDateDisplay(r.expiresAt))}
                ${d != null && isRentalActive(r) ? ` (${d} día${d === 1 ? '' : 's'})` : ''}<br>
                ${r.lastRemindDay ? `<b>Último aviso:</b> ${esc(r.lastRemindDay)}` : 'Aún no se envió recordatorio'}
              </div>
            </div>`
          })
          .join('')

  const canCreate = clients.length > 0 && mothers.some((m) => (m.profiles || []).length > 0)

  const clientOpts = clients
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(c.whatsapp)})</option>`)
    .join('')

  const profileOpts = mothers
    .map((m) =>
      (m.profiles || [])
        .map((p) => {
          const busy = !!activeRentalForProfile(cfg, p.id)
          return `<option value="${esc(m.id)}::${esc(p.id)}" ${busy ? 'disabled' : ''}>${esc(m.name)} → ${esc(p.name)} ${busy ? '(ocupado)' : '(libre)'}</option>`
        })
        .join('')
    )
    .join('')

  return `
    <div class="card">
      <h2><i class="fas fa-handshake"></i> Alquileres</h2>
      <p class="help">Lista de vínculos perfil ↔ cliente. También podés crearlos desde cada perfil.</p>
      ${
        canCreate
          ? `<details class="soft" style="margin-bottom:12px;">
              <summary><i class="fas fa-plus"></i> Crear alquiler (formulario)</summary>
              <div class="soft-body">
              <form action="/gestor-general/save-rental" method="post" class="form-grid">
                <div><label>Cliente</label><select name="clientId" required>${clientOpts}</select></div>
                <div class="full"><label>Perfil libre</label><select name="motherProfile" required>${profileOpts}</select></div>
                <div><label>Plan</label><input name="planLabel" placeholder="1 mes"></div>
                <div><label>Inicio</label><input type="date" name="startAt" required value="${esc(toDateInputValue(Date.now()))}"></div>
                <div><label>Vence</label><input type="date" name="expiresAt" required></div>
                <div><label>Recordatorio</label>
                  <select name="remindEnabled"><option value="1" selected>Sí</option><option value="0">No</option></select>
                </div>
                <div><label>Días antes</label><input type="number" name="remindDaysBefore" min="0" max="30" value="${cfg.defaultRemindDays ?? 1}"></div>
                <div><label>Hora</label><input type="time" name="remindTime" value="${esc(cfg.defaultRemindTime || '10:00')}"></div>
                <div class="full">
                  <label>Mensaje (opcional)</label>
                  ${renderReminderComposeBlock({
                    textareaName: 'remindMessage',
                    textareaId: 'rentalRemindMsg',
                    bubbleId: 'rentalPreviewBubble',
                    typingId: 'rentalPreviewTyping',
                    placeholder: 'Vacío = mensaje de Ajustes',
                  })}
                </div>
                <div class="full"><button class="btn btn-primary" type="submit"><i class="fas fa-check"></i> Guardar</button></div>
              </form>
              </div>
            </details>`
          : `<div class="callout">Necesitás 1 cliente y 1 perfil: <a href="/gestor-general?tab=madres" style="color:#5eead4;">Cuentas</a> y <a href="/gestor-general?tab=clientes" style="color:#5eead4;">Clientes</a>.</div>`
      }
      <div class="list">${list}</div>
    </div>`
}

function renderSettings(cfg) {
  return `
    <div class="card">
      <h2><i class="fas fa-sliders"></i> Ajustes del gestor</h2>
      <p class="help">Los recordatorios avisan a tus clientes por WhatsApp cuando se acerca el día en que vence el servicio o producto que les diste. El bot escribe como una persona (espera un poco y “tipea” antes de mandar el mensaje), para que no se sienta tan robótico.</p>
      <form action="/gestor-general/settings" method="post" class="form-grid">
        <div>
          <label>Enviar recordatorios</label>
          <select name="enabled">
            <option value="1" ${cfg.enabled !== false ? 'selected' : ''}>Sí — avisar a mis clientes</option>
            <option value="0" ${cfg.enabled === false ? 'selected' : ''}>No — solo guardar todo, sin avisar</option>
          </select>
        </div>
        <div><label>Typing min (seg)</label><input type="number" name="minTypingSec" min="3" max="60" value="${cfg.minTypingSec ?? 5}"></div>
        <div><label>Typing max (seg)</label><input type="number" name="maxTypingSec" min="3" max="90" value="${cfg.maxTypingSec ?? 12}"></div>
        <div><label>Leer min (seg)</label><input type="number" name="minReadSec" min="0" max="30" value="${cfg.minReadSec ?? 2}"></div>
        <div><label>Leer max (seg)</label><input type="number" name="maxReadSec" min="0" max="60" value="${cfg.maxReadSec ?? 6}"></div>
        <div><label>Días antes (default)</label><input type="number" name="defaultRemindDays" min="0" max="30" value="${cfg.defaultRemindDays ?? 1}"></div>
        <div><label>Hora default</label><input type="time" name="defaultRemindTime" value="${esc(cfg.defaultRemindTime || '10:00')}"></div>
        <div class="full">
          <label>Mensaje por defecto</label>
          ${renderReminderComposeBlock({
            textareaName: 'defaultRemindMsg',
            textareaId: 'defaultRemindMsg',
            textareaValue: cfg.defaultRemindMsg || '',
            bubbleId: 'remindPreviewBubble',
            typingId: 'remindPreviewTyping',
          })}
        </div>
        <div class="full"><button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Guardar ajustes</button></div>
      </form>
    </div>`
}

