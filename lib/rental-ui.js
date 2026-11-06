import { RENTAL_OPTIONS } from './rental.js'

export function renderRentalTimeFields({
  fieldPrefix = '',
  showSkip = false,
  showInfinite = true,
  defaultMode = 'preset',
} = {}) {
  const p = fieldPrefix
  const skipOption = showSkip
    ? `<option value="">— No cambiar tiempo —</option>`
    : ''
  const presetOptions = RENTAL_OPTIONS.map(o =>
    `<option value="${o.value}"${!showSkip && o.value === '1w' ? ' selected' : ''}>${o.label}</option>`
  ).join('')

  return `
    <div class="rental-picker" data-prefix="${p}">
        <label style="display:block; margin-bottom:8px;">Tiempo de alquiler</label>
        <div class="rental-mode-tabs" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
            <button type="button" class="rental-tab${defaultMode === 'preset' ? ' active' : ''}" data-mode="preset" data-prefix="${p}">Rápido</button>
            <button type="button" class="rental-tab${defaultMode === 'custom' ? ' active' : ''}" data-mode="custom" data-prefix="${p}">Personalizado</button>
            ${showInfinite ? `<button type="button" class="rental-tab${defaultMode === 'infinite' ? ' active' : ''}" data-mode="infinite" data-prefix="${p}"><i class="fas fa-infinity"></i> Tiempo Infinito</button>` : ''}
        </div>
        <input type="hidden" name="${p}rental_mode" id="${p}rental_mode" value="${defaultMode}">
        <input type="hidden" name="${p}rental_infinite" id="${p}rental_infinite" value="0">

        <div id="${p}rental_panel_preset" class="rental-panel" style="display:${defaultMode === 'preset' ? 'block' : 'none'};">
            <select name="${p}rental_duration" id="${p}rental_duration" style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border); background:#1c1f26; color:white;">
                ${skipOption}${presetOptions}
            </select>
        </div>

        <div id="${p}rental_panel_custom" class="rental-panel" style="display:${defaultMode === 'custom' ? 'block' : 'none'};">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <input type="number" name="${p}rental_amount" id="${p}rental_amount" min="1" placeholder="Cantidad" style="padding:12px; border-radius:12px; border:1px solid var(--border); background:#1c1f26; color:white;">
                <select name="${p}rental_unit" id="${p}rental_unit" style="padding:12px; border-radius:12px; border:1px solid var(--border); background:#1c1f26; color:white;">
                    <option value="min">Minutos</option>
                    <option value="h">Horas</option>
                    <option value="d">Días</option>
                    <option value="w">Semanas</option>
                    <option value="mo">Meses</option>
                </select>
            </div>
            <p style="font-size:0.75rem; color:var(--text-dim); margin:8px 0 0;">Ejemplo: 30 minutos, 3 días, 12 horas, 2 semanas...</p>
        </div>

        ${showInfinite ? `
        <div id="${p}rental_panel_infinite" class="rental-panel" style="display:${defaultMode === 'infinite' ? 'block' : 'none'}; padding:14px; border-radius:12px; border:1px dashed rgba(13,148,136,0.35); background:rgba(13,148,136,0.08); color:#5eead4; font-size:0.88rem;">
            <i class="fas fa-infinity"></i> Este cliente <strong>no tendrá fecha de vencimiento</strong>. Solo se pausará si tú lo haces manualmente.
        </div>` : ''}
    </div>`
}

export function renderRentalTimeStyles() {
  return `
    .rental-tab {
        padding: 8px 14px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.12);
        background: #1c1f26;
        color: #94a3b8;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: 0.2s;
    }
    .rental-tab.active {
        background: rgba(15, 118, 110, 0.18);
        border-color: rgba(45, 212, 191, 0.3);
        color: #5eead4;
    }
  `
}

export function renderRentalTimeScript() {
  return `
    function setRentalMode(prefix, mode) {
        const panels = ['preset', 'custom', 'infinite'];
        panels.forEach(m => {
            const panel = document.getElementById(prefix + 'rental_panel_' + m);
            if (panel) panel.style.display = m === mode ? 'block' : 'none';
        });
        document.querySelectorAll('.rental-tab[data-prefix="' + prefix + '"]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        const modeInput = document.getElementById(prefix + 'rental_mode');
        const infiniteInput = document.getElementById(prefix + 'rental_infinite');
        if (modeInput) modeInput.value = mode;
        if (infiniteInput) infiniteInput.value = mode === 'infinite' ? '1' : '0';
    }
    document.querySelectorAll('.rental-tab').forEach(btn => {
        btn.addEventListener('click', function() {
            setRentalMode(this.dataset.prefix || '', this.dataset.mode);
        });
    });
  `
}
