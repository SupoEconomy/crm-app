/**
 * UI compartida: código de vinculación en tiempo real (panel maestro y revendedor).
 */

export function renderPairingBoxStyles() {
  return `
    .pairing-box {
      background: var(--input, #0f1114);
      padding: 14px 16px;
      border-radius: 8px;
      margin: 12px 0 0;
      text-align: center;
      border: 1px solid var(--border, #2a2e36);
    }
    .pairing-box p { margin: 0; }
    .pairing-code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 1.25rem;
      color: var(--primary, #c4a574);
      letter-spacing: 0.12em;
      margin: 8px 0;
      font-weight: 600;
    }
    .btn-primary-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--primary, #c4a574);
      color: #0c0d0f;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.82rem;
      border: none;
    }
    .btn.btn-primary-link {
      border: 1px solid transparent;
    }
    .status-pill {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.68rem;
      text-transform: uppercase;
      border: 1px solid var(--border, #2a2e36);
    }
    .status-pill.status-online { color: #86efac; border-color: rgba(37,211,102,0.35); }
    .status-pill.status-pairing, .status-pill.status-connecting { color: #fbbf24; border-color: rgba(251,191,36,0.35); }
    .status-pill.status-offline { color: #94a3b8; border-color: rgba(148,163,184,0.25); }
    .status-pill.status-expired { color: #f0a0a0; border-color: rgba(217,122,122,0.35); }
    .status-pill.status-paused { color: #cbd5e1; border-color: rgba(148,163,184,0.22); }
  `
}

export function renderPairingSlotHtml(number, child = {}) {
  const waiting = child.status === 'pairing' || child.status === 'connecting' || child.pairingCode
  const code = child.pairingCode
    ? String(child.pairingCode).replace(/\s|-/g, '').length === 8
      ? `${String(child.pairingCode).replace(/\s|-/g, '').slice(0, 4)} - ${String(child.pairingCode).replace(/\s|-/g, '').slice(4)}`
      : child.pairingCode
    : 'Esperando código...'
  if (!waiting) return `<div id="pairing-slot-${number}"></div>`
  return `
    <div id="pairing-slot-${number}">
      <div class="pairing-box">
        <p style="font-size:0.7rem; color:#94a3b8; letter-spacing:0.08em; text-transform:uppercase; font-weight:700;">Código de vinculación</p>
        <div class="pairing-code" id="pairing-${number}">${code}</div>
        <p style="font-size:0.68rem; color:#64748b">WhatsApp → Dispositivos vinculados</p>
      </div>
    </div>`
}

export function renderEntrarSlotHtml(number, child = {}, panelUrl = '') {
  const rentalStatus = child.rentalStatus || 'active'
  const show = child.status === 'online' && rentalStatus === 'active' && panelUrl
  return `
    <div id="entrar-slot-${number}" style="display:contents">
      ${show ? `<a href="${panelUrl}" target="_blank" class="btn btn-primary-link"><i class="fas fa-arrow-up-right-from-square"></i> Entrar</a>` : ''}
    </div>`
}

/**
 * @param {{ statusUrl?: string, publicIP?: string, intervalMs?: number }}
 */
export function renderLiveSubbotsScript({
  statusUrl = '/status',
  publicIP = '',
  intervalMs = 2000,
} = {}) {
  return `
  (function liveSubbots() {
    const PUBLIC_IP = ${JSON.stringify(publicIP)};
    const STATUS_URL = ${JSON.stringify(statusUrl)};
    const lastSeen = {};

    function formatCode(code) {
      if (!code) return 'Esperando código...';
      const c = String(code).replace(/\\s|-/g, '');
      if (c.length === 8) return c.slice(0, 4) + ' - ' + c.slice(4);
      return code;
    }

    function statusClass(sub) {
      if (sub.rentalStatus === 'expired') return 'status-expired';
      if (sub.rentalStatus === 'paused') return 'status-paused';
      return 'status-' + (sub.status || 'offline');
    }

    function statusLabel(sub) {
      if (sub.rentalStatus === 'expired') return 'vencido';
      if (sub.rentalStatus === 'paused') return 'pausado';
      return sub.status || 'offline';
    }

    function cardStateClass(sub) {
      if (sub.rentalStatus === 'expired' || sub.rentalStatus === 'paused') return 'is-' + sub.rentalStatus;
      return 'is-' + (sub.status || 'offline');
    }

    function ensurePairingBox(number, code) {
      const slot = document.getElementById('pairing-slot-' + number);
      if (!slot) return;
      let box = slot.querySelector('.pairing-box');
      if (!box) {
        slot.innerHTML =
          '<div class="pairing-box">' +
          '<p style="font-size:0.7rem; color:#94a3b8; letter-spacing:0.08em; text-transform:uppercase; font-weight:700;">Código de vinculación</p>' +
          '<div class="pairing-code" id="pairing-' + number + '"></div>' +
          '<p style="font-size:0.68rem; color:#64748b">WhatsApp → Dispositivos vinculados</p>' +
          '</div>';
      }
      const el = document.getElementById('pairing-' + number);
      if (el) el.innerText = formatCode(code);
    }

    function clearPairingBox(number) {
      const slot = document.getElementById('pairing-slot-' + number);
      if (slot) slot.innerHTML = '';
    }

    function ensureEntrar(number, panelUrl) {
      const slot = document.getElementById('entrar-slot-' + number);
      if (!slot) return;
      if (slot.querySelector('.btn-primary-link')) return;
      const a = document.createElement('a');
      a.href = panelUrl || '#';
      a.target = '_blank';
      a.className = 'btn btn-primary-link';
      a.innerHTML = '<i class="fas fa-arrow-up-right-from-square"></i> Entrar';
      slot.appendChild(a);
    }

    function clearEntrar(number) {
      const slot = document.getElementById('entrar-slot-' + number);
      if (slot) slot.innerHTML = '';
    }

    function updateCard(number, sub) {
      const card = document.getElementById('subbot-card-' + number);
      if (!card) return;

      const key = (sub.status || '') + '|' + (sub.pairingCode || '') + '|' + (sub.rentalStatus || '') + '|' + (sub.panelUrl || '');
      if (lastSeen[number] === key) return;
      lastSeen[number] = key;

      if (sub.panelUrl) card.dataset.panelUrl = sub.panelUrl;

      const cls = statusClass(sub);
      const state = cardStateClass(sub);
      card.className = card.className
        .split(/\\s+/)
        .filter(function(c) { return c && !c.startsWith('is-'); })
        .concat([state])
        .join(' ');

      const pill = document.getElementById('status-pill-' + number);
      const accent = document.getElementById('card-accent-' + number);
      if (pill) {
        pill.className = 'status-pill ' + cls;
        pill.innerText = statusLabel(sub);
      }
      if (accent) accent.className = 'card-accent ' + cls;

      const waitingCode = sub.status === 'pairing' || sub.status === 'connecting' || !!sub.pairingCode;
      const entryUrl = sub.panelUrl || card.dataset.panelUrl || (sub.panelSlug ? ('/' + sub.panelSlug + '/') : (card.dataset.panelSlug ? ('/' + card.dataset.panelSlug + '/') : '#'));
      if (waitingCode && sub.status !== 'online') {
        ensurePairingBox(number, sub.pairingCode);
        clearEntrar(number);
      } else if (sub.status === 'online' && sub.rentalStatus === 'active') {
        clearPairingBox(number);
        ensureEntrar(number, entryUrl);
      } else {
        clearPairingBox(number);
        clearEntrar(number);
      }
    }

    async function tick() {
      try {
        const res = await fetch(STATUS_URL, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.subbots) return;
        for (const entry of Object.entries(data.subbots)) {
          updateCard(entry[0], entry[1]);
        }
      } catch (e) {}
    }

    setInterval(tick, ${Number(intervalMs) || 2000});
    tick();
  })();
  `
}
