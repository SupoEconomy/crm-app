/**
 * Landing pública en la raíz del dominio.
 * Textos de cliente, planes y WhatsApp (todo editable desde el maestro).
 * No expone rutas secretas ni detalles internos.
 */
import { getText3dConfig, getLoaderLogoPath, TEXT3D_DEFAULTS } from './text3d.js'
import { getDomainConfig, getMasterPanelBase, whatsappDigits } from './panel-domain.js'
import { getThemeConfig, renderThemeCss } from './theme.js'

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDisplayPhone(raw) {
  const d = whatsappDigits(raw)
  if (!d) return ''
  if (d.startsWith('51') && d.length >= 11) {
    return `+${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
  }
  return raw.startsWith('+') ? raw : `+${d}`
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function renderLandingPage(req, res) {
  const brand = getText3dConfig()
  const domain = getDomainConfig()
  const theme = getThemeConfig()
  const masterBase = getMasterPanelBase()
  const hasLogo = !!getLoaderLogoPath(brand)
  const version = brand.version || TEXT3D_DEFAULTS.version
  const waDigits = whatsappDigits(domain.contact)
  const waDisplay = formatDisplayPhone(domain.contact)
  const currency = domain.currency || 'S/'
  const plans = domain.plans || {}

  const benefits = [
    {
      icon: 'fa-desktop',
      title: 'Tu propio panel privado',
      text: 'Entras con tu usuario y contraseña. Nadie más ve tus grupos, tus archivos ni tus números. Todo queda en tu cuenta.',
    },
    {
      icon: 'fa-folder-open',
      title: 'Carpetas de envío',
      text: 'Armas varias carpetas: cada una con sus grupos y sus publicaciones. Puedes tener campañas distintas sin enredarlas.',
    },
    {
      icon: 'fa-images',
      title: 'Publicaciones con texto e imagen',
      text: 'Subes lo que quieras mandar: solo texto, o texto con foto. Lo organizas y lo usas cuando lo necesites.',
    },
    {
      icon: 'fa-clock',
      title: 'Tiempo entre envíos',
      text: 'Tú decides cada cuántos minutos vuelve a publicar. Así controlas el ritmo y no dejas todo al azar.',
    },
    {
      icon: 'fa-calendar-check',
      title: 'Horario automático',
      text: 'Puedes programar a qué hora empieza y a qué hora se pausa cada día, o fijar horas exactas por día de la semana.',
    },
    {
      icon: 'fa-users',
      title: 'Tus grupos elegidos',
      text: 'Marcas en qué grupos quieres publicar. Solo a esos llega el contenido de cada carpeta.',
    },
    {
      icon: 'fa-reply',
      title: 'Respuestas en chat privado',
      text: 'Configura respuestas automáticas con palabras clave para quienes te escriban al número del bot.',
    },
    {
      icon: 'fa-link',
      title: 'Unirte con links de grupos',
      text: 'Pegas invitaciones, ves si el grupo sigue vivo y te unes desde el panel cuando te convenga.',
    },
    {
      icon: 'fa-bolt',
      title: 'Envío manual cuando quieras',
      text: 'Si necesitas mandar ya, tienes un botón para disparar la ronda sin esperar el siguiente intervalo.',
    },
    {
      icon: 'fa-download',
      title: 'Respaldo de tu configuración',
      text: 'Descargas un respaldo completo: carpeta (grupos, tiempos y publicaciones), auto-respuestas y gestor general.',
    },
    {
      icon: 'fa-mobile-screen',
      title: 'Panel desde el celular',
      text: 'El panel se ve bien en el teléfono. Cambias tiempos, publicas o pausas sin depender de una PC.',
    },
    {
      icon: 'fa-ticket',
      title: 'Renovación clara',
      text: 'Ves cuándo vence tu plan y, si tienes código de canje, lo usas desde el mismo panel para sumar tiempo.',
    },
  ]

  const benefitHtml = benefits
    .map(
      (b) => `
    <article class="lp-card">
      <div class="lp-card-ico"><i class="fas ${b.icon}"></i></div>
      <h3>${escapeHtml(b.title)}</h3>
      <p>${escapeHtml(b.text)}</p>
    </article>`
    )
    .join('')

  const planOrder = [
    { key: 'week1', hint: 'Probar sin largo compromiso' },
    { key: 'week2', hint: 'Más aire para montar tus grupos' },
    { key: 'month1', hint: 'El más pedido para trabajo diario' },
    { key: 'month2', hint: 'Mejor precio por tiempo' },
  ]

  const planCards = planOrder
    .map(({ key, hint }, i) => {
      const p = plans[key] || { label: key, price: '' }
      const priceNum = String(p.price || '').trim()
      const priceShow = priceNum
        ? `<span class="lp-price-num">${escapeHtml(currency)} ${escapeHtml(priceNum)}</span>`
        : `<span class="lp-price-ask">Consultar</span>`
      const popular = i === 2 ? ' is-hot' : ''
      return `
      <article class="lp-plan${popular}">
        ${i === 2 ? '<span class="lp-plan-badge">Popular</span>' : ''}
        <h3>${escapeHtml(p.label || key)}</h3>
        <p class="lp-plan-hint">${escapeHtml(hint)}</p>
        <div class="lp-plan-price">${priceShow}</div>
        <ul class="lp-plan-list">
          <li><i class="fas fa-check"></i> Panel privado con acceso propio</li>
          <li><i class="fas fa-check"></i> Carpetas, grupos y publicaciones</li>
          <li><i class="fas fa-check"></i> Horarios y control de envíos</li>
          <li><i class="fas fa-check"></i> Soporte al activar</li>
        </ul>
        ${
          waDigits
            ? `<a class="lp-plan-btn" href="https://wa.me/${waDigits}?text=${encodeURIComponent(
                `Hola, quiero el plan de ${p.label || key}${priceNum ? ` (${currency} ${priceNum})` : ''}`
              )}" target="_blank" rel="noopener">Pedir por WhatsApp</a>`
            : `<span class="lp-plan-btn is-disabled">WhatsApp no configurado</span>`
        }
      </article>`
    })
    .join('')

  const logoHtml = hasLogo
    ? `<img class="lp-logo" src="/branding-logo?v=${Date.now()}" alt="${escapeHtml(brand.brand)}">`
    : `<div class="lp-logo-letter">${escapeHtml((brand.brand || 'B').charAt(0).toUpperCase())}</div>`

  const waCta = waDigits
    ? `
    <a class="lp-cta-wa" href="https://wa.me/${waDigits}?text=${encodeURIComponent(
        `Hola, me interesa ${brand.brand || 'el bot spam'} y quiero mi panel`
      )}" target="_blank" rel="noopener">
      <i class="fab fa-whatsapp"></i>
      Escribir al WhatsApp
      ${waDisplay ? `<span class="lp-cta-phone">${escapeHtml(waDisplay)}</span>` : ''}
    </a>`
    : `
    <p class="lp-wa-empty">Para comprar o renovar, escribe al administrador que te dio el acceso.</p>`

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(brand.brand || 'Bot Spam')} · Panel privado para WhatsApp</title>
  <meta name="description" content="Alquila tu panel de bot para WhatsApp: carpetas, grupos, horarios, publicaciones y control total desde el celular.">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Syne:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/landing-demo/landing-demo.css?v=5">
  ${renderThemeCss()}
  <style>
    :root {
      --lp-ink: #e8edf5;
      --lp-mute: #8b95a8;
      --lp-line: rgba(255,255,255,0.09);
      --lp-card: rgba(16, 20, 28, 0.92);
      --lp-teal: #2dd4bf;
      --lp-wa: #25d366;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      background: #05070b;
      color: var(--lp-ink);
      min-height: 100vh;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    .lp-aurora {
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background:
        radial-gradient(ellipse 90% 55% at 10% -5%, rgba(45, 212, 191, 0.22), transparent 55%),
        radial-gradient(ellipse 60% 45% at 95% 15%, rgba(56, 189, 248, 0.12), transparent 50%),
        radial-gradient(ellipse 50% 40% at 50% 100%, rgba(16, 185, 129, 0.08), transparent 55%);
    }
    .lp-noise {
      position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0.035;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    }
    .lp-wrap { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 28px 18px 72px; }

    /* HERO */
    .lp-hero {
      position: relative;
      overflow: hidden;
      border-radius: 24px;
      border: 1px solid var(--lp-line);
      background: linear-gradient(155deg, rgba(18, 24, 34, 0.98) 0%, rgba(8, 11, 16, 0.96) 100%);
      padding: clamp(36px, 6vw, 64px) clamp(20px, 4vw, 40px) clamp(32px, 5vw, 48px);
      text-align: center;
      margin-bottom: 48px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.45);
    }
    .lp-hero::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, transparent, var(--lp-teal), #38bdf8, var(--lp-teal), transparent);
      background-size: 200% 100%;
      animation: lpBar 7s linear infinite;
    }
    @keyframes lpBar {
      0% { background-position: 0% 50%; }
      100% { background-position: 200% 50%; }
    }
    .lp-logo {
      width: 96px; height: 96px; border-radius: 26px; object-fit: cover;
      border: 2px solid rgba(45,212,191,0.35);
      box-shadow: 0 12px 40px rgba(20,184,166,0.25);
      margin-bottom: 20px;
    }
    .lp-logo-letter {
      width: 96px; height: 96px; border-radius: 26px; margin: 0 auto 20px;
      display: grid; place-items: center;
      font-family: Syne, sans-serif; font-weight: 800; font-size: 2.2rem; color: #ecfdf5;
      background: linear-gradient(145deg, #0d9488, #0891b2);
      box-shadow: 0 12px 40px rgba(20,184,166,0.3);
    }
    .lp-pill {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--lp-teal);
      background: rgba(45,212,191,0.1);
      border: 1px solid rgba(45,212,191,0.28);
      border-radius: 999px; padding: 7px 14px; margin-bottom: 18px;
    }
    .lp-hero h1 {
      font-family: Syne, sans-serif;
      font-weight: 800;
      font-size: clamp(2rem, 5.5vw, 3.1rem);
      line-height: 1.1;
      letter-spacing: -0.02em;
      margin-bottom: 14px;
      background: linear-gradient(135deg, #fff 20%, #a5f3fc 55%, #5eead4 100%);
      -webkit-background-clip: text; background-clip: text;
      color: transparent;
      -webkit-text-fill-color: transparent;
    }
    .lp-tag {
      font-size: clamp(1rem, 2.2vw, 1.15rem);
      color: var(--lp-mute);
      max-width: 540px;
      margin: 0 auto 22px;
      font-weight: 450;
    }
    .lp-hero-actions {
      display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; align-items: center;
      margin-top: 8px;
    }
    .lp-cta-wa {
      display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center;
      background: var(--lp-wa); color: #052e16;
      font-weight: 700; font-size: 1rem;
      padding: 14px 22px; border-radius: 14px;
      text-decoration: none;
      box-shadow: 0 10px 28px rgba(37, 211, 102, 0.35);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .lp-cta-wa:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(37,211,102,0.45); }
    .lp-cta-wa i { font-size: 1.35rem; }
    .lp-cta-phone {
      display: block; width: 100%; font-size: 0.78rem; font-weight: 600; opacity: 0.85;
      text-align: center;
    }
    .lp-wa-empty { color: var(--lp-mute); font-size: 0.9rem; }
    .lp-scroll {
      display: inline-flex; align-items: center; gap: 8px;
      color: var(--lp-mute); font-size: 0.88rem; font-weight: 600;
      text-decoration: none; padding: 12px 16px;
      border: 1px solid var(--lp-line); border-radius: 14px;
      background: rgba(255,255,255,0.03);
    }
    .lp-scroll:hover { color: var(--lp-ink); border-color: rgba(45,212,191,0.3); }

    .lp-section { margin-bottom: 48px; }
    .lp-section-head {
      margin-bottom: 20px;
    }
    .lp-section-head h2 {
      font-family: Syne, sans-serif;
      font-size: clamp(1.35rem, 3vw, 1.65rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }
    .lp-section-head p { color: var(--lp-mute); font-size: 0.95rem; max-width: 520px; }

    .lp-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 14px;
    }
    .lp-card {
      padding: 20px 18px;
      border-radius: 16px;
      border: 1px solid var(--lp-line);
      background: var(--lp-card);
      transition: border-color 0.2s;
    }
    .lp-card:hover { border-color: rgba(45,212,191,0.25); }
    .lp-card-ico {
      width: 42px; height: 42px; border-radius: 12px;
      display: grid; place-items: center;
      background: rgba(45,212,191,0.12); color: var(--lp-teal);
      margin-bottom: 12px; font-size: 1rem;
    }
    .lp-card h3 {
      font-size: 0.98rem; font-weight: 650; margin-bottom: 6px;
      letter-spacing: -0.01em;
    }
    .lp-card p { font-size: 0.84rem; color: var(--lp-mute); line-height: 1.5; }

    /* PLANES */
    .lp-plans {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 14px;
    }
    .lp-plan {
      position: relative;
      padding: 22px 18px 18px;
      border-radius: 18px;
      border: 1px solid var(--lp-line);
      background: linear-gradient(165deg, rgba(20,26,36,0.98), rgba(10,13,18,0.98));
      display: flex; flex-direction: column;
    }
    .lp-plan.is-hot {
      border-color: rgba(45,212,191,0.45);
      box-shadow: 0 0 0 1px rgba(45,212,191,0.12), 0 16px 40px rgba(0,0,0,0.35);
      background: linear-gradient(165deg, rgba(13,40,38,0.5), rgba(10,13,18,0.98));
    }
    .lp-plan-badge {
      position: absolute; top: 12px; right: 12px;
      font-size: 0.65rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
      background: var(--lp-teal); color: #042f2e;
      padding: 4px 8px; border-radius: 6px;
    }
    .lp-plan h3 {
      font-family: Syne, sans-serif;
      font-size: 1.15rem; font-weight: 700;
      margin-bottom: 4px;
    }
    .lp-plan-hint { font-size: 0.8rem; color: var(--lp-mute); margin-bottom: 14px; }
    .lp-plan-price {
      font-family: Syne, sans-serif;
      font-size: 1.75rem; font-weight: 800;
      margin-bottom: 14px; color: #f0fdfa;
      letter-spacing: -0.02em;
    }
    .lp-price-ask { font-size: 1.1rem; color: var(--lp-mute); font-weight: 600; }
    .lp-plan-list {
      list-style: none; margin-bottom: 18px; flex: 1;
    }
    .lp-plan-list li {
      font-size: 0.8rem; color: var(--lp-mute);
      padding: 5px 0; display: flex; gap: 8px; align-items: flex-start;
    }
    .lp-plan-list i { color: var(--lp-teal); margin-top: 3px; font-size: 0.7rem; }
    .lp-plan-btn {
      display: block; text-align: center;
      padding: 11px 14px; border-radius: 12px;
      background: rgba(37, 211, 102, 0.15);
      border: 1px solid rgba(37, 211, 102, 0.4);
      color: #86efac; font-weight: 700; font-size: 0.85rem;
      text-decoration: none;
    }
    .lp-plan-btn:hover { background: rgba(37, 211, 102, 0.25); color: #bbf7d0; }
    .lp-plan-btn.is-disabled {
      opacity: 0.5; pointer-events: none; border-color: var(--lp-line); color: var(--lp-mute);
      background: transparent;
    }

    .lp-band {
      border-radius: 20px;
      border: 1px solid var(--lp-line);
      padding: clamp(24px, 4vw, 36px);
      background: linear-gradient(120deg, rgba(13, 40, 38, 0.4), rgba(12,16,24,0.95));
      margin-bottom: 40px;
    }
    .lp-band h2 {
      font-family: Syne, sans-serif;
      font-size: 1.35rem; margin-bottom: 10px;
    }
    .lp-band p { color: var(--lp-mute); font-size: 0.95rem; max-width: 640px; margin-bottom: 10px; }
    .lp-band p strong { color: #e2e8f0; font-weight: 600; }

    .lp-cta-final {
      text-align: center;
      padding: 40px 20px;
      border-radius: 20px;
      border: 1px solid rgba(45,212,191,0.2);
      background: rgba(10,16,18,0.9);
    }
    .lp-cta-final h2 {
      font-family: Syne, sans-serif;
      font-size: 1.4rem; margin-bottom: 8px;
    }
    .lp-cta-final p { color: var(--lp-mute); margin-bottom: 18px; font-size: 0.95rem; }

    .lp-foot {
      text-align: center; margin-top: 36px;
      font-size: 0.78rem; color: #5b6578;
    }
    @media (max-width: 560px) {
      .lp-cta-phone { margin-top: 2px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .lp-hero::before { animation: none; }
    }
  </style>
</head>
<body>
  <div class="lp-aurora" aria-hidden="true"></div>
  <div class="lp-noise" aria-hidden="true"></div>
  <div class="lp-wrap">
    <header class="lp-hero">
      ${logoHtml}
      <div class="lp-pill"><i class="fas fa-bolt"></i> ${escapeHtml(version)} · Panel privado</div>
      <h1>${escapeHtml(brand.brand || 'Bot Spam Ultra')}</h1>
      <p class="lp-tag">
        Tu propio panel para publicar en grupos de WhatsApp.
        Subes contenidos, eliges los grupos y programas los envíos — todo desde el celular o la PC.
      </p>
      <div class="lp-hero-actions">
        ${waCta}
        <a class="lp-scroll" href="#demo"><i class="fas fa-play"></i> Ver cómo funciona</a>
        <a class="lp-scroll" href="#planes"><i class="fas fa-tags"></i> Ver planes</a>
      </div>
    </header>

    <section class="lp-section" id="demo" style="margin-bottom:0;">
      <div id="lpDemoRoot" data-brand="${escapeHtml(brand.brand || 'Bot Spam')}"></div>
    </section>

    <section class="lp-band">
      <h2>Qué te llevas al activar</h2>
      <p>
        No es un “bot genérico compartido”. <strong>Es tu espacio:</strong> un panel web con tu login,
        tu número de WhatsApp vinculado, tus carpetas y tus grupos. Entras cuando quieras,
        pausas, cambias el tiempo entre envíos y subes nuevas publicaciones sin depender de nadie más.
      </p>
      <p>
        Ideal si manejas varios grupos y quieres dejar el spam corriendo con orden
        (intervalo, ventana horaria o horas fijas por día), sin armar todo a mano cada vez.
      </p>
    </section>

    <section class="lp-section" id="incluye">
      <div class="lp-section-head">
        <h2>Todo lo que incluye tu panel</h2>
        <p>Lo que realmente usas día a día. Sin rodeos técnicos de por medio.</p>
      </div>
      <div class="lp-grid">${benefitHtml}</div>
    </section>

    <section class="lp-section" id="planes">
      <div class="lp-section-head">
        <h2>Planes</h2>
        <p>Elige el tiempo que te sirva. Precios en soles. Si algo no aparece o dice “consultar”, escríbenos y te lo cotizamos al toque.</p>
      </div>
      <div class="lp-plans">${planCards}</div>
    </section>

    <section class="lp-cta-final">
      <h2>¿Listo para tu panel?</h2>
      <p>Escríbenos, elige un plan y te dejamos el acceso listo para conectar WhatsApp y empezar.</p>
      ${waCta}
    </section>

    <footer class="lp-foot">
      ${escapeHtml(brand.brand || 'Bot Spam')} ${escapeHtml(version)}
      ${brand.author ? ` · ${escapeHtml(brand.author)}` : ''}
      · ${new Date().getFullYear()}
    </footer>
  </div>
  <script src="/landing-demo/landing-demo.js?v=5" defer></script>
  <!-- t:${escapeHtml(theme.id || '')} m:${escapeHtml(masterBase)} -->
</body>
</html>`

  res.type('html').send(html)
}
