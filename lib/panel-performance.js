/**
 * Rendimiento del panel (móvil / GPU débiles).
 * Evita lag continuo por blur, backdrop-filter e infinite animations
 * (típico en Android midrange: Mali/Adreno con WebView MIUI/HyperOS).
 */

/** Detecta dispositivos donde el full glass + orbs + blur animado cuesta FPS. */
export const panelPerformanceScript = `
(function () {
  try {
    var html = document.documentElement;
    if (!html) return;

    var cores = navigator.hardwareConcurrency || 8;
    var mem = navigator.deviceMemory || 8;
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    var coarse = false;
    try {
      coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    } catch (e) {}
    var narrow = false;
    try {
      narrow = window.matchMedia('(max-width: 960px)').matches;
    } catch (e) {}
    var reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {}
    var ua = (navigator.userAgent || '').toLowerCase();
    var android = /android/.test(ua);
    var ios = /iphone|ipad|ipod/.test(ua);

    // Móvil / touch → modo ligero por defecto (scroll estable)
    if (coarse || narrow || android || ios || reduced) {
      html.classList.add('perf-mobile');
    }

    // GPU/CPU apretados o ahorro de datos → aún más agresivo
    if (saveData || reduced || cores <= 6 || mem <= 4 || (android && cores <= 8)) {
      html.classList.add('perf-lite');
    }

    // Redmi / poco a veces reportan muchos cores pero el WebView tarda con filters
    if (android && /redmi|poco|miui|xiaomi|infinix|tecno|realme|oppo|vivo|motorola|samsung/.test(ua)) {
      html.classList.add('perf-lite');
    }

    // Pausar animaciones cuando la pestaña no está visible (ahorra batería/GPU)
    document.addEventListener('visibilitychange', function () {
      html.classList.toggle('perf-hidden', document.hidden);
    });
  } catch (e) {}
})();
`

/**
 * CSS de optimización: se inyecta en todas las páginas del panel.
 * No quita el look en desktop con mouse fino + GPU holgada.
 */
export const panelPerformanceCss = `
/* ── Base: menos repaints en animaciones globales ── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Orbs con filter:blur() + infinite = lag severo en Adreno/Mali midrange */
html.perf-mobile .ambient,
html.perf-lite .ambient,
html.perf-mobile .orb,
html.perf-lite .orb,
html.perf-mobile .orb-1,
html.perf-mobile .orb-2,
html.perf-mobile .orb-3,
html.perf-lite .orb-1,
html.perf-lite .orb-2,
html.perf-lite .orb-3 {
  display: none !important;
  animation: none !important;
  filter: none !important;
}

/* Gradientes fijos del body animándose = paint constante a full viewport */
html.perf-mobile body::before,
html.perf-lite body::before {
  animation: none !important;
  transform: none !important;
  opacity: 0.85;
}

/* Grid mask-image fixed es costoso en scroll */
html.perf-mobile body::after,
html.perf-lite body::after {
  display: none !important;
}

/* backdrop-filter en cada tarjeta = composition layer enorme en Android WebView */
html.perf-mobile .glass-nav,
html.perf-lite .glass-nav {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: rgba(10, 12, 18, 0.97) !important;
  position: relative !important;
  top: auto !important;
  box-shadow: 0 4px 14px rgba(0,0,0,0.25) !important;
  animation: none !important;
}

html.perf-mobile .section,
html.perf-lite .section {
  background: rgba(18, 22, 30, 0.98) !important;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28) !important;
  transition: border-color 0.15s ease !important;
}
html.perf-mobile .section:hover,
html.perf-lite .section:hover {
  transform: none !important;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28) !important;
}
html.perf-mobile .section::after,
html.perf-lite .section::after {
  display: none !important;
}

/* Barras / scan / glow infinitos en header */
html.perf-mobile .page-header .scan-fx,
html.perf-lite .page-header .scan-fx,
html.perf-mobile .page-header .scan-fx::after,
html.perf-lite .page-header .scan-fx::after,
html.perf-mobile .page-header::before,
html.perf-lite .page-header::before,
html.perf-mobile .header::before,
html.perf-lite .header::before {
  animation: none !important;
  display: none !important;
}

html.perf-mobile .page-header,
html.perf-lite .page-header,
html.perf-mobile .header,
html.perf-lite .header {
  animation: none !important;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3) !important;
}

/* Badges online con statusPulse (box-shadow animado) */
html.perf-mobile .status-online::before,
html.perf-lite .status-online::before,
html.perf-mobile [class*="status-"]::before,
html.perf-lite [class*="status-"]::before {
  animation: none !important;
  box-shadow: none !important;
}

/* Gradiente de texto animado (brand-3d) fuerza repaint de glyphs */
html.perf-mobile .brand-3d,
html.perf-lite .brand-3d {
  animation: none !important;
  background: none !important;
  -webkit-background-clip: unset !important;
  background-clip: unset !important;
  color: var(--primary, #5eead4) !important;
  -webkit-text-fill-color: var(--primary, #5eead4) !important;
}

/* Loader: menos capas en móviles */
html.perf-mobile .t3d-loader-fx .amb-grid,
html.perf-lite .t3d-loader-fx .amb-grid,
html.perf-mobile .t3d-loader-fx .amb-grain,
html.perf-lite .t3d-loader-fx .amb-grain {
  display: none !important;
}
html.perf-mobile .t3d-loader-fx .amb-glow,
html.perf-lite .t3d-loader-fx .amb-glow {
  animation: none !important;
  opacity: 0.85;
}
html.perf-mobile .t3d-loader-ring::after,
html.perf-lite .t3d-loader-ring::after {
  animation-duration: 1.6s !important;
}
html.perf-mobile .t3d-orbit,
html.perf-lite .t3d-orbit {
  display: none !important;
}
html.perf-mobile .t3d-loader-card::after,
html.perf-lite .t3d-loader-card::after {
  display: none !important;
}
html.perf-mobile .t3d-mark,
html.perf-lite .t3d-mark,
html.perf-mobile .t3d-core,
html.perf-lite .t3d-core {
  animation: none !important;
}
html.perf-mobile .t3d-bar > i,
html.perf-lite .t3d-bar > i {
  animation: none !important;
}

/* Hover transforms caros en touch (phantom hover) */
html.perf-mobile .user-card:hover,
html.perf-lite .user-card:hover,
html.perf-mobile .dash-stat:hover,
html.perf-lite .dash-stat:hover,
html.perf-mobile .btn:hover,
html.perf-lite .btn:hover,
html.perf-mobile .theme-card:hover,
html.perf-lite .theme-card:hover {
  transform: none !important;
}

/* Menos sombra y transiciones genéricas en UI densa */
html.perf-mobile .btn,
html.perf-lite .btn,
html.perf-mobile .status-item,
html.perf-lite .status-item,
html.perf-mobile .control-grid .btn,
html.perf-lite .control-grid .btn {
  transition: background-color 0.12s ease, border-color 0.12s ease, opacity 0.12s ease !important;
  box-shadow: none !important;
}

html.perf-mobile .user-card,
html.perf-lite .user-card {
  animation: none !important;
  transition: border-color 0.15s ease !important;
  box-shadow: none !important;
}

/* Listas largas: no renderizar offscreen (ahorro al scrollear pubs/grupos) */
html.perf-mobile .status-item,
html.perf-lite .status-item,
html.perf-mobile .checkbox-item,
html.perf-lite .checkbox-item,
html.perf-mobile .user-card,
html.perf-lite .user-card,
html.perf-mobile .pub-card,
html.perf-lite .pub-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 72px;
}

/* Pestaña en background: frena almost everything */
html.perf-hidden .orb,
html.perf-hidden .ambient,
html.perf-hidden body::before,
html.perf-hidden .page-header::before,
html.perf-hidden .header::before,
html.perf-hidden .scan-fx::after,
html.perf-hidden .brand-3d,
html.perf-hidden .status-online::before {
  animation-play-state: paused !important;
}

/* Fallback media query sin JS (por si el script tarda) */
@media (max-width: 960px), (hover: none) and (pointer: coarse) {
  .ambient, .orb, .orb-1, .orb-2, .orb-3 {
    display: none !important;
    animation: none !important;
    filter: none !important;
  }
  body::before {
    animation: none !important;
  }
  body::after {
    display: none !important;
  }
  .section, .header, .glass-nav, .schedule-card, .t3d-loader-card {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  .glass-nav {
    position: relative !important;
    top: auto !important;
    background: rgba(10, 12, 18, 0.97) !important;
  }
  .page-header .scan-fx,
  .page-header .scan-fx::after,
  .page-header::before,
  .header::before {
    animation: none !important;
    display: none !important;
  }
  .section {
    transition: border-color 0.15s ease !important;
  }
  .brand-3d {
    animation: none !important;
  }
}

/* Desktop potente: orbs sin animar box-shadow (solo transform/opacity leve) */
@media (min-width: 961px) and (hover: hover) and (pointer: fine) {
  .orb {
    will-change: transform;
    /* blur reducido: 80px pelea por cada frame */
    filter: blur(48px);
  }
  html:not(.perf-lite) .orb {
    animation-duration: 22s, 18s;
  }
}
`

/** Bloque listo para inyectar en <head>/<body> de todas las páginas del panel. */
export function renderPanelPerformanceBlock() {
  return `<style id="panel-perf-css">${panelPerformanceCss}</style><script id="panel-perf-js">${panelPerformanceScript}</script>`
}
