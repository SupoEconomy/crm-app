import { membershipLabel, MAX_LINKS, MAX_OWN_LINKS } from './group-links.js'

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function statusBadge(link, membership = null) {
  const info = membershipLabel({
    inGroup: !!membership?.inGroup,
    pendingApproval: !!membership?.pendingApproval,
    joinApprovalMode: link.joinApprovalMode,
    status: link.status,
  })
  return `<span class="gl-badge ${info.className}">${esc(info.text)}</span>`
}

function formatChecked(ts) {
  if (!ts) return 'Nunca'
  try {
    return new Date(ts).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function statsFor(links, membership = {}, { includeDead = false } = {}) {
  const enabled = links.filter((l) => l.enabled !== false)
  const alive = enabled.filter((l) => l.status === 'alive').length
  const free = enabled.filter((l) => l.status === 'alive' && !l.joinApprovalMode).length
  const approval = enabled.filter((l) => l.status === 'alive' && l.joinApprovalMode).length
  const dead = enabled.filter((l) => l.status === 'dead').length
  const inCount = enabled.filter((l) => membership[l.code]?.inGroup).length
  return { alive, free, approval, dead, inCount, total: includeDead ? links.length : enabled.length }
}

/**
 * @param {'manage'|'join'|'both'} actions
 */
function renderCards(links, {
  actions = 'join',
  scope = 'shared',
  membership = {},
  connReady = false,
  showErrors = false,
  emptyText = null,
} = {}) {
  if (!links.length) {
    return `<div class="gl-empty"><i class="fas fa-link-slash"></i><p>${esc(emptyText || 'Sin links.')}</p></div>`
  }

  return links.map((l) => {
    const mem = membership[l.code] || {}
    const title = l.subject || `Grupo ${l.code.slice(0, 8)}…`
    const members = l.size ? `${l.size} miembros` : 'Miembros: —'
    const errText = l.status === 'dead'
      ? 'Link muerto o inválido'
      : (l.error && l.status !== 'alive' ? l.error : '')
    const avatarQs = `scope=${encodeURIComponent(scope)}&t=${Number(l.checkedAt) || 0}`
    const showManage = actions === 'manage' || actions === 'both'
    const showJoin = actions === 'join' || actions === 'both'

    const manageBtns = showManage ? `
      <form method="POST" action="/links-grupos/refresh-one" style="margin:0">
        <input type="hidden" name="id" value="${esc(l.id)}">
        <input type="hidden" name="scope" value="${esc(scope)}">
        <button type="submit" class="btn btn-ghost btn-sm" ${connReady ? '' : 'disabled'}><i class="fas fa-rotate"></i> Verificar</button>
      </form>
      <form method="POST" action="/links-grupos/toggle" style="margin:0">
        <input type="hidden" name="id" value="${esc(l.id)}">
        <input type="hidden" name="scope" value="${esc(scope)}">
        <input type="hidden" name="enabled" value="${l.enabled ? '0' : '1'}">
        <button type="submit" class="btn btn-ghost btn-sm">${l.enabled ? '<i class="fas fa-pause"></i> Pausar' : '<i class="fas fa-play"></i> Activar'}</button>
      </form>
      <form method="POST" action="/links-grupos/delete" style="margin:0" onsubmit="return confirm('¿Quitar este link?')">
        <input type="hidden" name="id" value="${esc(l.id)}">
        <input type="hidden" name="scope" value="${esc(scope)}">
        <button type="submit" class="btn btn-danger btn-sm"><i class="fas fa-trash-can"></i></button>
      </form>` : ''

    const joinBtns = showJoin ? (
      mem.inGroup
        ? `<span class="gl-joined"><i class="fas fa-check"></i> Unido</span>`
        : `<form method="POST" action="/links-grupos/join" style="margin:0">
            <input type="hidden" name="id" value="${esc(l.id)}">
            <input type="hidden" name="scope" value="${esc(scope)}">
            <button type="submit" class="btn btn-primary btn-sm" ${!l.enabled || l.status === 'dead' || !connReady ? 'disabled' : ''}>
              <i class="fas fa-user-plus"></i> ${l.joinApprovalMode || mem.pendingApproval ? 'Solicitar unirse' : 'Unirse'}
            </button>
          </form>`
    ) : ''

    return `
    <article class="gl-card ${l.status === 'dead' ? 'is-dead' : ''} ${!l.enabled ? 'is-off' : ''} ${mem.inGroup ? 'is-in' : ''}" data-id="${esc(l.id)}" data-code="${esc(l.code)}">
      <div class="gl-card-top">
        <div class="gl-ico${l.hasAvatar ? ' has-photo' : ''}">
          ${l.hasAvatar
            ? `<img src="/links-grupos/avatar/${esc(l.code)}?${avatarQs}" alt="" loading="lazy">`
            : `<i class="fab fa-whatsapp"></i>`}
        </div>
        <div class="gl-main">
          <h3 title="${esc(title)}">${esc(title)}</h3>
          <div class="gl-meta">
            <span><i class="fas fa-users"></i> ${esc(members)}</span>
            <span><i class="fas fa-clock"></i> ${esc(formatChecked(l.checkedAt))}</span>
          </div>
          <div class="gl-badges">${statusBadge(l, mem)}</div>
          <a class="gl-url" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a>
          ${showErrors && errText ? `<p class="gl-err">${esc(errText)}</p>` : ''}
        </div>
      </div>
      <div class="gl-actions ${actions === 'both' ? 'is-both' : ''}">
        ${manageBtns}${joinBtns}
      </div>
    </article>`
  }).join('')
}

function joinToolbar(scope, enabledCount, connReady) {
  return `
    <div class="toolbar">
      <form method="POST" action="/links-grupos/join-all" style="margin:0" onsubmit="return confirm('¿Unirse a todos los grupos de esta lista?')">
        <input type="hidden" name="scope" value="${esc(scope)}">
        <button type="submit" class="btn btn-primary" ${connReady && enabledCount ? '' : 'disabled'}>
          <i class="fas fa-users"></i> Unirse a todos
        </button>
      </form>
      <form method="POST" action="/links-grupos/refresh" style="margin:0">
        <input type="hidden" name="scope" value="${esc(scope)}">
        <button type="submit" class="btn btn-ghost" ${connReady ? '' : 'disabled'}><i class="fas fa-satellite-dish"></i> Verificar</button>
      </form>
      <form method="POST" action="/links-grupos/refresh-membership" style="margin:0">
        <button type="submit" class="btn btn-ghost" ${connReady ? '' : 'disabled'}><i class="fas fa-sync"></i> Actualizar estado</button>
      </form>
    </div>`
}

/**
 * @param {{ mode: 'master'|'subbot', links, ownLinks?, membership?, brand, version, homeLink, loaderBlock, toast, connReady, verifyVia?, verifyViaNumber?, verifyCount?, verifyNumbers? }}
 */
export function renderGroupLinksPage({
  mode = 'subbot',
  links = [],
  ownLinks = [],
  membership = {},
  brand = 'BOT SPAM ULTRA',
  version = 'V8',
  homeLink = '/panel-master',
  loaderBlock = '',
  toast = '',
  connReady = false,
  verifyVia = null,
  verifyViaNumber = null,
  verifyCount = 0,
  verifyNumbers = [],
} = {}) {
  const isMaster = mode === 'master'
  const sharedVisible = isMaster
    ? links
    : links.filter((l) => l.enabled !== false && l.status !== 'dead')
  const ownVisible = isMaster
    ? []
    : ownLinks // en propios el dueño ve también muertos para gestionarlos
  const sharedStats = statsFor(sharedVisible, membership, { includeDead: isMaster })
  const ownStats = statsFor(
    ownVisible.filter((l) => l.enabled !== false && (isMaster || l.status !== 'dead' || true)),
    membership
  )
  const ownJoinable = ownVisible.filter((l) => l.enabled !== false && l.status !== 'dead')

  const styles = `
    :root {
      --bg-body: #0c0d0f; --bg-card: #14161a; --bg-input: #0f1114;
      --primary: #c4a574; --text-main: #e8eaed; --text-dim: #8b929e;
      --border: #2a2e36; --radius: 10px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, system-ui, sans-serif; background: var(--bg-body); color: var(--text-main);
      min-height: 100vh; padding: 20px 16px 48px;
      background-image: none;
    }
    .wrap { max-width: 720px; margin: 0 auto; width: 100%; }
    .top-nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    .nav-link-btn {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 0;
      text-decoration: none; color: var(--text-dim); background: var(--bg-card); border: 1px solid var(--border);
      font-size: 13px; font-weight: 500;
    }
    .nav-link-btn:hover { color: #5eead4; border-color: rgba(20,184,166,0.35); }
    .hero {
      background: linear-gradient(165deg, rgba(20,184,166,0.14), rgba(17,21,28,0.95));
      border: 1px solid rgba(20,184,166,0.25); border-radius: 18px; padding: 22px 18px; margin-bottom: 14px;
    }
    .hero h1 {
      font-family: 'Space Grotesk', sans-serif; font-size: clamp(1.2rem, 4.5vw, 1.7rem);
      display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
    }
    .hero h1 i { color: #5eead4; }
    .hero p { color: var(--text-dim); font-size: 0.88rem; line-height: 1.55; }
    .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 14px; }
    @media (min-width: 560px) { .stats { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); } }
    .stat { background: rgba(0,0,0,0.25); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; }
    .stat strong { display: block; font-size: 1.15rem; color: #5eead4; }
    .stat span { font-size: 0.7rem; color: var(--text-dim); }
    .panel {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 16px; margin-bottom: 14px;
    }
    .panel.panel-own {
      border-color: rgba(56,189,248,0.28);
      background: linear-gradient(165deg, rgba(56,189,248,0.08), rgba(21,23,30,0.95));
    }
    .panel h2 {
      font-family: 'Space Grotesk', sans-serif; font-size: 1.02rem; margin-bottom: 12px;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .panel h2 i { color: var(--primary); }
    .panel-own h2 i { color: #38bdf8; }
    .sec-tag {
      font-size: 0.65rem; font-weight: 700; padding: 3px 8px; border-radius: 999px;
      background: rgba(20,184,166,0.12); color: #5eead4; border: 1px solid rgba(20,184,166,0.25);
    }
    .sec-tag.own { background: rgba(56,189,248,0.12); color: #7dd3fc; border-color: rgba(56,189,248,0.28); }
    .hint { font-size: 0.78rem; color: var(--text-dim); line-height: 1.45; margin-bottom: 12px; }
    .toast {
      margin-bottom: 12px; padding: 12px 14px; border-radius: 12px;
      background: rgba(20,184,166,0.12); border: 1px solid rgba(20,184,166,0.3); color: #99f6e4; font-size: 0.88rem;
    }
    .warn {
      margin-bottom: 12px; padding: 12px 14px; border-radius: 12px;
      background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.28); color: #fcd34d; font-size: 0.85rem;
    }
    textarea, input[type=text] {
      width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--bg-input); color: var(--text-main); font: inherit; resize: vertical;
    }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 10px; border: 1px solid var(--border);
      padding: 10px 12px; font-weight: 600; font-size: 0.82rem; cursor: pointer; background: #12161e; color: var(--text-main);
      text-decoration: none; font-family: inherit; white-space: nowrap;
    }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-primary { background: linear-gradient(135deg, #14b8a6, #0f766e); border-color: rgba(94,234,212,0.35); color: #ecfdf5; }
    .btn-ghost { background: transparent; }
    .btn-danger { background: rgba(239,68,68,0.12); color: #fca5a5; border-color: rgba(239,68,68,0.3); }
    .btn-sm { padding: 8px 10px; font-size: 0.75rem; min-height: 36px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .toolbar .btn { flex: 1 1 auto; min-width: 140px; }
    .gl-grid { display: grid; gap: 10px; }
    .gl-card {
      display: flex; flex-direction: column; gap: 12px;
      padding: 14px; border-radius: 14px; background: #0d1118; border: 1px solid var(--border);
    }
    .gl-card.is-in { border-color: rgba(20,184,166,0.35); }
    .gl-card.is-dead { opacity: 0.72; }
    .gl-card.is-off { opacity: 0.55; }
    .gl-card-top { display: flex; gap: 12px; min-width: 0; width: 100%; }
    .gl-ico {
      width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(37,211,102,0.12); color: #4ade80; font-size: 1.1rem; overflow: hidden;
    }
    .gl-ico.has-photo { background: #0a0d12; border: 1px solid rgba(148,163,184,0.18); padding: 0; }
    .gl-ico.has-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .gl-main { min-width: 0; flex: 1; overflow: hidden; }
    .gl-main h3 {
      font-size: 0.92rem; margin-bottom: 6px; line-height: 1.3;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .gl-meta { display: flex; flex-wrap: wrap; gap: 8px 12px; font-size: 0.72rem; color: var(--text-dim); margin-bottom: 8px; }
    .gl-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .gl-badge { font-size: 0.68rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; border: 1px solid transparent; }
    .st-free { background: rgba(20,184,166,0.12); color: #5eead4; border-color: rgba(20,184,166,0.25); }
    .st-approval { background: rgba(251,191,36,0.12); color: #fcd34d; border-color: rgba(251,191,36,0.28); }
    .st-in { background: rgba(34,197,94,0.12); color: #86efac; border-color: rgba(34,197,94,0.28); }
    .st-pending { background: rgba(56,189,248,0.12); color: #7dd3fc; border-color: rgba(56,189,248,0.28); }
    .st-dead { background: rgba(239,68,68,0.12); color: #fca5a5; border-color: rgba(239,68,68,0.28); }
    .st-unknown { background: rgba(148,163,184,0.12); color: #cbd5e1; border-color: rgba(148,163,184,0.2); }
    .gl-url {
      display: block; font-size: 0.7rem; color: #67e8f9; text-decoration: none;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
    }
    .gl-err { margin-top: 6px; font-size: 0.72rem; color: #fca5a5; word-break: break-word; }
    .gl-actions {
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;
      width: 100%; padding-top: 2px; border-top: 1px solid rgba(148,163,184,0.1);
    }
    .gl-actions form { margin: 0; min-width: 0; }
    .gl-actions .btn { width: 100%; }
    .gl-joined {
      grid-column: 1 / -1; color: #86efac; font-size: 0.82rem; font-weight: 600;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 10px;
    }
    .gl-empty { text-align: center; padding: 40px 16px; color: var(--text-dim); }
    .gl-empty i { font-size: 2rem; color: rgba(20,184,166,0.4); margin-bottom: 10px; display: block; }
    .form-row { display: flex; justify-content: stretch; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    .form-row .btn { flex: 1 1 160px; }
    @media (max-width: 480px) {
      body { padding: 12px 10px 36px; }
      .panel { padding: 14px 12px; }
      .hero { padding: 18px 14px; }
      .nav-link-btn { padding: 9px 11px; font-size: 0.78rem; }
      .gl-actions { grid-template-columns: 1fr 1fr auto; }
      .gl-actions .btn-sm { font-size: 0.72rem; padding: 8px 6px; gap: 4px; }
      .toolbar .btn { min-width: 100%; }
    }
    .gl-actions.is-both { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .gl-actions.is-both .gl-joined { grid-column: 1 / -1; }
    @media (min-width: 700px) {
      .gl-card { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 12px 16px; }
      .gl-actions {
        grid-template-columns: none; display: flex; flex-direction: column; width: auto;
        border-top: none; padding-top: 0; min-width: 118px;
      }
      .gl-actions.is-both { min-width: 130px; }
      .gl-actions .btn { width: 100%; }
      .gl-joined { grid-column: auto; }
    }
  `

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Links de grupos | ${esc(brand)} ${esc(version)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${styles}</style>
</head>
<body>
  ${loaderBlock}
  <div class="wrap">
    <div class="top-nav">
      <a class="nav-link-btn" href="${esc(homeLink)}"><i class="fas fa-arrow-left"></i> Volver al panel</a>
      <a class="nav-link-btn" href="/pubs"><i class="fas fa-images"></i> Publicaciones</a>
      <a class="nav-link-btn" href="/auto-respuestas"><i class="fas fa-reply-all"></i> Respuestas auto</a>
      <a class="nav-link-btn" href="/activity"><i class="fas fa-chart-line"></i> Actividad</a>
    </div>

    <div class="hero">
      <h1><i class="fas fa-link"></i> Links de grupos</h1>
      <p>${isMaster
        ? 'Carga invitaciones compartidas. Se verifican y los sub-bots pueden unirse desde su panel.'
        : 'Tienes dos listas: la del administrador (compartida) y la tuya (solo tu bot). Cada una con unirse uno a uno o a todos.'}</p>
      <div class="stats">
        <div class="stat"><strong>${sharedVisible.length}</strong><span>${isMaster ? 'Links totales' : 'Del admin'}</span></div>
        ${!isMaster ? `<div class="stat"><strong>${ownLinks.length}</strong><span>Mis links</span></div>` : ''}
        <div class="stat"><strong>${sharedStats.alive + (isMaster ? 0 : ownStats.alive)}</strong><span>Vivos</span></div>
        <div class="stat"><strong>${sharedStats.free + (isMaster ? 0 : ownStats.free)}</strong><span>Libres</span></div>
        ${isMaster
          ? `<div class="stat"><strong>${sharedStats.dead}</strong><span>Muertos</span></div>`
          : `<div class="stat"><strong>${sharedStats.inCount + ownStats.inCount}</strong><span>Ya unidos</span></div>`}
      </div>
    </div>

    ${toast ? `<div class="toast"><i class="fas fa-check-circle"></i> ${esc(toast)}</div>` : ''}
    ${!connReady
      ? `<div class="warn"><i class="fas fa-plug"></i> WhatsApp no disponible. ${isMaster ? 'Vincula el maestro o ten al menos un sub-bot online.' : 'Conéctalo para verificar o unirte.'}</div>`
      : (isMaster && (verifyVia === 'subbots' || verifyVia === 'subbot' || verifyVia === 'mixed')
        ? `<div class="toast" style="background:rgba(56,189,248,0.1);border-color:rgba(56,189,248,0.3);color:#7dd3fc;"><i class="fas fa-robot"></i> Verificación repartida entre ${verifyCount || (verifyNumbers?.length || 1)} bot(s)${verifyNumbers?.length ? `: <strong>${esc(verifyNumbers.join(', '))}</strong>` : ''}${verifyVia === 'mixed' ? ' + maestro' : ''}.</div>`
        : '')}

    ${isMaster ? `
    <div class="panel">
      <h2><i class="fas fa-plus"></i> Agregar links compartidos</h2>
      <p class="hint">Pega hasta ${MAX_LINKS} invitaciones (una por línea). Los clientes las verán en su panel.</p>
      <form method="POST" action="/links-grupos/add">
        <input type="hidden" name="scope" value="shared">
        <textarea name="links" rows="6" placeholder="https://chat.whatsapp.com/AbCdEfGhIjK&#10;https://chat.whatsapp.com/XyZ123456789" required></textarea>
        <div class="form-row">
          <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Agregar links</button>
        </div>
      </form>
    </div>
    <div class="panel">
      <h2><i class="fas fa-satellite-dish"></i> Verificación</h2>
      <p class="hint">Si hay varios sub-bots online, los links se reparte entre todos en paralelo.</p>
      <div class="toolbar">
        <form method="POST" action="/links-grupos/refresh" style="margin:0">
          <input type="hidden" name="scope" value="shared">
          <button type="submit" class="btn btn-primary" ${connReady ? '' : 'disabled'}><i class="fas fa-rotate"></i> Verificar todos</button>
        </form>
      </div>
    </div>
    <div class="panel">
      <h2><i class="fas fa-list"></i> Lista compartida <span class="sec-tag">Admin</span></h2>
      <div class="gl-grid">${renderCards(sharedVisible, { actions: 'manage', scope: 'shared', membership, connReady, showErrors: true, emptyText: 'Todavía no hay links. Pega varios abajo.' })}</div>
    </div>
    ` : `
    <div class="panel panel-own">
      <h2><i class="fas fa-user-plus"></i> Mis links <span class="sec-tag own">Solo tu bot</span></h2>
      <p class="hint">Agrega tus propios grupos. Tu WhatsApp los verifica y solo tú los ves. Hasta ${MAX_OWN_LINKS} links.</p>
      <form method="POST" action="/links-grupos/add">
        <input type="hidden" name="scope" value="own">
        <textarea name="links" rows="4" placeholder="https://chat.whatsapp.com/XXXX…" required></textarea>
        <div class="form-row">
          <button type="submit" class="btn btn-primary" ${connReady ? '' : 'disabled'}><i class="fas fa-plus"></i> Agregar mis links</button>
        </div>
      </form>
      ${joinToolbar('own', ownJoinable.length, connReady)}
      <div class="gl-grid">${renderCards(ownVisible, { actions: 'both', scope: 'own', membership, connReady, showErrors: true, emptyText: 'Aún no agregaste links propios.' })}</div>
    </div>

    <div class="panel">
      <h2><i class="fas fa-shield-halved"></i> Links del administrador <span class="sec-tag">Compartidos</span></h2>
      <p class="hint">Grupos cargados por el dueño del sistema. Puedes unirte uno por uno o a todos.</p>
      ${joinToolbar('shared', sharedVisible.length, connReady)}
      <div class="gl-grid">${renderCards(sharedVisible, { actions: 'join', scope: 'shared', membership, connReady, showErrors: false, emptyText: 'El administrador aún no cargó links públicos.' })}</div>
    </div>
    `}
  </div>
</body>
</html>`
}
