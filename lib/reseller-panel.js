import { renderRentalTimeFields, renderRentalTimeScript, renderRentalTimeStyles } from './rental-ui.js'
import {
  formatDateTime,
  formatRemaining,
  getRentalLabel,
  isInfiniteRental,
  resolveRentalStatus,
} from './rental.js'
import { getResellerPanel } from './reseller.js'
import {
  renderPairingBoxStyles,
  renderPairingSlotHtml,
  renderEntrarSlotHtml,
  renderLiveSubbotsScript,
} from './subbot-live-ui.js'

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderChildCard(child, number, { panelUrl, canGrantMaster }) {
  const rentalStatus = resolveRentalStatus(child)
  const statusLabel = rentalStatus === 'expired' ? 'vencido'
    : (rentalStatus === 'paused' ? 'pausado' : (child.status || 'offline'))
  const statusClass = rentalStatus === 'expired' ? 'status-expired'
    : (rentalStatus === 'paused' ? 'status-paused' : `status-${child.status || 'offline'}`)
  const cardStateClass = rentalStatus === 'expired' ? 'is-expired'
    : (rentalStatus === 'paused' ? 'is-paused' : `is-${child.status || 'offline'}`)
  const expiresLabel = isInfiniteRental(child) ? 'Infinito' : formatDateTime(child.expiresAt, child)
  const remaining = !isInfiniteRental(child) && child.expiresAt
    ? formatRemaining(child.expiresAt - Date.now(), child)
    : ''
  const childRp = getResellerPanel(child)
  const resellerBadge = childRp.enabled
    ? `<span class="rs-badge rs-badge-on"><i class="fas fa-store"></i> Revendedor</span>`
    : ''
  const childForLive = { ...child, rentalStatus }
  const pairingHtml = renderPairingSlotHtml(number, childForLive)
  const entrarHtml = renderEntrarSlotHtml(number, childForLive, panelUrl)

  const grantBlock = canGrantMaster ? `
    <details class="rs-grant">
      <summary><i class="fas fa-key"></i> Panel revendedor para este usuario</summary>
      <form method="POST" action="/reseller/child-reseller-config" class="rs-grant-form">
        <input type="hidden" name="childNumber" value="${esc(number)}">
        <label class="rs-check">
          <input type="checkbox" name="enabled" value="1" ${childRp.enabled ? 'checked' : ''}>
          Activar panel revendedor
        </label>
        <label>Máximo sub-bots (0 = sin límite)</label>
        <input type="number" name="maxSubbots" min="0" max="500" value="${esc(childRp.maxSubbots)}">
        <label class="rs-check">
          <input type="checkbox" name="canGrantMaster" value="1" ${childRp.canGrantMaster ? 'checked' : ''}>
          Poder completo (100%)
        </label>
        <label>Etiqueta</label>
        <input type="text" name="label" maxlength="80" value="${esc(childRp.label)}" placeholder="Opcional">
        <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-save"></i> Guardar</button>
      </form>
    </details>` : ''

  return `
    <article class="rs-card ${cardStateClass}" id="subbot-card-${esc(number)}" data-number="${esc(number)}" data-panel-url="${esc(panelUrl || '')}">
      <div class="rs-card-top">
        <div class="rs-avatar">${esc(String(child.name || 'B').charAt(0).toUpperCase())}</div>
        <div class="rs-main">
          <h3>${esc(child.name || 'Sub-Bot')}</h3>
          <div class="rs-meta">
            <span><i class="fab fa-whatsapp"></i> ${esc(number)}</span>
            <span class="status-pill ${statusClass}" id="status-pill-${esc(number)}">${esc(statusLabel)}</span>
            ${resellerBadge}
          </div>
          <div class="rs-plan">
            <span><i class="fas fa-calendar-day"></i> ${esc(getRentalLabel(child.rentalDuration, child))}</span>
            <span>Vence: ${esc(expiresLabel)}${remaining ? ` · <em>${esc(remaining)}</em>` : ''}</span>
          </div>
          ${panelUrl ? `<a class="rs-url" href="${esc(panelUrl)}" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> ${esc(panelUrl)}</a>` : ''}
        </div>
      </div>
      ${pairingHtml}
      <div class="rs-entrar-wrap">${entrarHtml}</div>
      <details class="rs-edit">
        <summary><i class="fas fa-pen"></i> Editar</summary>
        <form method="POST" action="/reseller/edit-subbot" class="rs-edit-form">
          <input type="hidden" name="number" value="${esc(number)}">
          <label>Nombre</label>
          <input type="text" name="name" value="${esc(child.name || '')}" required>
          <div class="rs-row">
            <div><label>Usuario panel</label><input type="text" name="user" value="${esc(child.panelUser || '')}" required></div>
            <div><label>Contraseña</label><input type="text" name="pass" value="${esc(child.panelPass || '')}" required></div>
          </div>
          <label>Cambiar tiempo de alquiler</label>
          ${renderRentalTimeFields({ fieldPrefix: 'extend_', showSkip: true, showInfinite: true, defaultMode: 'preset' })}
          <p class="rs-hint">El tiempo elegido reemplaza el plan actual desde ahora.</p>
          <div class="rs-actions">
            <button type="submit" name="action" value="save" class="btn btn-primary btn-sm">Guardar</button>
            <button type="submit" formaction="/reseller/pause-subbot" class="btn btn-ghost btn-sm">Pausar</button>
            <button type="submit" formaction="/reseller/resume-subbot" class="btn btn-ghost btn-sm">Reanudar</button>
          </div>
        </form>
      </details>
      ${grantBlock}
      <form method="POST" action="/reseller/delete-user" class="rs-delete" onsubmit="return confirm('¿Eliminar este sub-bot permanentemente?')">
        <input type="hidden" name="number" value="${esc(number)}">
        <button type="submit" class="btn btn-danger btn-sm"><i class="fas fa-trash-can"></i> Eliminar</button>
      </form>
    </article>`
}

/**
 * @param {{ resellerPanel, children, used, max, canGrantMaster, label, homeLink, loaderBlock, toast, brand, publicIP }}
 */
export function renderResellerPage({
  resellerPanel = {},
  children = [],
  used = 0,
  max = 0,
  canGrantMaster = false,
  label = '',
  homeLink = '/panel-master',
  loaderBlock = '',
  toast = '',
  brand = 'BOT SPAM ULTRA',
  publicIP = '',
} = {}) {
  const limitLabel = max > 0 ? `${used} / ${max}` : `${used} (sin límite)`
  const canCreate = max === 0 || used < max
  const cards = children.length
    ? children.map(([num, data]) => renderChildCard(data, num, {
      panelUrl: data.panelUrl || '',
      canGrantMaster,
    })).join('')
    : `<div class="rs-empty"><i class="fas fa-users-slash"></i><p>Aún no tenés sub-bots vinculados.</p></div>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Panel revendedor | ${esc(brand)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0c0d0f; --card: #14161a; --input: #0f1114;
      --primary: #c4a574; --text: #e8eaed; --dim: #8b929e; --border: #2a2e36; --radius: 10px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'IBM Plex Sans', Inter, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding: 18px 14px 48px; }
    .wrap { max-width: 760px; margin: 0 auto; }
    .top-nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .nav-link-btn {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px;
      text-decoration: none; color: var(--dim); background: var(--card); border: 1px solid var(--border); font-size: 13px;
    }
    .nav-link-btn:hover { color: var(--primary); border-color: rgba(196,165,116,0.4); }
    .hero {
      background: linear-gradient(165deg, rgba(196,165,116,0.12), rgba(20,22,26,0.98));
      border: 1px solid rgba(196,165,116,0.28); border-radius: 14px; padding: 20px 18px; margin-bottom: 14px;
    }
    .hero h1 { font-family: 'Space Grotesk', sans-serif; font-size: 1.45rem; display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .hero h1 i { color: var(--primary); }
    .hero p { color: var(--dim); font-size: 0.88rem; line-height: 1.55; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
    .stat { background: rgba(0,0,0,0.22); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .stat strong { display: block; font-size: 1.1rem; color: var(--primary); }
    .stat span { font-size: 0.68rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.04em; }
    .panel { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 14px; }
    .panel h2 { font-family: 'Space Grotesk', sans-serif; font-size: 1rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .panel h2 i { color: var(--primary); }
    label { display: block; font-size: 0.75rem; color: var(--dim); margin: 10px 0 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    input, select { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--input); color: var(--text); font-size: 0.9rem; }
    .rs-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); cursor: pointer; font-weight: 600; font-size: 0.82rem;
    }
    .btn-primary { background: var(--primary); color: #0c0d0f; border-color: transparent; }
    .btn-ghost { background: transparent; color: var(--dim); }
    .btn-danger { background: rgba(217,122,122,0.15); color: #f0a0a0; border-color: rgba(217,122,122,0.35); }
    .btn-sm { padding: 7px 10px; font-size: 0.78rem; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .rs-list { display: flex; flex-direction: column; gap: 12px; }
    .rs-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
    .rs-card-top { display: flex; gap: 12px; }
    .rs-avatar {
      width: 44px; height: 44px; border-radius: 10px; background: rgba(196,165,116,0.15);
      display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--primary); flex-shrink: 0;
    }
    .rs-main { min-width: 0; flex: 1; }
    .rs-main h3 { font-size: 1rem; margin-bottom: 6px; }
    .rs-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 0.78rem; color: var(--dim); margin-bottom: 6px; }
    .rs-pill { padding: 2px 8px; border-radius: 999px; font-size: 0.68rem; text-transform: uppercase; border: 1px solid var(--border); }
    .rs-pill.is-online { color: #86efac; border-color: rgba(37,211,102,0.35); }
    .rs-pill.is-offline, .rs-pill.is-paused { color: #fbbf24; border-color: rgba(251,191,36,0.35); }
    .rs-pill.is-expired { color: #f0a0a0; border-color: rgba(217,122,122,0.35); }
    .rs-plan { font-size: 0.76rem; color: var(--dim); display: flex; flex-direction: column; gap: 2px; margin-bottom: 6px; }
    .rs-url { font-size: 0.72rem; color: #7dd3fc; word-break: break-all; text-decoration: none; }
    .rs-badge { font-size: 0.65rem; padding: 2px 7px; border-radius: 999px; }
    .rs-badge-on { background: rgba(196,165,116,0.15); color: var(--primary); border: 1px solid rgba(196,165,116,0.35); }
    .rs-edit, .rs-grant { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
    .rs-edit summary, .rs-grant summary { cursor: pointer; font-size: 0.82rem; color: var(--dim); list-style: none; display: flex; align-items: center; gap: 6px; }
    .rs-edit-form, .rs-grant-form { margin-top: 10px; }
    .rs-hint { font-size: 0.72rem; color: var(--dim); margin: 6px 0 10px; }
    .rs-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .rs-delete { margin-top: 10px; }
    .rs-empty { text-align: center; padding: 32px 16px; color: var(--dim); }
    .rs-empty i { font-size: 2rem; margin-bottom: 10px; opacity: 0.5; }
    .rs-check { display: flex; align-items: center; gap: 8px; text-transform: none; font-size: 0.85rem; color: var(--text); }
    .rs-check input { width: auto; }
    .toast { background: rgba(20,184,166,0.15); border: 1px solid rgba(20,184,166,0.35); color: #5eead4; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 0.85rem; }
    .power-note { font-size: 0.78rem; color: var(--dim); margin-top: 8px; padding: 8px 10px; background: rgba(0,0,0,0.2); border-radius: 8px; }
    .rs-entrar-wrap { margin-top: 10px; }
    .rs-card.is-pairing, .rs-card.is-connecting { border-color: rgba(251,191,36,0.35); }
    ${renderPairingBoxStyles()}
    ${renderRentalTimeStyles()}
  </style>
</head>
<body>
  ${loaderBlock}
  <div class="wrap">
    <div class="top-nav">
      <a href="${esc(homeLink)}" class="nav-link-btn"><i class="fas fa-arrow-left"></i> Mi panel</a>
    </div>
    ${toast ? `<div class="toast">${toast}</div>` : ''}
    <div class="hero">
      <h1><i class="fas fa-store"></i> Panel revendedor${label ? ` · ${esc(label)}` : ''}</h1>
      <p>Gestioná tus sub-bots: creá usuarios con límites de tiempo, editá credenciales y controlá el acceso.
      ${canGrantMaster
    ? ' Tenés <strong>poder completo (100%)</strong>: podés activar panel revendedor en tus usuarios.'
    : ' No podés dar panel revendedor a otros salvo que el administrador te active el poder completo.'}</p>
      <div class="stats">
        <div class="stat"><strong>${esc(String(used))}</strong><span>Sub-bots</span></div>
        <div class="stat"><strong>${esc(limitLabel)}</strong><span>Cupo</span></div>
        <div class="stat"><strong>${canGrantMaster ? '100%' : 'Básico'}</strong><span>Nivel</span></div>
      </div>
    </div>

    <div class="panel">
      <h2><i class="fas fa-user-plus"></i> Nuevo sub-bot</h2>
      ${canCreate ? `
      <form method="POST" action="/reseller/create-user">
        <label>Nombre</label>
        <input type="text" name="name" placeholder="Ej: Cliente Juan" required>
        <label>Número WhatsApp (sin +)</label>
        <input type="text" name="number" placeholder="51900111222" required>
        <div class="rs-row">
          <div><label>Usuario panel</label><input type="text" name="user" placeholder="admin" required></div>
          <div><label>Contraseña</label><input type="password" name="pass" placeholder="****" required></div>
        </div>
        <label>Tiempo de alquiler</label>
        ${renderRentalTimeFields({ fieldPrefix: '', showSkip: false, showInfinite: true, defaultMode: 'preset' })}
        <button type="submit" class="btn btn-primary" style="margin-top:14px; width:100%;"><i class="fas fa-plus"></i> Crear sub-bot</button>
      </form>` : `
      <p style="color:var(--dim); font-size:0.88rem;">Alcanzaste el límite de sub-bots (${esc(String(max))}). Contactá al administrador para ampliar el cupo.</p>`}
    </div>

    <div class="panel">
      <h2><i class="fas fa-users"></i> Tus sub-bots</h2>
      <div class="rs-list">${cards}</div>
    </div>
  </div>
  <script>${renderRentalTimeScript()}${renderLiveSubbotsScript({ statusUrl: '/reseller/status', publicIP })}</script>
</body>
</html>`
}

export function renderResellerConfigModalFields() {
  return ''
}
