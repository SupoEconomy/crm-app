import { formatDateTime } from './rental.js'
import { renderLoaderBlock } from './text3d.js'

export function renderExpiredPanelPage({ botName = 'Cliente', expiresAt = null } = {}) {
  const expiredLabel = expiresAt ? formatDateTime(expiresAt) : '—'

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel vencido | Bot Spam WhatsApp</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0c0d0f;
            --card: #14161a;
            --primary: #c4a574;
            --danger: #d97a7a;
            --text: #e8eaed;
            --dim: #8b929e;
            --border: #2a2e36;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            font-family: 'Inter', sans-serif;
            color: var(--text);
            background:
                radial-gradient(circle at 20% 20%, rgba(239,68,68,0.1), transparent 35%),
                radial-gradient(circle at 80% 80%, rgba(15,118,110,0.1), transparent 30%),
                var(--bg);
        }
        .card {
            width: 100%;
            max-width: 520px;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 40px 32px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.45);
            backdrop-filter: blur(12px);
        }
        .icon-wrap {
            width: 88px;
            height: 88px;
            margin: 0 auto 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(239,68,68,0.12);
            border: 1px solid rgba(239,68,68,0.35);
            color: var(--danger);
            font-size: 2.2rem;
        }
        h1 {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 1.55rem;
            line-height: 1.3;
            margin: 0 0 16px;
            color: #fff;
        }
        .subtitle {
            color: var(--dim);
            font-size: 0.95rem;
            line-height: 1.65;
            margin: 0 0 24px;
        }
        .meta {
            display: inline-flex;
            flex-direction: column;
            gap: 6px;
            padding: 14px 18px;
            border-radius: 12px;
            background: rgba(255,255,255,0.03);
            border: 1px solid var(--border);
            margin-bottom: 28px;
            font-size: 0.85rem;
            color: var(--dim);
        }
        .meta strong { color: #fff; }
        .notice {
            text-align: left;
            background: rgba(255,165,0,0.08);
            border: 1px solid rgba(255,165,0,0.25);
            border-radius: 12px;
            padding: 16px 18px;
            color: #fcd34d;
            font-size: 0.88rem;
            line-height: 1.6;
            margin-bottom: 24px;
        }
        .notice i { margin-right: 8px; }
        .btn-logout {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 20px;
            border-radius: 10px;
            border: 1px solid var(--border);
            background: transparent;
            color: var(--dim);
            text-decoration: none;
            font-size: 0.9rem;
            transition: 0.2s;
        }
        .btn-logout:hover {
            color: #fff;
            border-color: rgba(255,255,255,0.2);
        }
    </style>
</head>
<body>
    ${renderLoaderBlock()}
    <div class="card">
        <div class="icon-wrap"><i class="fas fa-hourglass-end"></i></div>
        <h1>SU PANEL DE BOT SPAM WHATSAPP YA SE HA VENCIDO</h1>
        <p class="subtitle">
            Hola <strong>${escapeHtml(botName)}</strong>, tu periodo de alquiler ha finalizado.
            El sistema fue pausado automáticamente. Tu configuración, grupos y publicaciones
            <strong>no fueron borrados</strong>.
        </p>
        <div class="meta">
            <span>Fecha de vencimiento</span>
            <strong>${escapeHtml(expiredLabel)}</strong>
        </div>
        <div class="notice">
            <i class="fas fa-headset"></i>
            <strong>¿Quieres renovar?</strong> Si deseas continuar usando el panel, comunícate con el
            administrador para reactivar tu alquiler. Si crees que esto es un error, también contacta al admin.
        </div>
        <a href="/login" class="btn-logout" onclick="document.cookie='panel_auth=; Max-Age=0; path=/';">
            <i class="fas fa-sign-out-alt"></i> Cerrar sesión
        </a>
    </div>
</body>
</html>`
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
