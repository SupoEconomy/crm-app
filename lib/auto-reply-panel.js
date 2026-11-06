import {
  formatRuleLimitLabel,
  groupRulesByFolder,
  AUTO_REPLY_DISCLAIMER,
  formatHoursLabel,
  formatBlacklistNumber,
} from './auto-reply.js'

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderRuleCard(r, folderName = null) {
  const kws = (r.keywords || []).map((k) => `<span class="ar-chip">${esc(k)}</span>`).join('')
  const media = r.image
    ? (r.imageType === 'video'
      ? `<video class="ar-media" controls src="/images/${esc(r.image)}"></video>`
      : `<img class="ar-media" src="/images/${esc(r.image)}" alt="">`)
    : `<span class="ar-nomedia">Sin media</span>`
  const limitLabel = formatRuleLimitLabel(r)
  const limitClass = r.limitMode === 'max' ? 'lim-max' : 'lim-free'
  const folderBadge = folderName
    ? `<span class="ar-badge folder"><i class="fas fa-folder"></i> ${esc(folderName)}</span>`
    : ''
  const finalBadge = r.isFinal
    ? `<span class="ar-badge final"><i class="fas fa-flag-checkered"></i> Mensaje final</span>`
    : ''

  return `
  <article class="ar-card ${r.enabled ? '' : 'is-off'}">
    <div class="ar-card-top">
      <div>
        <h3>${esc(r.name)}</h3>
        <div class="ar-kws">${kws || '<span class="ar-chip dim">sin keywords</span>'}</div>
      </div>
      <div class="ar-badges">
        ${folderBadge}
        ${finalBadge}
        <span class="ar-badge ${limitClass}">${esc(limitLabel)}</span>
        <span class="ar-badge ${r.enabled ? 'on' : 'off'}">${r.enabled ? 'Activa' : 'Pausada'}</span>
      </div>
    </div>
    <p class="ar-text">${esc(r.text || '(sin texto)')}</p>
    <div class="ar-media-wrap">${media}</div>
    <div class="ar-actions">
      <form method="POST" action="/auto-respuestas/toggle-rule" style="margin:0">
        <input type="hidden" name="id" value="${esc(r.id)}">
        <button type="submit" class="btn btn-ghost">${r.enabled ? '<i class="fas fa-pause"></i> Pausar' : '<i class="fas fa-play"></i> Activar'}</button>
      </form>
      <button type="button" class="btn btn-ghost" onclick="openEditRule(this)" data-rule="${Buffer.from(JSON.stringify(r), 'utf8').toString('base64')}"><i class="fas fa-pen"></i> Editar</button>
      <form method="POST" action="/auto-respuestas/delete-rule" style="margin:0" onsubmit="return confirm('¿Eliminar esta respuesta?')">
        <input type="hidden" name="id" value="${esc(r.id)}">
        <button type="submit" class="btn btn-danger"><i class="fas fa-trash-can"></i></button>
      </form>
    </div>
  </article>`
}

function folderOptionsHtml(folders = [], selectedId = '') {
  const opts = [`<option value="">Sin carpeta</option>`]
  for (const f of [...folders].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) {
    opts.push(`<option value="${esc(f.id)}" ${selectedId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`)
  }
  return opts.join('')
}

/** Guía / tutorial para el cliente (acordeón). Tono neutro LATAM. */
function renderAutoReplyGuide() {
  const steps = [
    {
      icon: 'fa-comments',
      title: 'En simple: ¿para qué sirve?',
      body: `
        <p>Sirve para atender <strong>mensajes privados</strong> de forma automática. Cuando alguien te escribe ciertas palabras, el bot responde con el texto (y foto/video si pusiste) que tú configuraste.</p>
        <p>Antes de contestar, el bot espera un poco (como si estuviera leyendo) y muestra “escribiendo…”. Así se siente más natural.</p>
        <ul>
          <li>Solo funciona en <strong>chat privado</strong> con el número del bot.</li>
          <li>El envío masivo a grupos (spam) <strong>sigue igual</strong>; esto no lo toca.</li>
          <li>Si hay varias respuestas posibles, se usa la <strong>primera que coincida</strong> en tu lista.</li>
        </ul>`,
    },
    {
      icon: 'fa-list-ol',
      title: 'Cómo empezar (paso a paso)',
      body: `
        <ol class="guide-ol">
          <li>Entra a <strong>Ajustes generales</strong>, activa el sistema y guarda.</li>
          <li>(Opcional) Crea <strong>carpetas</strong> solo para ordenar: Saludos, Streaming, Pagos… No cambian cómo responde.</li>
          <li>Pulsa <strong>Nueva respuesta</strong> y completa: nombre, palabras clave, el mensaje, imagen si quieres, y el límite.</li>
          <li>Prueba escribiendo desde <strong>otro WhatsApp</strong> al número del bot (no desde el mismo bot).</li>
        </ol>
        <p class="guide-tip"><i class="fas fa-clock"></i> En “Leer” y “Typing” pon tiempos cómodos. El typing mínimo es 5 segundos.</p>`,
    },
    {
      icon: 'fa-key',
      title: 'Palabras clave (lo más importante)',
      body: `
        <p>Ahí decides <strong>qué tiene que escribir el cliente</strong> para que salga esa respuesta. Separan con <strong>coma</strong>. Cada parte entre comas es una clave completa.</p>
        <div class="guide-examples">
          <div class="guide-ex">
            <span class="guide-ex-label">Varias palabras sueltas</span>
            <code>hola, buenas, hi</code>
            <p>Son 3 claves distintas. Si escribe “hola” o “buenas” o “hi”, responde.</p>
          </div>
          <div class="guide-ex">
            <span class="guide-ex-label">Frase entera</span>
            <code>hola, como estas, hi</code>
            <p><em>como estas</em> va junto. Si solo escribe “como”, <strong>no</strong> entra. Tiene que aparecer “como estas”.</p>
          </div>
        </div>
        <ul>
          <li>Mayúsculas no importan: “Hola” y “hola” es lo mismo.</li>
          <li>También puedes separar con punto y coma (;) o poner una clave por línea.</li>
          <li>No repitas la misma clave en dos respuestas distintas: se pelean entre sí.</li>
        </ul>`,
    },
    {
      icon: 'fa-route',
      title: 'Cómo armar la conversación',
      body: `
        <p>La idea es guiar al cliente de a poco, como lo harías tú a mano:</p>
        <div class="guide-flow">
          <div class="guide-flow-step"><span>1</span><strong>Saludo</strong><small>hola, info, buenas</small></div>
          <div class="guide-flow-arrow"><i class="fas fa-arrow-right"></i></div>
          <div class="guide-flow-step"><span>2</span><strong>Opciones</strong><small>1, 2, streaming…</small></div>
          <div class="guide-flow-arrow"><i class="fas fa-arrow-right"></i></div>
          <div class="guide-flow-step"><span>3</span><strong>Detalle</strong><small>netflix, gemini…</small></div>
          <div class="guide-flow-arrow"><i class="fas fa-arrow-right"></i></div>
          <div class="guide-flow-step final"><span>4</span><strong>Pago</strong><small>pagar, yape, plin</small></div>
        </div>
        <p><strong>Ejemplo de mensajes que puedes poner:</strong></p>
        <ul>
          <li><strong>Saludo:</strong> “Hola, ¿qué información necesitas? Escribe *1* Streaming, *2* Gemini o *3* Pagos.”</li>
          <li><strong>Opción 2:</strong> explicas el producto y al final: “Si te interesa, escribe *PAGAR*.”</li>
          <li><strong>Pagos:</strong> envías el QR o los datos y marcas la casilla <em>Mensaje final</em>.</li>
        </ul>
        <p class="guide-tip"><i class="fas fa-flag-checkered"></i> <strong>Mensaje final:</strong> después de enviarlo, ese número pasa a lista negra. El bot ya no le responde ni marca el chat como leído. Úsalo cuando ya le pasaste el pago o cerraste la atención.</p>`,
    },
    {
      icon: 'fa-comment-dots',
      title: 'Ejemplo real: qué ve el cliente',
      body: `
        <p>Imagina que armaste 3 respuestas. Así se vería el chat:</p>
        <div class="guide-chat">
          <div class="guide-bubble them"><span>Cliente</span>hola</div>
          <div class="guide-bubble bot"><span>Bot</span>Hola, ¿qué necesitas?<br>1) Streaming<br>2) Gemini<br>3) Pagos</div>
          <div class="guide-bubble them"><span>Cliente</span>2</div>
          <div class="guide-bubble bot"><span>Bot</span>Gemini 18 meses — S/ 50. Si te interesa escribe PAGAR.</div>
          <div class="guide-bubble them"><span>Cliente</span>pagar</div>
          <div class="guide-bubble bot"><span>Bot</span>(QR / datos de pago) ← mensaje final</div>
          <div class="guide-bubble note"><span>Sistema</span>Ese número queda en lista negra. Si vuelve a escribir, el bot ya no contesta.</div>
        </div>
        <p>Para que eso funcione necesitas <strong>tres respuestas</strong> distintas, con claves distintas: una para el saludo, una para el “2”, y una para “pagar / yape / plin” marcada como final.</p>`,
    },
    {
      icon: 'fa-sliders',
      title: 'Límites, horario, anti-spam y lista negra',
      body: `
        <ul>
          <li><strong>Libre:</strong> esa respuesta puede salir las veces que sea a la misma persona.</li>
          <li><strong>Máx. por contacto / día:</strong> por ejemplo el saludo solo 2 veces al día, para que no lo repita si escribe “hola” mil veces.</li>
          <li><strong>Horario:</strong> dentro del horario responden las palabras clave. Fuera de hora, solo el mensaje de “estamos fuera de servicio”.</li>
          <li><strong>Anti-spam:</strong> si alguien dispara muchas claves muy rápido, el bot avisa y lo manda a lista negra.</li>
          <li><strong>Lista negra:</strong> el bot ignora ese chat. El spam a grupos no se ve afectado.</li>
        </ul>
        <p>Comandos <strong>solo desde la cuenta del bot</strong>, abriendo el chat del cliente:</p>
        <div class="guide-cmds">
          <code>/black</code> <span>poner en lista negra</span>
          <code>/del</code> <span>sacar de lista negra</span>
        </div>
        <p class="guide-tip"><i class="fas fa-user-lock"></i> Si otra persona escribe esos comandos, el bot no les hace caso. Solo cuentan si los escribes tú desde el propio bot.</p>`,
    },
    {
      icon: 'fa-triangle-exclamation',
      title: 'Errores comunes (y cómo evitarlos)',
      body: `
        <ul>
          <li><strong>No responde:</strong> revisa que el sistema esté activo, que la respuesta esté activa, y que estés escribiendo en privado al bot (no en grupo).</li>
          <li><strong>Responde otra cosa:</strong> probablemente la misma palabra está en dos reglas, o una regla de arriba “roba” el mensaje. Cambia las claves o el orden.</li>
          <li><strong>Puse “como estas” y con “como” no entra:</strong> es normal. La frase completa es la clave.</li>
          <li><strong>Quedó bloqueado un cliente bueno:</strong> ábrele el chat desde el bot y escribe <code>/del</code>, o quítalo en Lista negra del panel.</li>
          <li><strong>Probar desde el mismo bot:</strong> no sirve. Usa otro número para probar.</li>
          <li><strong>Números 1, 2, 3:</strong> déjalos solo en el menú. Si los pones también en otra respuesta, se confunden.</li>
        </ul>`,
    },
    {
      icon: 'fa-circle-check',
      title: 'Consejos rápidos',
      body: `
        <ul>
          <li>Escribe los mensajes como se los dirías tú a un cliente: claro y corto.</li>
          <li>Al final de cada mensaje indica qué debe escribir después (“escribe 2”, “escribe PAGAR”).</li>
          <li>Marca como final solo el cierre o el pago, no el saludo.</li>
          <li>Antes de usarlo con clientes reales, haz el recorrido completo una vez: saludo → opción → pago.</li>
        </ul>`,
    },
  ]

  const items = steps.map((s, i) => `
    <details class="guide-item"${i === 0 ? ' open' : ''}>
      <summary>
        <span class="guide-num">${i + 1}</span>
        <i class="fas ${s.icon}"></i>
        <span class="guide-item-title">${s.title}</span>
        <i class="fas fa-chevron-down guide-chev"></i>
      </summary>
      <div class="guide-body">${s.body}</div>
    </details>`).join('')

  return `
    <section class="panel guide-panel" id="guia-auto-respuestas">
      <div class="guide-head">
        <div>
          <h2><i class="fas fa-graduation-cap"></i> Guía de uso</h2>
          <p class="hint" style="margin:0;">Cómo configurar y usar las respuestas automáticas, con ejemplos claros.</p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="toggleAllGuide(false)" title="Cerrar todos">
          <i class="fas fa-compress"></i> Cerrar
        </button>
      </div>
      <div class="guide-list">${items}</div>
    </section>`
}



export function renderAutoReplyPage({
  cfg,
  brand = 'BOT SPAM ULTRA',
  version = 'V8',
  homeLink = '/panel-master',
  loaderBlock = '',
  toast = '',
} = {}) {
  const grouped = groupRulesByFolder(cfg)
  const folders = cfg.folders || []
  const totalRules = (cfg.rules || []).length

  let rulesSections = ''
  if (totalRules === 0 && folders.length === 0) {
    rulesSections = `<div class="ar-empty"><i class="fas fa-comment-dots"></i><p>Aún no hay respuestas. Crea carpetas para organizar (ej. Streaming) y luego agrega respuestas.</p></div>`
  } else {
    for (const { folder, rules } of grouped.folders) {
      const cards = rules.length
        ? rules.map((r) => renderRuleCard(r, folder.name)).join('')
        : `<p class="folder-empty">Carpeta vacía — asigna respuestas desde Editar / Nueva respuesta.</p>`
      rulesSections += `
      <section class="folder-block" data-folder="${esc(folder.id)}">
        <div class="folder-head">
          <div class="folder-title">
            <button type="button" class="folder-toggle" onclick="toggleFolder('${esc(folder.id)}')" aria-label="Expandir">
              <i class="fas fa-chevron-down" id="chev-${esc(folder.id)}" style="transform:rotate(-90deg)"></i>
            </button>
            <i class="fas fa-folder-open folder-ico"></i>
            <div>
              <h3>${esc(folder.name)}</h3>
              <span>${rules.length} respuesta${rules.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div class="folder-actions">
            <form method="POST" action="/auto-respuestas/rename-folder" class="inline-form" onsubmit="return renameFolderPrompt(this)">
              <input type="hidden" name="id" value="${esc(folder.id)}">
              <input type="hidden" name="name" value="${esc(folder.name)}">
              <button type="submit" class="btn btn-ghost btn-sm"><i class="fas fa-pen"></i></button>
            </form>
            <form method="POST" action="/auto-respuestas/delete-folder" onsubmit="return confirm('¿Eliminar carpeta? Las respuestas quedarán sin carpeta.')">
              <input type="hidden" name="id" value="${esc(folder.id)}">
              <button type="submit" class="btn btn-danger btn-sm"><i class="fas fa-trash-can"></i></button>
            </form>
          </div>
        </div>
        <div class="folder-body rules-grid is-collapsed" id="body-${esc(folder.id)}">${cards}</div>
      </section>`
    }

    if (grouped.ungrouped.length || folders.length) {
      const cards = grouped.ungrouped.length
        ? grouped.ungrouped.map((r) => renderRuleCard(r, null)).join('')
        : (totalRules === 0 ? '' : `<p class="folder-empty">No hay respuestas sin carpeta.</p>`)
      if (cards) {
        rulesSections += `
        <section class="folder-block is-ungrouped">
          <div class="folder-head">
            <div class="folder-title">
              <button type="button" class="folder-toggle" onclick="toggleFolder('ungrouped')" aria-label="Expandir">
                <i class="fas fa-chevron-down" id="chev-ungrouped" style="transform:rotate(-90deg)"></i>
              </button>
              <i class="fas fa-inbox folder-ico dim"></i>
              <div>
                <h3>Sin carpeta</h3>
                <span>${grouped.ungrouped.length} respuesta${grouped.ungrouped.length === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>
          <div class="folder-body rules-grid is-collapsed" id="body-ungrouped">${cards}</div>
        </section>`
      }
    }
  }

  const folderListHtml = folders.length === 0
    ? `<p class="hint" style="margin:0;">Todavía no hay carpetas. Ejemplos: Streaming, Saludos, Promos.</p>`
    : `<div class="folder-chips">${folders
      .slice()
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((f) => {
        const count = (cfg.rules || []).filter((r) => r.folderId === f.id).length
        return `<span class="folder-chip"><i class="fas fa-folder"></i> ${esc(f.name)} <em>${count}</em></span>`
      }).join('')}</div>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Respuestas auto | ${esc(brand)} ${esc(version)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-body: #0c0d0f;
      --bg-card: #14161a;
      --bg-input: #0f1114;
      --primary: #c4a574;
      --text-main: #e8eaed;
      --text-dim: #8b929e;
      --border: #2a2e36;
      --radius: 10px;
      --warn: #d4a574;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'IBM Plex Sans', 'Inter', system-ui, sans-serif;
      background: var(--bg-body);
      color: var(--text-main);
      min-height: 100vh;
      padding: 20px 16px 48px;
      background-image: none;
    }
    .wrap { max-width: 980px; margin: 0 auto; position: relative; z-index: 1; }
    .top-nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    .nav-link-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 0; text-decoration: none;
      color: var(--text-dim); background: var(--bg-card); border: 1px solid var(--border);
      font-size: 13px; font-weight: 500;
    }
    .nav-link-btn:hover { color: var(--text-main); border-color: #3d4450; }
    .hero {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 0; padding: 20px 18px; margin-bottom: 14px;
      box-shadow: none;
    }
    .hero h1 {
      font-family: 'IBM Plex Sans', 'Inter', sans-serif;
      font-size: clamp(1.2rem, 4vw, 1.45rem);
      font-weight: 600;
      letter-spacing: -0.02em;
      display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
    }
    .hero h1 i { color: var(--primary); }
    .hero p { color: var(--text-dim); font-size: 0.92rem; line-height: 1.55; max-width: 640px; }
    .hero-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .hero-actions a {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 9px 14px; border-radius: 10px; text-decoration: none; font-size: 0.82rem; font-weight: 600;
      background: rgba(20,184,166,0.14); color: #5eead4; border: 1px solid rgba(20,184,166,0.3);
    }
    .hero-actions a:hover { background: rgba(20,184,166,0.22); }
    .guide-panel { padding-bottom: 10px; }
    .guide-head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      margin-bottom: 14px;
    }
    .guide-head h2 { margin-bottom: 4px; }
    .guide-list { display: grid; gap: 8px; }
    .guide-item {
      border: 1px solid var(--border); border-radius: 12px; background: #0d1118;
      overflow: hidden;
    }
    .guide-item summary {
      list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px;
      padding: 13px 14px; font-weight: 600; font-size: 0.9rem; user-select: none;
    }
    .guide-item summary::-webkit-details-marker { display: none; }
    .guide-item summary:hover { background: rgba(20,184,166,0.05); }
    .guide-num {
      width: 24px; height: 24px; border-radius: 7px; flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 0.72rem; font-weight: 700; color: #5eead4;
      background: rgba(20,184,166,0.14); border: 1px solid rgba(20,184,166,0.25);
    }
    .guide-item summary > i:not(.guide-chev) { color: #5eead4; width: 18px; text-align: center; }
    .guide-item-title { flex: 1; }
    .guide-chev { color: var(--text-dim); font-size: 0.75rem; transition: transform .2s ease; }
    .guide-item[open] .guide-chev { transform: rotate(180deg); color: #5eead4; }
    .guide-body {
      padding: 0 16px 16px 48px; color: var(--text-dim); font-size: 0.86rem; line-height: 1.55;
    }
    .guide-body p { margin: 0 0 10px; }
    .guide-body ul, .guide-body .guide-ol { margin: 0 0 10px; padding-left: 1.15rem; }
    .guide-body li { margin-bottom: 6px; }
    .guide-body strong { color: #e2e8f0; font-weight: 600; }
    .guide-body code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8em; padding: 2px 6px; border-radius: 5px;
      background: rgba(20,184,166,0.1); color: #99f6e4; border: 1px solid rgba(20,184,166,0.2);
    }
    .guide-tip {
      margin-top: 10px !important; padding: 10px 12px; border-radius: 10px;
      background: rgba(20,184,166,0.08); border: 1px solid rgba(20,184,166,0.18);
      color: #99f6e4 !important; font-size: 0.82rem !important;
    }
    .guide-tip i { margin-right: 6px; }
    .guide-examples { display: grid; gap: 10px; margin: 12px 0; }
    .guide-ex {
      padding: 12px 14px; border-radius: 10px;
      background: rgba(15,23,42,0.8); border: 1px solid var(--border);
    }
    .guide-ex-label {
      display: inline-block; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em;
      text-transform: uppercase; color: #5eead4; margin-bottom: 6px;
    }
    .guide-ex code { display: block; margin: 4px 0 8px; padding: 8px 10px; }
    .guide-ex p { margin: 0; font-size: 0.8rem; }
    .guide-flow {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
      margin: 12px 0 14px;
    }
    .guide-flow-step {
      flex: 1 1 110px; min-width: 100px; padding: 12px 10px; border-radius: 10px; text-align: center;
      background: rgba(20,184,166,0.07); border: 1px solid rgba(20,184,166,0.2);
    }
    .guide-flow-step.final {
      background: rgba(168,85,247,0.1); border-color: rgba(168,85,247,0.3);
    }
    .guide-flow-step span {
      display: inline-flex; width: 22px; height: 22px; border-radius: 50%;
      align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700;
      background: rgba(20,184,166,0.2); color: #5eead4; margin-bottom: 6px;
    }
    .guide-flow-step.final span { background: rgba(168,85,247,0.25); color: #d8b4fe; }
    .guide-flow-step strong { display: block; color: #f1f5f9; font-size: 0.82rem; margin-bottom: 4px; }
    .guide-flow-step small { color: var(--text-dim); font-size: 0.72rem; }
    .guide-flow-arrow { color: #475569; font-size: 0.75rem; }
    .guide-cmds {
      display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center;
      margin: 10px 0; padding: 12px 14px; border-radius: 10px;
      background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.22);
    }
    .guide-cmds code { color: #fde68a; background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.25); }
    .guide-cmds span { color: #fcd34d; font-size: 0.8rem; }
    .guide-chat {
      display: grid; gap: 8px; margin: 12px 0 14px;
      padding: 12px; border-radius: 12px;
      background: rgba(8,12,18,0.9); border: 1px solid var(--border);
    }
    .guide-bubble {
      max-width: 92%; padding: 10px 12px; border-radius: 12px;
      font-size: 0.82rem; line-height: 1.45; color: #e2e8f0;
    }
    .guide-bubble span {
      display: block; font-size: 0.68rem; font-weight: 700;
      letter-spacing: 0.03em; text-transform: uppercase; margin-bottom: 4px; opacity: 0.75;
    }
    .guide-bubble.them {
      justify-self: start;
      background: rgba(51,65,85,0.55); border: 1px solid rgba(148,163,184,0.2);
      border-bottom-left-radius: 4px;
    }
    .guide-bubble.bot {
      justify-self: end;
      background: rgba(20,184,166,0.14); border: 1px solid rgba(20,184,166,0.28);
      border-bottom-right-radius: 4px;
    }
    .guide-bubble.note {
      justify-self: stretch; max-width: 100%;
      background: rgba(245,158,11,0.08); border: 1px dashed rgba(245,158,11,0.35);
      color: #fcd34d; font-size: 0.78rem;
    }
    @media (max-width: 640px) {
      .guide-body { padding-left: 14px; }
      .guide-flow-arrow { display: none; }
    }
    .disclaimer {
      display: flex; gap: 14px; align-items: flex-start;
      padding: 16px 18px; border-radius: 14px; margin-bottom: 16px;
      background: linear-gradient(135deg, rgba(245,158,11,0.12), rgba(17,21,28,0.9));
      border: 1px solid rgba(245,158,11,0.35);
    }
    .disclaimer-ico {
      width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(245,158,11,0.15); color: #fbbf24; font-size: 1.1rem;
    }
    .disclaimer strong { display: block; color: #fde68a; margin-bottom: 6px; font-size: 0.9rem; }
    .disclaimer p { color: #fcd34d; font-size: 0.8rem; line-height: 1.55; opacity: 0.95; }
    .panel {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 20px; margin-bottom: 16px;
    }
    .panel h2 {
      font-family: 'Space Grotesk', sans-serif; font-size: 1.05rem;
      display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
      padding-bottom: 10px; border-bottom: 1px solid var(--border);
    }
    .panel h2 i { color: var(--primary); }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
    @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } }
    label { display: block; font-size: 0.78rem; color: var(--text-dim); margin-bottom: 6px; font-weight: 600; }
    input[type=text], input[type=number], textarea, input[type=file], select {
      width: 100%; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--bg-input); color: var(--text-main); font: inherit;
    }
    textarea { min-height: 110px; resize: vertical; }
    .hint { font-size: 0.72rem; color: var(--text-dim); margin-top: 6px; line-height: 1.4; }
    .switch-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,0.03);
      border: 1px solid var(--border); margin-bottom: 14px;
    }
    .switch-row strong { display: block; margin-bottom: 2px; }
    .switch-row span { font-size: 0.78rem; color: var(--text-dim); }
    .toggle { position: relative; width: 48px; height: 28px; flex-shrink: 0; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle span {
      position: absolute; inset: 0; border-radius: 999px; background: #334155; cursor: pointer;
      transition: .2s; border: 1px solid rgba(255,255,255,0.08);
    }
    .toggle span::before {
      content: ''; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px;
      border-radius: 50%; background: #fff; transition: .2s;
    }
    .toggle input:checked + span { background: #0f766e; }
    .toggle input:checked + span::before { transform: translateX(20px); }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 14px; border-radius: 10px; border: 1px solid transparent;
      font-weight: 600; font-size: 0.84rem; cursor: pointer; text-decoration: none; font-family: inherit;
    }
    .btn-sm { padding: 7px 10px; font-size: 0.78rem; }
    .btn-primary { background: #0f766e; color: #ecfdf5; border-color: rgba(45,212,191,0.25); }
    .btn-primary:hover { background: #0d9488; }
    .btn-ghost { background: #1e293b; color: #e2e8f0; border-color: rgba(148,163,184,0.2); }
    .btn-danger { background: rgba(239,68,68,0.1); color: #f87171; border-color: rgba(239,68,68,0.25); }
    .btn-warn { background: rgba(245,158,11,0.15); color: #fde68a; border-color: rgba(245,158,11,0.35); }
    .rules-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .rules-grid { display: grid; gap: 12px; }
    .folder-create {
      display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;
    }
    .folder-create input { flex: 1; min-width: 180px; }
    .folder-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .folder-chip {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 7px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 600;
      background: rgba(20,184,166,0.1); color: #99f6e4; border: 1px solid rgba(20,184,166,0.22);
    }
    .folder-chip em { font-style: normal; opacity: 0.7; }
    .folder-block {
      border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
      background: rgba(17,21,28,0.85); margin-bottom: 12px;
    }
    .folder-block.is-ungrouped { border-style: dashed; }
    .folder-head {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      padding: 14px 16px; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .folder-title { display: flex; align-items: center; gap: 12px; }
    .folder-title h3 { font-family: 'Space Grotesk', sans-serif; font-size: 1rem; }
    .folder-title span { font-size: 0.72rem; color: var(--text-dim); }
    .folder-ico { color: #5eead4; font-size: 1.15rem; }
    .folder-ico.dim { color: #64748b; }
    .folder-toggle {
      width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border);
      background: #1e293b; color: #cbd5e1; cursor: pointer;
    }
    .folder-actions { display: flex; gap: 6px; }
    .folder-body { padding: 14px; }
    .folder-body.is-collapsed { display: none; }
    .folder-empty { font-size: 0.82rem; color: var(--text-dim); padding: 8px 2px; }
    .ar-card { background: #0d1118; border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
    .ar-card.is-off { opacity: 0.72; }
    .ar-card-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .ar-card h3 { font-family: 'Space Grotesk', sans-serif; font-size: 1rem; margin-bottom: 8px; }
    .ar-kws { display: flex; flex-wrap: wrap; gap: 6px; }
    .ar-chip {
      font-size: 0.72rem; padding: 3px 9px; border-radius: 999px;
      background: rgba(20,184,166,0.12); color: #5eead4; font-weight: 600;
    }
    .ar-chip.dim { background: rgba(148,163,184,0.12); color: #94a3b8; }
    .ar-badges { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
    .ar-badge {
      font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
      padding: 5px 9px; border-radius: 8px; white-space: nowrap;
    }
    .ar-badge.on { background: rgba(20,184,166,0.12); color: #5eead4; border: 1px solid rgba(20,184,166,0.25); }
    .ar-badge.off { background: rgba(100,116,139,0.15); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.2); }
    .ar-badge.lim-free { background: rgba(56,189,248,0.1); color: #7dd3fc; border: 1px solid rgba(56,189,248,0.25); }
    .ar-badge.lim-max { background: rgba(251,191,36,0.1); color: #fcd34d; border: 1px solid rgba(251,191,36,0.25); }
    .ar-badge.folder { background: rgba(148,163,184,0.1); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.2); text-transform: none; letter-spacing: 0; font-weight: 600; }
    .ar-badge.final { background: rgba(168,85,247,0.12); color: #d8b4fe; border: 1px solid rgba(168,85,247,0.3); }
    .ar-text { color: var(--text-dim); font-size: 0.88rem; margin: 12px 0; line-height: 1.5; white-space: pre-wrap; }
    .ar-media-wrap { margin-bottom: 12px; }
    .ar-media { max-width: 100%; max-height: 180px; border-radius: 10px; border: 1px solid var(--border); }
    .ar-nomedia { font-size: 0.75rem; color: #64748b; }
    .ar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .ar-empty { text-align: center; padding: 36px 16px; color: var(--text-dim); }
    .ar-empty i { font-size: 2rem; color: rgba(20,184,166,0.4); margin-bottom: 10px; }
    .toast {
      margin-bottom: 14px; padding: 12px 14px; border-radius: 12px;
      background: rgba(20,184,166,0.12); border: 1px solid rgba(20,184,166,0.28); color: #99f6e4;
      font-size: 0.88rem;
    }
    .note {
      font-size: 0.78rem; line-height: 1.5;
      padding: 12px 14px; border-radius: 12px; background: rgba(251,191,36,0.08);
      border: 1px solid rgba(251,191,36,0.22); color: #fcd34d; margin-top: 12px;
    }
    .limit-box {
      margin-top: 14px; padding: 14px; border-radius: 12px;
      background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    }
    .limit-box > label { margin-bottom: 10px; }
    .limit-opts { display: grid; gap: 8px; margin-bottom: 10px; }
    .limit-opt {
      display: flex; gap: 10px; align-items: flex-start; cursor: pointer;
      padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--bg-input);
    }
    .limit-opt:has(input:checked) {
      border-color: rgba(20,184,166,0.45);
      background: rgba(20,184,166,0.08);
    }
    .limit-opt input { margin-top: 3px; accent-color: #14b8a6; }
    .limit-opt strong { display: block; color: var(--text-main); font-size: 0.86rem; margin-bottom: 2px; }
    .limit-opt small { color: var(--text-dim); font-size: 0.72rem; line-height: 1.35; }
    #maxPerContactWrap.disabled,
    #hoursMaxWrap.disabled { opacity: 0.45; pointer-events: none; }
    .modal {
      display: none; position: fixed; inset: 0; z-index: 2000;
      background: rgba(0,0,0,0.78); padding: 16px; overflow-y: auto;
    }
    .modal.open { display: flex; align-items: flex-start; justify-content: center; }
    .modal-box {
      width: 100%; max-width: 560px; margin: 40px auto;
      background: #11151c; border: 1px solid var(--border); border-radius: 16px; padding: 22px;
    }
    .modal-box h3 { font-family: 'Space Grotesk', sans-serif; margin-bottom: 14px; }
    .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }
    .risk-modal .modal-box {
      max-width: 480px; border-color: rgba(245,158,11,0.4);
      background: linear-gradient(180deg, #1a1408 0%, #11151c 40%);
      box-shadow: 0 24px 60px rgba(0,0,0,0.5);
    }
    .risk-icon {
      width: 56px; height: 56px; border-radius: 16px; margin-bottom: 14px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(245,158,11,0.15); color: #fbbf24; font-size: 1.4rem;
      border: 1px solid rgba(245,158,11,0.3);
    }
    .risk-modal h3 { color: #fde68a; }
    .risk-modal p { color: #e7e5e4; font-size: 0.9rem; line-height: 1.6; margin-bottom: 12px; }
    .risk-modal .risk-points {
      list-style: none; display: grid; gap: 8px; margin: 14px 0 18px;
    }
    .risk-modal .risk-points li {
      font-size: 0.8rem; color: #d6d3d1; padding: 10px 12px; border-radius: 10px;
      background: rgba(255,255,255,0.03); border: 1px solid var(--border);
      display: flex; gap: 10px; align-items: flex-start;
    }
    .risk-modal .risk-points i { color: #fbbf24; margin-top: 2px; }
    .inline-form { margin: 0; }
    #hoursFields.hours-disabled { opacity: 0.45; pointer-events: none; }
    .hours-media-preview { margin-top: 10px; }
    input[type=time] {
      width: 100%; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--bg-input); color: var(--text-main); font: inherit;
      color-scheme: dark;
    }
    .bl-list { display: grid; gap: 8px; margin-bottom: 14px; }
    .bl-row {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px; border-radius: 12px;
      background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2);
    }
    .bl-avatar {
      width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(239,68,68,0.12); color: #f87171;
    }
    .bl-info { flex: 1; min-width: 0; }
    .bl-info strong { display: block; font-size: 0.9rem; margin-bottom: 2px; }
    .bl-info span { font-size: 0.78rem; color: var(--text-dim); font-variant-numeric: tabular-nums; }
    .bl-form { margin-top: 4px; padding-top: 14px; border-top: 1px solid var(--border); }
  </style>
</head>
<body>
  ${loaderBlock}
  <div class="wrap">
    <div class="top-nav">
      <a class="nav-link-btn" href="${esc(homeLink)}"><i class="fas fa-arrow-left"></i> Volver al panel</a>
      <a class="nav-link-btn" href="/pubs"><i class="fas fa-images"></i> Publicaciones</a>
      <a class="nav-link-btn" href="/links-grupos" style="border-color:rgba(37,211,102,0.35); color:#86efac;"><i class="fas fa-link"></i> Links de grupos</a>
      <a class="nav-link-btn" href="/activity"><i class="fas fa-chart-line"></i> Actividad</a>
    </div>

    <div class="hero">
      <h1><i class="fas fa-reply-all"></i> Respuestas automáticas</h1>
      <p>Organiza por carpetas (Streaming, Saludos, etc.), configura keywords y límites por contacto. Solo chats privados.</p>
      <div class="hero-actions">
        <a href="#guia-auto-respuestas"><i class="fas fa-graduation-cap"></i> Ver guía de uso</a>
      </div>
    </div>

    <aside class="disclaimer" role="note">
      <div class="disclaimer-ico"><i class="fas fa-triangle-exclamation"></i></div>
      <div>
        <strong>Aviso de responsabilidad</strong>
        <p>${esc(AUTO_REPLY_DISCLAIMER)}</p>
      </div>
    </aside>

    ${renderAutoReplyGuide()}

    ${toast ? `<div class="toast"><i class="fas fa-check-circle"></i> ${esc(toast)}</div>` : ''}

    <form class="panel" method="POST" action="/auto-respuestas/settings" id="settingsForm">
      <h2><i class="fas fa-sliders"></i> Ajustes generales</h2>
      <input type="hidden" name="riskAccepted" id="riskAccepted" value="${cfg.riskAccepted || cfg.enabled ? '1' : '0'}">
      <div class="switch-row">
        <div>
          <strong>Sistema activo</strong>
          <span>Desactivado por defecto. Al activar confirmas que asumes la responsabilidad.</span>
        </div>
        <label class="toggle">
          <input type="checkbox" name="enabled" id="systemEnabled" value="1" ${cfg.enabled ? 'checked' : ''}>
          <span></span>
        </label>
      </div>
      <div class="grid-2">
        <div>
          <label>Leer mínimo (segundos)</label>
          <input type="number" name="minReadSec" min="1" max="30" value="${cfg.minReadSec || 2}" required>
          <p class="hint">Espera antes de escribir (como si leyera el mensaje).</p>
        </div>
        <div>
          <label>Leer máximo (segundos)</label>
          <input type="number" name="maxReadSec" min="1" max="60" value="${cfg.maxReadSec || 6}" required>
          <p class="hint">Tiempo aleatorio entre mínimo y máximo.</p>
        </div>
        <div>
          <label>Typing mínimo (segundos)</label>
          <input type="number" name="minTypingSec" min="5" max="60" value="${cfg.minTypingSec}" required>
          <p class="hint">Mínimo 5s. Simula “escribiendo…”.</p>
        </div>
        <div>
          <label>Typing máximo (segundos)</label>
          <input type="number" name="maxTypingSec" min="5" max="120" value="${cfg.maxTypingSec}" required>
          <p class="hint">Se elige un tiempo aleatorio entre min y max.</p>
        </div>
      </div>
      <div class="note"><i class="fas fa-shield-halved"></i> Orden humano: primero lee, después escribe, y recién ahí envía. El spam de grupos no se ve afectado.</div>
      <div style="margin-top:14px; display:flex; justify-content:flex-end;">
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar ajustes</button>
      </div>
    </form>

    <form class="panel" method="POST" action="/auto-respuestas/hours" enctype="multipart/form-data" id="hoursForm">
      <h2><i class="fas fa-clock"></i> Horario de atención</h2>
      <p class="hint" style="margin:-6px 0 14px;">Si está activo: dentro del horario responden las palabras claves. Fuera del horario, envía el mensaje de “fuera de horario”. No afecta el spam.</p>
      <div class="switch-row">
        <div>
          <strong>Horario activo</strong>
          <span>${cfg.hours?.enabled ? `Ventana: ${esc(formatHoursLabel(cfg))}` : 'Desactivado — las palabras claves responden 24h.'}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" name="enabled" id="hoursEnabled" value="1" ${cfg.hours?.enabled ? 'checked' : ''} onchange="syncHoursPanel()">
          <span></span>
        </label>
      </div>
      <div id="hoursFields" class="${cfg.hours?.enabled ? '' : 'hours-disabled'}">
        <div class="grid-2">
          <div>
            <label>Inicio de atención</label>
            <input type="time" name="start" id="hoursStart" value="${esc(cfg.hours?.start || '05:00')}" required>
            <p class="hint">Ej: 05:00 (5 AM)</p>
          </div>
          <div>
            <label>Fin / pausa</label>
            <input type="time" name="stop" id="hoursStop" value="${esc(cfg.hours?.stop || '23:00')}" required>
            <p class="hint">Ej: 23:00 (11 PM). Desde esa hora hasta el inicio, solo el mensaje de fuera de horario.</p>
          </div>
        </div>
        <label style="margin-top:12px;">Mensaje fuera de horario</label>
        <textarea name="text" id="hoursText" placeholder="Estamos fuera de horario. Te atenderemos a partir de las 5:00 AM.">${esc(cfg.hours?.text || '')}</textarea>
        <label style="margin-top:12px;">Imagen / video (opcional)</label>
        <input type="file" name="media" accept="image/*,video/*">
        ${cfg.hours?.image ? `
          <div class="hours-media-preview">
            ${cfg.hours.imageType === 'video'
              ? `<video class="ar-media" controls src="/images/${esc(cfg.hours.image)}"></video>`
              : `<img class="ar-media" src="/images/${esc(cfg.hours.image)}" alt="">`}
            <label style="display:flex; gap:8px; align-items:center; cursor:pointer; color:#fca5a5; font-size:0.82rem; margin-top:8px;">
              <input type="checkbox" name="clearMedia" value="1"> Quitar media actual
            </label>
          </div>` : `<p class="hint">Si no subes archivo, se mantiene el media actual.</p>`}
        <div class="limit-box">
          <label>Límite del mensaje fuera de horario / contacto</label>
          <div class="limit-opts">
            <label class="limit-opt">
              <input type="radio" name="limitMode" id="hoursLimitFree" value="free" ${cfg.hours?.limitMode !== 'max' ? 'checked' : ''} onchange="syncHoursLimit()">
              <div>
                <strong>Libre</strong>
                <small>Puede enviar el aviso fuera de horario sin tope diario.</small>
              </div>
            </label>
            <label class="limit-opt">
              <input type="radio" name="limitMode" id="hoursLimitMax" value="max" ${cfg.hours?.limitMode === 'max' ? 'checked' : ''} onchange="syncHoursLimit()">
              <div>
                <strong>Máximo por contacto</strong>
                <small>Tras N avisos ese día a la misma persona, deja de enviar el fuera de horario.</small>
              </div>
            </label>
          </div>
          <div id="hoursMaxWrap">
            <label>Cantidad máxima / contacto / día</label>
            <input type="number" name="maxPerContact" id="hoursMaxPerContact" min="1" max="500" value="${cfg.hours?.maxPerContact || 2}">
          </div>
        </div>
      </div>
      <div style="margin-top:14px; display:flex; justify-content:flex-end;">
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar horario</button>
      </div>
    </form>

    <form class="panel" method="POST" action="/auto-respuestas/anti-spam" enctype="multipart/form-data" id="antiSpamForm">
      <h2><i class="fas fa-shield-virus"></i> Anti-spam</h2>
      <p class="hint" style="margin:-6px 0 14px;">Si alguien manda muchas palabras claves (o mensajes) muy rápido, el bot avisa y lo agrega a la lista negra. Después ya no le responde.</p>
      <div class="switch-row">
        <div>
          <strong>Anti-spam activo</strong>
          <span>${cfg.antiSpam?.enabled ? `Límite: ${cfg.antiSpam.maxMessages} msgs / ${cfg.antiSpam.windowSec}s` : 'Desactivado'}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" name="enabled" id="antiSpamEnabled" value="1" ${cfg.antiSpam?.enabled ? 'checked' : ''} onchange="syncAntiSpamPanel()">
          <span></span>
        </label>
      </div>
      <div id="antiSpamFields" class="${cfg.antiSpam?.enabled ? '' : 'hours-disabled'}">
        <div class="grid-2">
          <div>
            <label>Máximo de mensajes</label>
            <input type="number" name="maxMessages" min="2" max="50" value="${cfg.antiSpam?.maxMessages || 4}" required>
            <p class="hint">Ej: 4 mensajes.</p>
          </div>
          <div>
            <label>En cuántos segundos</label>
            <input type="number" name="windowSec" min="1" max="60" value="${cfg.antiSpam?.windowSec || 3}" required>
            <p class="hint">Ej: en 3 segundos.</p>
          </div>
        </div>
        <label style="margin-top:12px;">Mensaje de aviso</label>
        <textarea name="text" placeholder="Intentaste jugar con las respuestas…">${esc(cfg.antiSpam?.text || '')}</textarea>
        <label style="margin-top:12px;">Imagen / video (opcional)</label>
        <input type="file" name="media" accept="image/*,video/*">
        ${cfg.antiSpam?.image ? `
          <div class="hours-media-preview">
            ${cfg.antiSpam.imageType === 'video'
              ? `<video class="ar-media" controls src="/images/${esc(cfg.antiSpam.image)}"></video>`
              : `<img class="ar-media" src="/images/${esc(cfg.antiSpam.image)}" alt="">`}
            <label style="display:flex; gap:8px; align-items:center; cursor:pointer; color:#fca5a5; font-size:0.82rem; margin-top:8px;">
              <input type="checkbox" name="clearMedia" value="1"> Quitar media actual
            </label>
          </div>` : `<p class="hint">Si no subes archivo, se mantiene el media actual.</p>`}
      </div>
      <div style="margin-top:14px; display:flex; justify-content:flex-end;">
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar anti-spam</button>
      </div>
    </form>

    <div class="panel">
      <h2><i class="fas fa-ban"></i> Lista negra</h2>
      <p class="hint" style="margin:-6px 0 14px;">Números que el bot ignora por completo: no responde y no marca el mensaje como leído. No afecta el spam.</p>
      <div class="note" style="margin:0 0 14px;">
        <i class="fas fa-terminal"></i>
        Comandos solo desde la cuenta del bot (en el chat del cliente):
        <strong>/black</strong> = agregar a lista negra ·
        <strong>/del</strong> = quitar de lista negra.
        El bot reacciona con ✅. Otros números no pueden usarlos.
      </div>
      ${(cfg.blacklist || []).length === 0
        ? `<p class="hint" style="margin:0 0 12px;">Todavía no hay números en la lista negra.</p>`
        : `<div class="bl-list">${(cfg.blacklist || []).map((e) => `
          <div class="bl-row">
            <div class="bl-avatar"><i class="fas fa-user-slash"></i></div>
            <div class="bl-info">
              <strong>${esc(e.name)}</strong>
              <span>${esc(formatBlacklistNumber(e.number))}</span>
            </div>
            <form method="POST" action="/auto-respuestas/delete-blacklist" style="margin:0" onsubmit="return confirm('¿Quitar este número de la lista negra?')">
              <input type="hidden" name="id" value="${esc(e.id)}">
              <button type="submit" class="btn btn-danger btn-sm"><i class="fas fa-trash-can"></i></button>
            </form>
          </div>`).join('')}</div>`}
      <form method="POST" action="/auto-respuestas/add-blacklist" class="bl-form">
        <div class="grid-2">
          <div>
            <label>Nombre</label>
            <input type="text" name="name" maxlength="60" placeholder="Ej: Mamá" required>
          </div>
          <div>
            <label>Número (con código de país)</label>
            <input type="text" name="number" maxlength="20" placeholder="Ej: 5491123456789" required>
          </div>
        </div>
        <p class="hint">Pon el número completo, sin espacios. Ejemplo Argentina: 54911…</p>
        <div style="margin-top:12px; display:flex; justify-content:flex-end;">
          <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Agregar a lista negra</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <h2><i class="fas fa-folder-tree"></i> Carpetas</h2>
      ${folderListHtml}
      <form method="POST" action="/auto-respuestas/save-folder" class="folder-create">
        <input type="text" name="name" maxlength="60" placeholder="Nombre de carpeta (ej. Streaming)" required>
        <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Crear carpeta</button>
      </form>
    </div>

    <div class="panel">
      <div class="rules-head">
        <h2 style="margin:0; border:0; padding:0;"><i class="fas fa-list"></i> Respuestas (${totalRules})</h2>
        <button type="button" class="btn btn-primary" onclick="openCreateRule()"><i class="fas fa-plus"></i> Nueva respuesta</button>
      </div>
      ${rulesSections}
    </div>
  </div>

  <div class="modal" id="ruleModal">
    <div class="modal-box">
      <h3 id="ruleModalTitle">Nueva respuesta</h3>
      <form method="POST" action="/auto-respuestas/save-rule" enctype="multipart/form-data" id="ruleForm">
        <input type="hidden" name="id" id="ruleId" value="">
        <label>Nombre</label>
        <input type="text" name="name" id="ruleName" maxlength="80" placeholder="Saludo" required style="margin-bottom:12px;">
        <label>Carpeta</label>
        <select name="folderId" id="ruleFolder" style="margin-bottom:12px;">
          ${folderOptionsHtml(folders, '')}
        </select>
        <p class="hint" style="margin-bottom:12px;">Solo organiza la vista. No afecta la lógica de respuesta.</p>
        <label>Palabras clave (separadas por coma)</label>
        <input type="text" name="keywords" id="ruleKeywords" placeholder="hola, buenas, cómo estás" required style="margin-bottom:6px;">
        <p class="hint" style="margin-bottom:12px;">Si el mensaje privado contiene alguna, se activa esta respuesta.</p>
        <label>Texto de respuesta</label>
        <textarea name="text" id="ruleText" placeholder="¡Hola! Gracias por escribir…"></textarea>
        <label style="margin-top:12px;">Imagen / video (opcional)</label>
        <input type="file" name="media" id="ruleMedia" accept="image/*,video/*">
        <p class="hint" id="ruleMediaHint">Si no subes archivo, se mantiene el media actual (al editar).</p>

        <div class="limit-box">
          <label>Límite por contacto (esta respuesta)</label>
          <div class="limit-opts">
            <label class="limit-opt">
              <input type="radio" name="limitMode" id="limitFree" value="free" checked onchange="syncLimitMode()">
              <div>
                <strong>Libre</strong>
                <small>Sin tope: puede responder siempre que coincida la keyword.</small>
              </div>
            </label>
            <label class="limit-opt">
              <input type="radio" name="limitMode" id="limitMax" value="max" onchange="syncLimitMode()">
              <div>
                <strong>Máximo por contacto</strong>
                <small>Tras N respuestas a esa persona en el día, esta regla deja de contestar.</small>
              </div>
            </label>
          </div>
          <div id="maxPerContactWrap">
            <label>Cantidad máxima / contacto / día</label>
            <input type="number" name="maxPerContact" id="ruleMaxPerContact" min="1" max="500" value="4">
            <p class="hint">Ej: 4 → esa persona solo recibe esta respuesta hasta 4 veces por día.</p>
          </div>
        </div>

        <div class="switch-row" style="margin-top:14px;">
          <div>
            <strong>Mensaje final</strong>
            <span>Al enviarlo, el bot deja de responder y de leer a ese contacto (pasa a lista negra).</span>
          </div>
          <label class="toggle"><input type="checkbox" name="isFinal" id="ruleIsFinal" value="1"><span></span></label>
        </div>

        <div class="switch-row" style="margin-top:14px;">
          <div><strong>Activa</strong><span>Puedes pausarla sin borrarla.</span></div>
          <label class="toggle"><input type="checkbox" name="enabled" id="ruleEnabled" value="1" checked><span></span></label>
        </div>
        <div id="clearMediaWrap" style="display:none; margin-top:10px;">
          <label style="display:flex; gap:8px; align-items:center; cursor:pointer; color:#fca5a5; font-size:0.82rem;">
            <input type="checkbox" name="clearMedia" value="1"> Quitar media actual
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="closeRuleModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar</button>
        </div>
      </form>
    </div>
  </div>

  <div class="modal risk-modal" id="riskModal">
    <div class="modal-box">
      <div class="risk-icon"><i class="fas fa-triangle-exclamation"></i></div>
      <h3>Activar respuestas automáticas</h3>
      <p>${esc(AUTO_REPLY_DISCLAIMER)}</p>
      <ul class="risk-points">
        <li><i class="fas fa-lock"></i><span>La función está desactivada por defecto.</span></li>
        <li><i class="fas fa-user-shield"></i><span>Al activarla, tú asumes la responsabilidad de su uso.</span></li>
        <li><i class="fas fa-toggle-on"></i><span>Puedes desactivarla cuando quieras.</span></li>
      </ul>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="cancelEnableSystem()">Cancelar</button>
        <button type="button" class="btn btn-warn" onclick="confirmEnableSystem()"><i class="fas fa-check"></i> Entiendo y activo</button>
      </div>
    </div>
  </div>

  <script>
    var systemEnabled = document.getElementById('systemEnabled');
    var riskAccepted = document.getElementById('riskAccepted');
    var wasEnabled = ${cfg.enabled ? 'true' : 'false'};

    systemEnabled.addEventListener('change', function(e) {
      if (systemEnabled.checked && !wasEnabled) {
        systemEnabled.checked = false;
        document.getElementById('riskModal').classList.add('open');
      } else if (!systemEnabled.checked) {
        riskAccepted.value = '0';
        wasEnabled = false;
      }
    });

    function confirmEnableSystem() {
      systemEnabled.checked = true;
      riskAccepted.value = '1';
      wasEnabled = true;
      document.getElementById('riskModal').classList.remove('open');
    }
    function cancelEnableSystem() {
      systemEnabled.checked = false;
      riskAccepted.value = '0';
      wasEnabled = false;
      document.getElementById('riskModal').classList.remove('open');
    }

    function toggleAllGuide(open) {
      document.querySelectorAll('.guide-item').forEach(function(el) {
        if (open) el.setAttribute('open', '');
        else el.removeAttribute('open');
      });
    }

    function toggleFolder(id) {
      var body = document.getElementById('body-' + id);
      var chev = document.getElementById('chev-' + id);
      if (!body) return;
      body.classList.toggle('is-collapsed');
      if (chev) chev.style.transform = body.classList.contains('is-collapsed') ? 'rotate(-90deg)' : '';
    }

    function renameFolderPrompt(form) {
      var current = form.querySelector('input[name="name"]').value || '';
      var next = prompt('Nuevo nombre de carpeta:', current);
      if (!next || !next.trim()) return false;
      form.querySelector('input[name="name"]').value = next.trim().slice(0, 60);
      return true;
    }

    function syncLimitMode() {
      var isMax = document.getElementById('limitMax').checked;
      var wrap = document.getElementById('maxPerContactWrap');
      var input = document.getElementById('ruleMaxPerContact');
      wrap.classList.toggle('disabled', !isMax);
      input.required = isMax;
      input.disabled = !isMax;
    }
    function openCreateRule() {
      document.getElementById('ruleModalTitle').textContent = 'Nueva respuesta';
      document.getElementById('ruleId').value = '';
      document.getElementById('ruleName').value = '';
      document.getElementById('ruleKeywords').value = '';
      document.getElementById('ruleText').value = '';
      document.getElementById('ruleMedia').value = '';
      document.getElementById('ruleEnabled').checked = true;
      document.getElementById('ruleIsFinal').checked = false;
      document.getElementById('limitFree').checked = true;
      document.getElementById('ruleMaxPerContact').value = '4';
      document.getElementById('ruleFolder').value = '';
      document.getElementById('clearMediaWrap').style.display = 'none';
      syncLimitMode();
      document.getElementById('ruleModal').classList.add('open');
    }
    function openEditRule(btn) {
      var rule = {};
      try {
        var raw = btn.getAttribute('data-rule') || '';
        rule = JSON.parse(decodeURIComponent(escape(atob(raw))));
      } catch (e) {}
      document.getElementById('ruleModalTitle').textContent = 'Editar respuesta';
      document.getElementById('ruleId').value = rule.id || '';
      document.getElementById('ruleName').value = rule.name || '';
      document.getElementById('ruleKeywords').value = (rule.keywords || []).join(', ');
      document.getElementById('ruleText').value = rule.text || '';
      document.getElementById('ruleMedia').value = '';
      document.getElementById('ruleEnabled').checked = rule.enabled !== false;
      document.getElementById('ruleIsFinal').checked = !!rule.isFinal;
      document.getElementById('ruleFolder').value = rule.folderId || '';
      if (rule.limitMode === 'max') {
        document.getElementById('limitMax').checked = true;
      } else {
        document.getElementById('limitFree').checked = true;
      }
      document.getElementById('ruleMaxPerContact').value = rule.maxPerContact || 4;
      document.getElementById('clearMediaWrap').style.display = rule.image ? 'block' : 'none';
      syncLimitMode();
      document.getElementById('ruleModal').classList.add('open');
    }
    function closeRuleModal() {
      document.getElementById('ruleModal').classList.remove('open');
    }
    document.getElementById('ruleModal').addEventListener('click', function(e) {
      if (e.target === this) closeRuleModal();
    });
    document.getElementById('riskModal').addEventListener('click', function(e) {
      if (e.target === this) cancelEnableSystem();
    });
    function syncHoursLimit() {
      var isMax = document.getElementById('hoursLimitMax') && document.getElementById('hoursLimitMax').checked;
      var wrap = document.getElementById('hoursMaxWrap');
      var input = document.getElementById('hoursMaxPerContact');
      if (!wrap || !input) return;
      wrap.classList.toggle('disabled', !isMax);
      input.required = !!isMax;
      input.disabled = !isMax;
    }
    function syncHoursPanel() {
      var on = document.getElementById('hoursEnabled') && document.getElementById('hoursEnabled').checked;
      var fields = document.getElementById('hoursFields');
      if (fields) fields.classList.toggle('hours-disabled', !on);
      syncHoursLimit();
    }
    function syncAntiSpamPanel() {
      var on = document.getElementById('antiSpamEnabled') && document.getElementById('antiSpamEnabled').checked;
      var fields = document.getElementById('antiSpamFields');
      if (fields) fields.classList.toggle('hours-disabled', !on);
    }
    syncLimitMode();
    syncHoursPanel();
    syncAntiSpamPanel();
  </script>
</body>
</html>`
}
