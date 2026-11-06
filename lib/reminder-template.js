/**
 * Plantillas de recordatorios del Gestor General.
 * Soporta {{variable}} y {variable} en español e inglés.
 */

function escReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Mapa plano clave → valor para reemplazo en mensajes. */
export function buildTemplateVarMap(ctx = {}) {
  const correo = String(ctx.correo ?? ctx.email ?? '')
  const usuario = String(ctx.usuario ?? ctx.user ?? '')
  const pass = String(ctx.pass ?? ctx.contraseña ?? ctx.contrasena ?? ctx.clave ?? '')
  const pin = String(ctx.pin ?? '')
  const whatsapp = String(ctx.whatsapp ?? ctx.wa ?? ctx.telefono ?? ctx.tel ?? '')

  const map = {
    nombre: ctx.nombre ?? '',
    whatsapp,
    wa: whatsapp,
    telefono: whatsapp,
    tel: whatsapp,
    perfil: ctx.perfil ?? '',
    cuenta: ctx.cuenta ?? '',
    inicio: ctx.inicio ?? '',
    vence: ctx.vence ?? '',
    plan: ctx.plan ?? '',
    pin,
    correo,
    email: correo,
    usuario,
    user: usuario,
    pass,
    contraseña: pass,
    contrasena: pass,
    clave: pass,
    password: pass,
    correo_cuenta: ctx.correo_cuenta ?? ctx.motherEmail ?? '',
    usuario_cuenta: ctx.usuario_cuenta ?? ctx.motherUser ?? '',
    id: ctx.id ?? ctx.id_perfil ?? ctx.extraId ?? '',
    id_perfil: ctx.id_perfil ?? ctx.extraId ?? '',
  }

  for (const k of Object.keys(map)) {
    map[k] = String(map[k] ?? '')
  }
  return map
}

export function fillMessageTemplate(tpl, ctx = {}) {
  const map = buildTemplateVarMap(ctx)
  let s = String(tpl || '')
  const keys = Object.keys(map).sort((a, b) => b.length - a.length)
  for (const k of keys) {
    const v = map[k]
    const reDouble = new RegExp(`\\{\\{\\s*${escReg(k)}\\s*\\}\\}`, 'gi')
    const reSingle = new RegExp(`(?<!\\{)\\{\\s*${escReg(k)}\\s*\\}(?!\\})`, 'gi')
    s = s.replace(reDouble, v).replace(reSingle, v)
  }
  return s.trim()
}

/** Quita variables sensibles del texto (cuando no se incluyen credenciales). */
export function stripCredentialVars(tpl) {
  const keys = [
    'user',
    'usuario',
    'pass',
    'contraseña',
    'contrasena',
    'clave',
    'password',
    'pin',
    'correo',
    'email',
  ]
  let s = String(tpl || '')
  for (const k of keys) {
    const reDouble = new RegExp(`\\{\\{\\s*${escReg(k)}\\s*\\}\\}`, 'gi')
    const reSingle = new RegExp(`(?<!\\{)\\{\\s*${escReg(k)}\\s*\\}(?!\\})`, 'gi')
    s = s.replace(reDouble, '').replace(reSingle, '')
  }
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

/** Datos de ejemplo para la vista previa del panel. */
export function getReminderPreviewSample() {
  return {
    nombre: 'María García',
    whatsapp: '51987654321',
    perfil: 'Perfil 2',
    cuenta: 'Netflix Familiar',
    inicio: '01 ago 2026',
    vence: '31 ago 2026',
    plan: '1 mes',
    usuario: 'maria_login',
    correo: 'maria@correo.com',
    pass: 'MiClave123',
    pin: '4321',
    correo_cuenta: 'cuenta@streaming.com',
    usuario_cuenta: 'admin_cuenta',
    id_perfil: 'REF-204',
  }
}

export function reminderVarsHintHtml() {
  const vars = [
    ['nombre', 'cliente'],
    ['whatsapp', 'número WA'],
    ['perfil', 'perfil'],
    ['cuenta', 'cuenta madre'],
    ['correo', 'correo del perfil'],
    ['usuario', 'usuario del perfil'],
    ['contraseña', 'clave'],
    ['pin', 'PIN'],
    ['vence', 'vencimiento'],
    ['inicio', 'inicio'],
    ['plan', 'plan'],
    ['correo_cuenta', 'correo madre'],
    ['usuario_cuenta', 'usuario madre'],
  ]
  return vars
    .map(
      ([k, d]) =>
        `<code title="${d}">{{${k}}}</code>`
    )
    .join(' ')
}

/** Convierte marcado simple de WhatsApp (*bold* _italic_) a HTML seguro. */
export function formatWhatsAppPreviewHtml(text) {
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  let s = esc(text || '')
  s = s.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>')
  s = s.replace(/\n/g, '<br>')
  return s
}
