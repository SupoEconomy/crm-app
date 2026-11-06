/**
 * Panel Bot Códigos — bandeja, alias+números, buzón, comandos.
 * Estilo utilitario (sin look “IA”).
 */
import {
  STREAMING_SERVICES,
  serviceLabel,
  formatMailDate,
  formatExpiryDate,
  isPhoneAccessActive,
} from './bot-codes.js'

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function secretToggle(value) {
  if (!value) return `<span class="mute">—</span>`
  return `<button type="button" class="secret" title="Mostrar">
    <span class="mask">••••••••</span>
    <span class="val" hidden>${esc(value)}</span>
  </button>`
}

function svcOptions(selected = 'other') {
  return STREAMING_SERVICES.map(
    (s) =>
      `<option value="${esc(s.id)}"${s.id === selected ? ' selected' : ''}>${esc(s.label)}</option>`
  ).join('')
}

/**
 * @param {{ cfg, brand, version, homeLink, loaderBlock, toast, tab, inbox, inboxErrors, filterService }} opts
 */
export function renderBotCodesPage(opts = {}) {
  const {
    cfg,
    brand = 'Bot Spam',
    version = '',
    homeLink = '/',
    loaderBlock = '',
    toast = '',
    tab = 'bandeja',
    inbox = [],
    inboxErrors = [],
    filterService = '',
  } = opts

  const mailboxes = cfg.mailboxes || []
  const aliases = cfg.aliases || []
  const domain = cfg.domain || 'nexcodea.com'
  const settings = cfg.settings || { defaultAccessDays: 30, commandsEnabled: true, enabled: true }
  const mb = mailboxes[0]
  const withPass = !!mb?.password

  const tabs = [
    { id: 'bandeja', label: 'Bandeja' },
    { id: 'alias', label: 'Alias' },
    { id: 'comandos', label: 'Comandos' },
  ]

  const tabNav = tabs
    .map(
      (t) =>
        `<a class="tab${tab === t.id ? ' on' : ''}" href="/bot-codigos?tab=${t.id}">${esc(t.label)}</a>`
    )
    .join('')

  let body = ''
  if (tab === 'alias') body = renderAliases(cfg, aliases, domain, settings)
  else if (tab === 'comandos') body = renderCommands(cfg, settings, domain)
  else if (tab === 'config' || tab === 'buzones') body = renderCommands(cfg, settings, domain)
  else body = renderInbox({ inbox, inboxErrors, aliases, filterService, withPass, mb })

  const toastHtml = toast
    ? `<div class="flash${/error|falt|inválid|falló|no se/i.test(toast) ? ' bad' : ''}">${esc(toast)}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Códigos · ${esc(brand)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Fallbacks estilo Códigos; el tema global (loader) los sobrescribe */
      --bg: #0c0d0f;
      --panel: #14161a;
      --line: #2a2e36;
      --text: #e8eaed;
      --mute: #8b929e;
      --primary: #c4a574;
      --ok: #6fbf8a;
      --bad: #d97a7a;
      --input: #0f1114;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "IBM Plex Sans", system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 20px 16px 48px;
      font-size: 14px;
      line-height: 1.45;
    }
    .wrap { max-width: 860px; margin: 0 auto; }
    a { color: var(--primary); }
    .top {
      display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap;
      margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--line);
    }
    .back {
      color: var(--mute); text-decoration: none; font-size: 13px;
      border: 1px solid var(--line); padding: 6px 10px;
    }
    .back:hover { color: var(--text); border-color: #3d4450; }
    h1 {
      font-size: 1.15rem; font-weight: 600; letter-spacing: -0.02em;
      flex: 1;
    }
    h1 span { color: var(--mute); font-weight: 400; font-size: 0.78rem; margin-left: 8px; }
    .flash {
      margin-bottom: 14px; padding: 10px 12px;
      border: 1px solid #3d4a38; background: #151a14; color: #b7c9a8; font-size: 13px;
    }
    .flash.bad { border-color: #4a3030; background: #1a1212; color: #d4a8a8; }
    .tabs {
      display: flex; gap: 0; margin-bottom: 18px; border-bottom: 1px solid var(--line);
    }
    .tab {
      padding: 10px 14px; text-decoration: none; color: var(--mute);
      font-size: 13px; font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -1px;
    }
    .tab.on { color: var(--text); border-bottom-color: var(--primary); }
    .tab:hover { color: var(--text); }
    .panel {
      background: var(--panel); border: 1px solid var(--line); padding: 16px;
      margin-bottom: 12px;
    }
    .panel h2 {
      font-size: 0.92rem; font-weight: 600; margin-bottom: 4px;
    }
    .panel .hint { color: var(--mute); font-size: 12.5px; margin-bottom: 14px; }
    .stats {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
      background: var(--line); border: 1px solid var(--line); margin-bottom: 12px;
    }
    .stat { background: var(--panel); padding: 12px 14px; }
    .stat .k { font-size: 11px; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; }
    .stat .v { font-family: "IBM Plex Mono", monospace; font-size: 1.2rem; margin-top: 2px; font-weight: 500; }
    label {
      display: block; font-size: 11px; color: var(--mute); margin-bottom: 4px;
      text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500;
    }
    input, select, textarea {
      width: 100%; padding: 8px 10px; border: 1px solid var(--line);
      background: var(--input); color: var(--text); font: inherit; font-size: 13px;
    }
    input:focus, select:focus, textarea:focus {
      outline: none; border-color: var(--primary);
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .grid .full { grid-column: 1 / -1; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 12px; border: 1px solid var(--primary);
      background: var(--primary); color: var(--bg); font: inherit; font-size: 13px;
      font-weight: 600; cursor: pointer; text-decoration: none;
    }
    .btn.ghost {
      background: transparent; color: var(--text); border-color: var(--line);
    }
    .btn.danger {
      background: transparent; color: var(--bad); border-color: #4a3030;
    }
    .btn:hover { filter: brightness(1.05); }
    .mono { font-family: "IBM Plex Mono", monospace; font-size: 12.5px; }
    .mute { color: var(--mute); }
    .tag {
      display: inline-block; font-size: 11px; padding: 2px 7px;
      border: 1px solid var(--line); color: var(--mute);
    }
    .tag.ok { color: var(--ok); border-color: #2d4a38; }
    .tag.warn { color: var(--bad); border-color: #4a3030; }
    .tag.svc { color: var(--primary); border-color: #4a4030; }
    .mail {
      border: 1px solid var(--line); padding: 12px 14px; margin-bottom: 8px;
      background: var(--bg);
    }
    .mail .subj { font-weight: 600; font-size: 13.5px; margin-bottom: 4px; }
    .mail .meta { color: var(--mute); font-size: 12px; }
    .codes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .chip {
      font-family: "IBM Plex Mono", monospace; font-weight: 600; font-size: 15px;
      letter-spacing: 0.12em; padding: 8px 12px; cursor: pointer;
      border: 1px solid #3d4a38; background: #121812; color: var(--ok);
      user-select: all;
    }
    .chip:hover { border-color: var(--ok); }
    .preview { margin-top: 8px; color: var(--mute); font-size: 12.5px; }
    details.body { margin-top: 8px; font-size: 12.5px; color: var(--mute); }
    details.body summary { cursor: pointer; color: var(--primary); }
    details.body pre {
      margin-top: 8px; padding: 10px; border: 1px solid var(--line);
      background: var(--input); white-space: pre-wrap; word-break: break-word;
      max-height: 220px; overflow: auto; font-family: "IBM Plex Mono", monospace; font-size: 11.5px;
      color: #c5c9d0;
    }
    .alias {
      border: 1px solid var(--line); margin-bottom: 10px; background: var(--bg);
    }
    .alias-h {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--line);
    }
    .alias-h .em { font-family: "IBM Plex Mono", monospace; font-size: 13px; font-weight: 500; }
    .alias-b { padding: 12px 14px; }
    .phone-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .phone-table th {
      text-align: left; color: var(--mute); font-weight: 500; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.04em; padding: 0 0 8px;
      border-bottom: 1px solid var(--line);
    }
    .phone-table td { padding: 8px 0; border-bottom: 1px solid var(--line); vertical-align: middle; }
    .phone-table tr:last-child td { border-bottom: none; }
    .empty { text-align: center; padding: 28px 12px; color: var(--mute); font-size: 13px; }
    .secret {
      background: none; border: none; color: var(--text); cursor: pointer;
      font-family: "IBM Plex Mono", monospace; font-size: 12px; padding: 0;
    }
    .help-box {
      font-family: "IBM Plex Mono", monospace; font-size: 12px;
      padding: 12px; border: 1px solid var(--line); background: var(--bg);
      white-space: pre-wrap; color: #c5c9d0; margin-top: 8px;
    }
    @media (max-width: 640px) {
      .stats { grid-template-columns: 1fr 1fr; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${loaderBlock}
  <div class="wrap">
    <div class="top">
      <a class="back" href="${esc(homeLink)}">← Panel</a>
      <h1>Códigos ${version ? `<span>${esc(version)}</span>` : ''}</h1>
    </div>
    ${toastHtml}
    <nav class="tabs">${tabNav}</nav>
    ${body}
  </div>
  <script>
    document.querySelectorAll('.secret').forEach(btn => {
      btn.addEventListener('click', () => {
        const mask = btn.querySelector('.mask');
        const val = btn.querySelector('.val');
        const show = val.hasAttribute('hidden');
        if (show) { val.removeAttribute('hidden'); mask.setAttribute('hidden',''); }
        else { val.setAttribute('hidden',''); mask.removeAttribute('hidden'); }
      });
    });
    document.querySelectorAll('.chip,[data-copy]').forEach(el => {
      el.addEventListener('click', async () => {
        const t = el.getAttribute('data-copy') || el.textContent.trim();
        try {
          await navigator.clipboard.writeText(t);
          if (el.classList.contains('chip')) {
            const old = el.textContent;
            el.textContent = 'OK';
            setTimeout(() => { el.textContent = old; }, 700);
          }
        } catch {}
      });
    });
  </script>
</body>
</html>`
}

function renderInbox({ inbox, inboxErrors, aliases, filterService, withPass, mb }) {
  const codesCount = inbox.reduce((n, m) => n + (m.codes?.length || 0), 0)
  let list = inbox
  if (filterService) list = list.filter((m) => m.service === filterService)

  const errHtml = (inboxErrors || []).length
    ? `<div class="flash bad">${inboxErrors.map((e) => esc(e.error)).join(' · ')}</div>`
    : ''

  const items = list.length
    ? list
        .map((m) => {
          const codes =
            (m.codes || []).length > 0
              ? `<div class="codes">${m.codes
                  .map((c) => `<span class="chip" title="Copiar">${esc(c)}</span>`)
                  .join('')}</div>`
              : `<div class="mute" style="margin-top:8px;font-size:12px">Sin código detectado</div>`
          return `<article class="mail">
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <div class="subj">${esc(m.subject)}</div>
              <span class="tag svc">${esc(serviceLabel(m.service))}</span>
            </div>
            <div class="meta">
              ${esc(formatMailDate(m.date))} · ${(m.to || []).slice(0, 1).map(esc).join('') || '—'}<br>
              De: ${esc(m.from || '—')}
            </div>
            ${codes}
            ${m.preview ? `<div class="preview">${esc(m.preview)}</div>` : ''}
            ${m.body ? `<details class="body"><summary>Cuerpo</summary><pre>${esc(m.body)}</pre></details>` : ''}
          </article>`
        })
        .join('')
    : `<div class="empty">${withPass ? 'Sin correos aún. Sincronizá o esperá un OTP.' : 'Configurá la contraseña del buzón.'}</div>`

  return `
    <div class="stats">
      <div class="stat"><div class="k">Buzón</div><div class="v">${withPass ? 'OK' : '—'}</div></div>
      <div class="stat"><div class="k">Alias</div><div class="v">${aliases.length}</div></div>
      <div class="stat"><div class="k">Mails</div><div class="v">${list.length}</div></div>
      <div class="stat"><div class="k">OTPs</div><div class="v">${codesCount}</div></div>
    </div>
    ${errHtml}
    <div class="panel">
      <h2>Entrada</h2>
      <p class="hint">Solo ves correos de <strong>tus</strong> alias (este bot). Otros sub-bots no comparten esta lista.</p>
      <form class="row" method="GET" action="/bot-codigos" style="margin:0 0 14px">
        <input type="hidden" name="tab" value="bandeja">
        <input type="hidden" name="sync" value="1">
        <div style="flex:1;min-width:140px">
          <label>Servicio</label>
          <select name="service">
            <option value="">Todos</option>
            ${svcOptions(filterService || '')}
          </select>
        </div>
        <div style="align-self:end">
          <button type="submit" class="btn">Sincronizar</button>
        </div>
      </form>
      ${items}
    </div>`
}

function renderAliases(cfg, aliases, domain, settings) {
  const days = settings.defaultAccessDays || 30
  const cards = aliases.length
    ? [...aliases]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map((a) => {
          const phones = a.phones || []
          const phoneRows = phones.length
            ? phones
                .map((p) => {
                  const active = isPhoneAccessActive(p)
                  return `<tr>
                    <td class="mono">${esc(p.number)}${p.name ? ` <span class="mute">· ${esc(p.name)}</span>` : ''}</td>
                    <td>${esc(formatExpiryDate(p.expiresAt))}</td>
                    <td><span class="tag${active ? ' ok' : ' warn'}">${active ? 'activo' : 'vencido'}</span></td>
                    <td>
                      <form method="POST" action="/bot-codigos/delete-phone" style="margin:0" onsubmit="return confirm('¿Quitar número?')">
                        <input type="hidden" name="aliasId" value="${esc(a.id)}">
                        <input type="hidden" name="phoneId" value="${esc(p.id)}">
                        <button type="submit" class="btn danger" style="padding:4px 8px;font-size:11px">Quitar</button>
                      </form>
                    </td>
                  </tr>`
                })
                .join('')
            : `<tr><td colspan="4" class="mute">Sin números. Solo esos WA podrán pedir OTP de este correo.</td></tr>`

          return `<div class="alias">
            <div class="alias-h">
              <div>
                <div class="em">${esc(a.email)}</div>
                <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
                  <span class="tag svc">${esc(serviceLabel(a.service))}</span>
                  ${a.notes ? `<span class="mute" style="font-size:12px">${esc(a.notes)}</span>` : ''}
                </div>
              </div>
              <div class="row" style="margin:0">
                <button type="button" class="btn ghost" data-copy="${esc(a.email)}" style="padding:6px 10px">Copiar</button>
                <form method="POST" action="/bot-codigos/delete-alias" style="margin:0" onsubmit="return confirm('¿Eliminar alias y sus números?')">
                  <input type="hidden" name="id" value="${esc(a.id)}">
                  <button type="submit" class="btn danger" style="padding:6px 10px">Eliminar</button>
                </form>
              </div>
            </div>
            <div class="alias-b">
              <table class="phone-table">
                <thead><tr><th>WhatsApp</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
                <tbody>${phoneRows}</tbody>
              </table>
              <form method="POST" action="/bot-codigos/add-phone" class="grid" style="margin-top:12px">
                <input type="hidden" name="aliasId" value="${esc(a.id)}">
                <div>
                  <label>Número (código país)</label>
                  <input name="number" required placeholder="51987654321" inputmode="numeric">
                </div>
                <div>
                  <label>Nombre</label>
                  <input name="name" placeholder="Cliente">
                </div>
                <div>
                  <label>Días de acceso</label>
                  <input name="accessDays" type="number" min="1" max="3650" value="${days}">
                </div>
                <div style="align-self:end">
                  <button type="submit" class="btn ghost">+ Número</button>
                </div>
              </form>
            </div>
          </div>`
        })
        .join('')
    : `<div class="empty">Todavía no hay alias.</div>`

  return `
    <div class="panel">
      <h2>Nuevo alias</h2>
      <p class="hint">Con catch-all no hace falta crearlo en Spacemail. Después asigná los WhatsApp que pueden usar /code con este correo.</p>
      <form method="POST" action="/bot-codigos/save-alias" class="grid">
        <div>
          <label>Local (antes de @)</label>
          <input name="localPart" required placeholder="disneycuenta1" pattern="[a-zA-Z0-9._+\\-]+" autocomplete="off">
        </div>
        <div>
          <label>Dominio</label>
          <input value="@${esc(domain)}" disabled>
        </div>
        <div>
          <label>Plataforma</label>
          <select name="service">${svcOptions('disney')}</select>
        </div>
        <div>
          <label>Notas</label>
          <input name="notes" placeholder="Cliente / perfil">
        </div>
        <div class="full row" style="margin:0">
          <button type="submit" class="btn">Crear alias</button>
        </div>
      </form>
    </div>
    <div class="panel">
      <h2>Alias (${aliases.length})</h2>
      <p class="hint">La plataforma del alias debe coincidir con el comando. Si el alias es Netflix y ponen |disney, el bot ignora. Cada número solo puede pedir OTP del correo donde lo agregaste.</p>
      ${cards}
    </div>`
}

function renderCommands(cfg, settings, domain) {
  const days = settings.defaultAccessDays || 30
  const enabled = settings.commandsEnabled !== false
  const platforms = STREAMING_SERVICES.filter((s) => s.id !== 'other')
    .map((s) => s.id)
    .join(', ')

  return `
    <div class="panel">
      <h2>Comandos WhatsApp</h2>
      <p class="hint">Privado. Número no autorizado, vencido, o plataforma distinta a la del alias → el bot no responde.</p>
      <div class="help-box">/code
/codigo

/code correo|plataforma
/codigo correo|plataforma

Ejemplos:
/code disneycuenta1@${esc(domain)}|disney
/codigo netflix-juan@${esc(domain)}|netflix

La plataforma (|disney, |netflix…) debe ser la misma con la que creaste el alias.
Plataformas: ${esc(platforms)}</div>
    </div>
    <div class="panel">
      <h2>Tiempo por defecto</h2>
      <p class="hint">Al agregar un número a un alias, usa estos días (podés cambiarlo por número).</p>
      <form method="POST" action="/bot-codigos/settings" class="grid">
        <div>
          <label>Días de acceso</label>
          <input name="defaultAccessDays" type="number" min="1" max="3650" value="${days}" required>
        </div>
        <div>
          <label>Comandos</label>
          <select name="commandsEnabled">
            <option value="1"${enabled ? ' selected' : ''}>Activos</option>
            <option value="0"${!enabled ? ' selected' : ''}>Apagados</option>
          </select>
        </div>
        <div class="full row" style="margin:0">
          <button type="submit" class="btn">Guardar</button>
        </div>
      </form>
    </div>
    <div class="panel">
      <h2>Correo IMAP</h2>
      <p class="hint" style="margin:0">Es <strong>global</strong>: se configura solo en el <strong>panel maestro → Configuración → Email</strong> (también los tiempos de “leer” y “escribiendo” del /code). Este bot solo ve sus propios alias; Juan y Julio no se mezclan.</p>
    </div>
    <div class="panel">
      <h2>API interna</h2>
      <p class="hint">El bot la usa al recibir /code. También podés consultarla desde el panel autenticado.</p>
      <div class="help-box">GET /api/bot-codigos/lookup?email=...&amp;platform=disney&amp;phone=51999...
POST /api/bot-codigos/lookup
{ "email", "platform", "phone" }</div>
    </div>`
}

function renderConfig(_mb, _domain) {
  return `<div class="panel"><p class="hint" style="margin:0">El correo IMAP es global (panel maestro → Configuración → Email).</p></div>`
}

function renderMailbox(mb, domain) {
  return renderConfig(mb, domain)
}
