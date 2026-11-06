import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { GestorProgreso, spinnerHtml } from './progresosp.js'
import { getImagesPath, safeDeletePublicationImage } from './lib/image-storage.js'
import { syncPublicationsToNewGroups } from './lib/campaign-sync.js'
import { buildCampaignBackup, applyCampaignBackup } from './lib/campaign-backup.js'
import {
  renderBrandHeading,
  renderLoaderBlock,
  getText3dConfig,
  saveText3dConfig,
  getLoaderLogoPath,
  BRANDING_ASSETS_DIR,
} from './lib/text3d.js'
import {
  getThemeConfig,
  saveThemeConfig,
  themePreviewHtml,
  THEME_PRESETS,
} from './lib/theme.js'
import {
  ensureAutoReplyConfig,
  normalizeAutoReplyConfig,
  parseKeywords,
  newRuleId,
  newFolderId,
  newBlacklistId,
  normalizePhoneDigits,
} from './lib/auto-reply.js'
import { renderAutoReplyPage } from './lib/auto-reply-panel.js'
import {
  ensureAccountManager,
  normalizeAccountManager,
  newId,
  parseDateInput,
  sanitizePhone,
  sanitizeText,
  syncProfileRentalStatus,
} from './lib/account-manager.js'
import { renderAccountManagerPage } from './lib/account-manager-panel.js'
import {
  ensureBotCodes,
  normalizeBotCodes,
  newId as newBotCodesId,
  sanitizeText as sanitizeBotCodesText,
  getMailbox,
  fetchAllInboxes,
  testMailboxConnection,
  STREAMING_SERVICES,
  lookupCodeForRequest,
  filterMessagesForBotAliases,
  MAIL_PROVIDERS,
  getGlobalMailConfig,
  saveGlobalMailConfig,
  getEffectiveMailbox,
} from './lib/bot-codes.js'
import { renderBotCodesPage } from './lib/bot-codes-panel.js'
import {
  readGroupLinks,
  addGroupLinks,
  removeGroupLink,
  setGroupLinkEnabled,
  updateGroupLink,
  parseLinksInput,
  refreshAllGroupLinks,
  joinInviteWithConn,
  readSubbotLinksState,
  markSubbotJoinResult,
  probeInviteSmart,
  canVerifyGroupLinks,
  refreshLinksDistributed,
  hasCachedAvatar,
  avatarPathForCode,
  probeInviteWithConn,
} from './lib/group-links.js'
import { renderGroupLinksPage } from './lib/group-links-panel.js'
import {
  getResellerPanel,
  normalizeResellerPanel,
  readMasterSubbotsSync,
  mutateMasterSubbots,
  listResellerChildren,
  countResellerChildren,
  canResellerCreateChild,
  resellerCanGrantMaster,
  readResellerPanelFromLink,
  saveResellerConfigForSubbot,
  createSubbotEntry,
  requestSubbotSpawn,
  syncResellerPanelToLink,
} from './lib/reseller.js'
import { renderResellerPage } from './lib/reseller-panel.js'
import { renderLiveSubbotsScript } from './lib/subbot-live-ui.js'
import { safeDbWrite, safeGruposWrite } from './lib/db-sync.js'
import {
  buildRentalFromParsed,
  parseRentalFromBody,
  applyRentalChange,
  replaceRentalFields,
  extendRentalFields,
  isInfiniteRental,
  isRentalBlocked,
  resolveRentalStatus,
  formatDateTime,
  formatRemaining,
  formatRemainingLong,
  getRentalLabel,
  readRentalFromLink,
  syncRentalToLink,
  applySubBotRentalBlock,
  renewSubBotRental,
  mergeSubbotRentalFromLink,
  pauseSubBotCampaigns,
} from './lib/rental.js'
import { renderExpiredPanelPage } from './lib/expired-panel.js'
import { renderRentalTimeFields, renderRentalTimeStyles, renderRentalTimeScript } from './lib/rental-ui.js'
import {
  DEFAULT_CAMPAIGN_SCHEDULE,
  normalizeScheduleFields,
  syncCampaignSchedule,
  getScheduleStatus,
  formatScheduleCountdown,
  formatTime12h,
  isCampaignEffectivelyEnabled,
  isCampaignManuallyOn,
  applyCampaignEnabledState,
  getSpamMode,
  parseWeeklySlotsFromBody,
  countWeeklySlots,
  WEEKDAY_LABELS,
} from './lib/spam-schedule.js'
import {
  normalizeHighlightedGroups,
  isGroupHighlighted,
  sortGroupsByHighlight,
  sortGroupIdsByHighlight,
  toggleHighlightInList,
  mergeHighlightedGroups,
} from './lib/group-highlight.js'
import { toGroupSearchText } from './lib/group-search.js'
import { getSpamTimeAdvice, evaluateSpamTime, SPAM_GROUP_BRACKETS } from './lib/spam-time-advisor.js'
import {
  getDomainConfig,
  saveDomainConfig,
  isDomainModeActive,
  getPublicOrigin,
  buildSubbotPanelUrl,
  ensureLinkPanelSlug,
  ensurePanelSlugFields,
  createDomainProxyMiddleware,
  createMasterGateMiddleware,
  getMasterPanelBase,
  getMasterPanelEntryUrl,
  sanitizeMasterPath,
  invalidateSlugCache,
  getSlugRegistry,
  getSubbotSocketPath,
  prepareSubbotSocket,
  markSubbotSocketReady,
} from './lib/panel-domain.js'
import { renderLandingPage } from './lib/panel-landing.js'
import {
  readRedeemCodes,
  createRedeemCode,
  deleteRedeemCode,
  redeemCode,
  getRedemptionsForSub,
} from './lib/redeem-codes.js'
import os from 'os'
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs'
import { spawn } from 'child_process'
import cookieParser from 'cookie-parser'

(async () => {
const app = express()
app.use(cookieParser())
const _isSubBotArg = process.argv.includes('--subbot')
// Assets públicos de la landing (demo HTML/CSS/JS)
app.use('/landing-demo', express.static(path.join(process.cwd(), 'public', 'landing-demo'), {
  maxAge: '1h',
  etag: true,
}))
// 1) Sub-bots por path /id5-nombre/ (si dominio activo)
app.use(createDomainProxyMiddleware({ isSubBot: _isSubBotArg }))
// 2) Landing en / + panel maestro solo en /ruta-secreta/
app.use(createMasterGateMiddleware({ isSubBot: _isSubBotArg, renderLanding: renderLandingPage }))

const getPortAndLink = async () => {
    const isSubBot = process.argv.includes('--subbot');
    const subBotNumber = isSubBot ? process.argv[process.argv.indexOf('--number') + 1] : null;
    
    
    const linkFile = isSubBot 
        ? path.join(process.cwd(), 'usuarios', subBotNumber, 'link.json')
        : path.join(process.cwd(), 'link.json');
        
    let data = { suffix: '', port: 0 };

    try {
        if (existsSync(linkFile)) {
            data = JSON.parse(await fs.readFile(linkFile, 'utf8'));
            
            
            const argPort = process.argv.includes('--port') ? parseInt(process.argv[process.argv.indexOf('--port') + 1]) : null;
            if (argPort && data.port !== argPort) {
                console.log(`\x1b[33m[SISTEMA]\x1b[0m Actualizando puerto en ${isSubBot ? subBotNumber : 'Maestro'} de ${data.port} a ${argPort}`);
                data.port = argPort;
                await fs.writeFile(linkFile, JSON.stringify(data, null, 2));
            }

            if (!data.port || data.port < 1000 || data.port > 9000) {
                data.port = argPort || (Math.floor(Math.random() * (9000 - 1000 + 1)) + 1000);
                await fs.writeFile(linkFile, JSON.stringify(data, null, 2));
            }
            console.log(`\x1b[32m[SISTEMA]\x1b[0m \u{1F4C1} Usando puerto guardado en ${isSubBot ? subBotNumber : 'Maestro'}: ${data.port}`);
        } else {
            
            const argPort = process.argv.includes('--port') ? parseInt(process.argv[process.argv.indexOf('--port') + 1]) : null;
            const nums = Math.floor(100 + Math.random() * 900);
            const chars = Math.random().toString(36).substring(2, 5);
            data.suffix = `${nums}${chars}`;
            data.port = argPort || (Math.floor(Math.random() * (9000 - 1000 + 1)) + 1000);
            
            
            if (isSubBot) await fs.mkdir(path.dirname(linkFile), { recursive: true });
            
            await fs.writeFile(linkFile, JSON.stringify(data, null, 2));
            console.log(`\x1b[33m[SISTEMA]\x1b[0m Puerto generado y guardado para ${isSubBot ? subBotNumber : 'Maestro'}: ${data.port}`);
        }
    } catch (e) {
        console.error('\x1b[31m[ERROR CONFIG]\x1b[0m:', e.message);
        data.port = isSubBot ? 4001 : 4600;
    }
    return data;
}

const config = await getPortAndLink();
const isSubBot = process.argv.includes('--subbot');
const subBotNumber = isSubBot ? process.argv[process.argv.indexOf('--number') + 1] : null;


const PORT = process.env.PORT ? parseInt(process.env.PORT) : config.port;
const dbPath = isSubBot ? path.join(process.cwd(), 'usuarios', subBotNumber, 'database.json') : path.join(process.cwd(), 'storage', 'databases', 'database.json');

const getLocalIP = () => {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address
            }
        }
    }
    return '127.0.0.1'
}

function onHttpReady() {
    const ip = getLocalIP()
    const domainCfg = getDomainConfig()
    if (isSubBot) {
        const slug = config.panelSlug || ''
        console.log(`\n\x1b[44m\x1b[37m  PANEL SUB-BOT INICIADO (${subBotNumber})  \x1b[0m`)
        console.log(`\x1b[36mCanal interno:\x1b[0m \x1b[33m${getSubbotSocketPath(subBotNumber)}\x1b[0m`)
        if (slug) {
            console.log(`\x1b[36mAcceso público:\x1b[0m \x1b[32m/${slug}/\x1b[0m (mismo puerto del maestro, IP o dominio)`)
        }
        markSubbotSocketReady(subBotNumber)
    } else {
        console.log(`\n\x1b[42m\x1b[30m  PANEL MAESTRO INICIADO  \x1b[0m`)
        console.log(`\x1b[36mPuerto único:\x1b[0m \x1b[32m${PORT}\x1b[0m (maestro + todos los sub-bots)`)
        console.log(`\x1b[36mAcceso Maestro:\x1b[0m \x1b[32mhttp://${ip}:${PORT}${getMasterPanelBase()}/\x1b[0m`)
        console.log(`\x1b[36mLanding:\x1b[0m \x1b[32mhttp://${ip}:${PORT}/\x1b[0m`)
        console.log(`\x1b[36mSub-bots (IPv4):\x1b[0m \x1b[32mhttp://${ip}:${PORT}/#####-nombre/\x1b[0m`)
        if (domainCfg.enabled && domainCfg.domain) {
            console.log(`\x1b[36mDominio público:\x1b[0m \x1b[32m${domainCfg.protocol}://${domainCfg.domain}\x1b[0m`)
            console.log(`\x1b[36mPanel maestro (secreto):\x1b[0m \x1b[33m${domainCfg.protocol}://${domainCfg.domain}${getMasterPanelBase()}/\x1b[0m`)
            console.log(`\x1b[36mSub-bots (dominio):\x1b[0m \x1b[32m${domainCfg.protocol}://${domainCfg.domain}/#####-nombre/\x1b[0m`)
        }
        getSlugRegistry(true)
    }
}

const listenTarget = isSubBot ? prepareSubbotSocket(subBotNumber) : PORT
const server = isSubBot
    ? app.listen(listenTarget, onHttpReady)
    : app.listen(PORT, '0.0.0.0', onHttpReady)

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        if (isSubBot) {
            console.error(`\x1b[31m[ERROR]\x1b[0m El canal interno del sub-bot ${subBotNumber} ya está en uso.`);
            console.error(`\x1b[33m[SISTEMA]\x1b[0m El panel web no estará disponible para esta instancia.`);
        } else {
            console.error(`\x1b[31m[ERROR CRÍTICO]\x1b[0m El puerto Maestro ${PORT} está ocupado.`);
            process.exit(1);
        }
    } else {
        console.error(`\x1b[31m[ERROR SERVIDOR]\x1b[0m:`, err);
    }
});

const getFullSpinnerHtml = (titulo = "Guardando Publicaciones") => {
    return `
    <div id="spinner-progreso" class="fixed inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-[9999]" 
         style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; align-items: center; justify-content: center; flex-direction: column; font-family: 'Inter', sans-serif;">
        <div style="background: #15171e; padding: 40px; border-radius: 20px; border: 1px solid #0d9488; box-shadow: 0 0 30px rgba(13, 148, 136, 0.3); display: flex; flex-direction: column; align-items: center; max-width: 400px; w-full: 90%;">
            <!-- Spinner -->
            <div style="width: 60px; height: 60px; border: 5px solid rgba(13, 148, 136, 0.2); border-top: 5px solid #0d9488; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            
            <h3 id="titulo-spinner" style="color: white; font-size: 1.5rem; font-weight: bold; margin: 0 0 10px 0;">${titulo}</h3>
            <p id="mensaje-progreso" style="color: #0d9488; font-size: 0.9rem; margin: 0 0 20px 0; text-align: center;">Iniciando proceso...</p>
            
            <!-- Barra -->
            <div style="width: 100%; bg: #1c1f26; background: #1c1f26; border-radius: 10px; height: 12px; overflow: hidden; border: 1px solid #262b36;">
                <div id="barra-progreso" style="width: 0%; height: 100%; background: linear-gradient(90deg, #0d9488, #0ea5e9); transition: width 0.3s ease;"></div>
            </div>
            <div id="texto-porcentaje" style="color: white; font-weight: bold; margin-top: 10px; font-family: monospace;">0%</div>
        </div>
    </div>
    <script>
    window.gestorSpinner = {
        mostrar: function(titulo) {
            const spin = document.getElementById('spinner-progreso');
            if (spin) spin.style.display = 'flex';
            if (titulo) document.getElementById('titulo-spinner').innerText = titulo;
        },
        ocultar: function() {
            const spin = document.getElementById('spinner-progreso');
            if (spin) spin.style.display = 'none';
        },
        actualizar: function(porcentaje, mensaje) {
            const barra = document.getElementById('barra-progreso');
            const texto = document.getElementById('texto-porcentaje');
            const msg = document.getElementById('mensaje-progreso');
            if (barra) barra.style.width = porcentaje + '%';
            if (texto) texto.innerText = porcentaje + '%';
            if (msg && mensaje) msg.innerText = mensaje;
        }
    };
    </script>
    `;
}

await global.loadDatabase?.()

const db = global.db
const gruposDB = global.gruposDB

db.data ||= {}
if (!isSubBot) {
    db.data.subbots ||= {}
}
db.data.campaigns ||= { 
  "Principal": { groups: [], publications: [], interval: 600000, enabled: true, ...DEFAULT_CAMPAIGN_SCHEDULE } 
}
for (const camp of Object.values(db.data.campaigns)) {
  normalizeScheduleFields(camp)
}
db.data.activeCampaign ||= "Principal"
db.data.publicaciones ||= {}
db.data.timerState ||= {}
db.data.autoReply = ensureAutoReplyConfig(db)
db.data.accountManager = ensureAccountManager(db)
db.data.botCodes = ensureBotCodes(db)

gruposDB.data ||= {}
gruposDB.data.groups ||= []
gruposDB.data.selectedGroups ||= []
gruposDB.data.highlightedGroups = normalizeHighlightedGroups(gruposDB.data.highlightedGroups)

const defaultFields = ['chats', 'stats', 'settings', 'botGroups', 'bienvenidas']
defaultFields.forEach(f => db.data[f] ||= {})

// Seguridad del Panel - DEFECTO
db.data.panelUser ||= "admin"
db.data.panelPass ||= "1234"


if (!isSubBot) {
    const linkFile = path.join(process.cwd(), 'link.json')
    try {
        if (existsSync(linkFile)) {
            const linkData = JSON.parse(await fs.readFile(linkFile, 'utf8'))
            if (linkData.panelUser) db.data.panelUser = linkData.panelUser
            if (linkData.panelPass) db.data.panelPass = linkData.panelPass
            
            
            if (!linkData.panelUser) {
                linkData.panelUser = db.data.panelUser
                linkData.panelPass = db.data.panelPass
                await fs.writeFile(linkFile, JSON.stringify(linkData, null, 2))
            }
        }
    } catch (e) {
        console.error('Error sincronizando login maestro:', e.message)
    }
}

// NO escribir DB al arrancar el panel — evita vaciar JSON corrupto o en carrera

const authMiddleware = async (req, res, next) => {
    
    // branding-logo debe ser público: el loader del login lo pide sin cookie
    const publicPaths = ['/login', '/do-login', '/branding-logo']
    if (publicPaths.includes(req.path)) return next()

    
    
    let currentUser = "admin"
    let currentPass = "1234"

    try {
        const linkFile = isSubBot 
            ? path.join(process.cwd(), 'usuarios', subBotNumber, 'link.json')
            : path.join(process.cwd(), 'link.json');
            
        if (existsSync(linkFile)) {
            const linkData = JSON.parse(readFileSync(linkFile, 'utf8'));
            if (linkData.panelUser) currentUser = linkData.panelUser;
            if (linkData.panelPass) currentPass = linkData.panelPass;
            
            
        
            db.data.panelUser = currentUser;
            db.data.panelPass = currentPass;
        }
    } catch (e) {
        console.error('[AUTH] Error recargando link.json:', e.message);
    }

    const authCookie = req.cookies[`panel_auth_${PORT}`]
    if (authCookie === `${currentUser}:${currentPass}`) {
        return next()
    }
    
    // Si la cookie es incorrecta, limpiar y mandar a login
    res.clearCookie(`panel_auth_${PORT}`);
    res.redirect('/login')
}

const rentalMiddleware = async (req, res, next) => {
    if (!isSubBot) return next()

    const linkFile = path.join(process.cwd(), 'usuarios', subBotNumber, 'link.json')
    const linkData = readRentalFromLink(linkFile)

    if (isRentalBlocked(linkData)) {
        return res.send(renderExpiredPanelPage({
            botName: linkData.name || subBotNumber,
            expiresAt: linkData.expiresAt,
        }))
    }
    return next()
}

const requireMaster = (req, res, next) => {
    if (isSubBot) return res.status(403).send('Acceso solo para administrador maestro')
    return next()
}

const requireResellerPanel = (req, res, next) => {
    if (!isSubBot) return res.status(403).send('Acceso solo para revendedores')
    const rp = readResellerPanelFromLink(subBotNumber)
    if (!rp.enabled) {
        return res.status(403).send('Panel revendedor no activo. Contactá al administrador maestro.')
    }
    req.resellerPanel = rp
    return next()
}

app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(async (req, res, next) => { await authMiddleware(req, res, next); })
app.use(async (req, res, next) => { await rentalMiddleware(req, res, next); })

if (!isSubBot) {
    setInterval(async () => {
        try {
            for (const [number, sub] of Object.entries(db.data.subbots || {})) {
                if (!sub?.expiresAt || isInfiniteRental(sub)) continue
                if (Date.now() <= sub.expiresAt) continue
                if (resolveRentalStatus(sub) === 'expired') continue
                console.log(`\x1b[33m[RENTAL]\x1b[0m Sub-bot ${number} vencido — pausando automáticamente`)
                await applySubBotRentalBlock(number, db, fs, safeDbWrite, 'expired')
            }
        } catch (e) {
            console.error('[RENTAL] Error en verificación periódica:', e.message)
        }
    }, 60000)
}

app.get('/login', (req, res) => {
    const title = isSubBot ? `Login Usuario - ${subBotNumber}` : "Login Master - BotSpam"
    const header = isSubBot ? `<i class="fas fa-user"></i> Acceso Usuario` : `<i class="fas fa-lock"></i> Acceso Maestro`
    
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <title>${title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #0c0d0f;
                --card: #14161a;
                --primary: #c4a574;
                --border: #2a2e36;
                --text: #e8eaed;
            }
            body { 
                background: var(--bg); 
                color: var(--text); 
                font-family: 'Inter', sans-serif; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0; 
                -webkit-font-smoothing: antialiased;
            }
            .login-card { 
                background: var(--card); 
                padding: 40px; 
                border-radius: 20px; 
                border: 1px solid var(--border); 
                width: 100%;
                max-width: 380px; 
                text-align: center;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            }
            h2 { color: var(--primary); margin-bottom: 8px; font-weight: 700; font-size: 1.5rem; }
            p { color: #94a3b8; font-size: 0.9rem; margin-bottom: 32px; }
            input { 
                width: 100%; 
                padding: 14px; 
                margin: 8px 0; 
                border-radius: 12px; 
                border: 1px solid var(--border); 
                background: #1c1f26; 
                color: white; 
                box-sizing: border-box; 
                outline: none;
                transition: border-color 0.2s;
            }
            input:focus { border-color: var(--primary); }
            .pass-wrap {
                position: relative;
                margin: 8px 0;
            }
            .pass-wrap input {
                margin: 0;
                padding-right: 48px;
            }
            .pass-toggle {
                position: absolute;
                right: 12px;
                top: 50%;
                transform: translateY(-50%);
                width: auto;
                margin: 0;
                padding: 6px 8px;
                background: transparent;
                color: #94a3b8;
                border: none;
                cursor: pointer;
                font-size: 1rem;
                letter-spacing: 0;
            }
            .pass-toggle:hover { color: var(--primary); }
            .pass-toggle:active { transform: translateY(-50%) scale(0.95); }
            button { 
                width: 100%; 
                padding: 14px; 
                margin-top: 24px; 
                border-radius: 12px; 
                border: none; 
                background: var(--primary); 
                color: black; 
                font-weight: 700; 
                cursor: pointer; 
                transition: transform 0.2s;
                letter-spacing: 0.5px;
            }
            button:active { transform: scale(0.98); }
            .error { 
                background: rgba(239, 68, 68, 0.1); 
                color: #ef4444; 
                padding: 10px; 
                border-radius: 8px; 
                margin-top: 20px; 
                font-size: 0.85rem;
                border: 1px solid rgba(239, 68, 68, 0.2);
            }
        </style>
    </head>
    <body>
    ${renderLoaderBlock()}
        <div class="login-card">
            <h2>${header}</h2>
            <p>Por favor, ingrese sus credenciales</p>
            <form action="/do-login" method="POST">
                <input type="text" name="user" placeholder="Usuario" required>
                <div class="pass-wrap">
                    <input type="password" name="pass" id="loginPass" placeholder="Contraseña" required>
                    <button type="button" class="pass-toggle" id="togglePass" title="Mostrar / ocultar" aria-label="Mostrar u ocultar contraseña">
                        <i class="fas fa-eye" id="togglePassIcon"></i>
                    </button>
                </div>
                <button type="submit">INICIAR SESIÓN <i class="fas fa-arrow-right" style="margin-left:8px"></i></button>
                ${req.query.error ? '<div class="error">Credenciales incorrectas. Verifique e intente nuevamente.</div>' : ''}
            </form>
        </div>
        <script>
            (function(){
                var btn = document.getElementById('togglePass');
                var input = document.getElementById('loginPass');
                var icon = document.getElementById('togglePassIcon');
                if (!btn || !input || !icon) return;
                btn.addEventListener('click', function(){
                    var show = input.type === 'password';
                    input.type = show ? 'text' : 'password';
                    icon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
                });
            })();
        </script>
    </body>
    </html>
    `);
});

app.post('/do-login', async (req, res) => {
    const { user, pass } = req.body;
    console.log(`[LOGIN] Intento de acceso: user=${user}, pass=${pass}`);
    
    
    let panelUser = "admin";
    let panelPass = "1234";

    try {
        const linkFile = isSubBot 
            ? path.join(process.cwd(), 'usuarios', subBotNumber, 'link.json')
            : path.join(process.cwd(), 'link.json');
            
        if (existsSync(linkFile)) {
            const linkData = JSON.parse(readFileSync(linkFile, 'utf8'));
            if (linkData.panelUser) panelUser = linkData.panelUser;
            if (linkData.panelPass) panelPass = linkData.panelPass;
        }
    } catch (e) {
        console.error('[LOGIN] Error leyendo link.json:', e.message);
    }

    if (user === panelUser && pass === panelPass) {
        console.log('[LOGIN] Acceso concedido');
        
        res.cookie(`panel_auth_${PORT}`, `${panelUser}:${panelPass}`, { 
            maxAge: 30 * 24 * 60 * 60 * 1000, 
            path: '/',
            httpOnly: true,
            sameSite: 'lax'
        });
        return res.redirect('/');
    }
    
    console.log(`[LOGIN] Acceso denegado. Esperado: ${db.data.panelUser}:${db.data.panelPass}`);
    res.redirect('/login?error=1');
});


const imagesPath = getImagesPath(isSubBot, subBotNumber)
const deletePubImage = (image) =>
  safeDeletePublicationImage(image, { isSubBot, subBotNumber })
app.use('/images', express.static(imagesPath))

function buildSubbotStatusMap(subbotsMap = {}) {
  const publicIP = getLocalIP()
  const reg = getSlugRegistry()
  const subbots = {}
  for (const [number, data] of Object.entries(subbotsMap || {})) {
    const rentalStatus = resolveRentalStatus(data)
    let panelSlug = data.panelSlug || null
    let panelId = data.panelId || null
    for (const [, entry] of reg) {
      if (entry.number === number) {
        panelSlug = entry.panelSlug
        panelId = entry.panelId
        break
      }
    }
    const panelUrl = buildSubbotPanelUrl({
      panelSlug: panelSlug || data.panelSlug,
      publicIP,
      masterPort: PORT,
    })
    subbots[number] = {
      number,
      name: data.name || null,
      status: data.status || 'offline',
      pairingCode: data.pairingCode || null,
      port: data.port || null,
      panelId,
      panelSlug,
      panelUrl,
      rentalStatus,
      expiresAt: data.expiresAt || null,
      rentalInfinite: !!data.rentalInfinite,
    }
  }
  return { subbots, publicIP }
}

// Estado en tiempo real de sub-bots (panel maestro)
app.get('/status', (req, res) => {
  try {
    if (isSubBot) return res.status(403).json({ error: 'Solo maestro' })
    const { subbots, publicIP } = buildSubbotStatusMap(db.data.subbots || {})
    res.json({
      ok: true,
      publicIP,
      masterPort: PORT,
      domainMode: isDomainModeActive(),
      publicOrigin: getPublicOrigin(),
      subbots,
      ts: Date.now(),
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Estado en tiempo real — solo hijos del revendedor actual
app.get('/reseller/status', requireResellerPanel, (req, res) => {
  try {
    const all = readMasterSubbotsSync()
    const filtered = Object.fromEntries(listResellerChildren(all, subBotNumber))
    const { subbots, publicIP } = buildSubbotStatusMap(filtered)
    res.json({
      ok: true,
      publicIP,
      masterPort: PORT,
      domainMode: isDomainModeActive(),
      publicOrigin: getPublicOrigin(),
      subbots,
      ts: Date.now(),
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// --- ENDPOINTS PARA EL BOT PRINCIPAL ---
app.get('/principal-status', (req, res) => {
    if (global.isRestarting) {
        return res.json({ status: 'restarting' });
    }
    
    // Si no hay conexión o ni siquiera se ha inicializado global.conn
    if (!global.conn) {
        return res.json({ status: 'waiting' });
    }

    if (global.conn.user) {
        return res.json({ 
            status: 'online', 
            user: global.conn.user.id.split(':')[0] || global.conn.user.id.split('@')[0] 
        });
    }
    if (global.principalQR) {
        return res.json({ status: 'qr', qr: global.principalQR });
    }
    res.json({ status: 'waiting' });
});

app.post('/restart-main', (req, res) => {
    console.log('\x1b[33m[SISTEMA]\x1b[0m Reinicio del Bot Principal solicitado desde Web.');
    res.send('<script>alert("Reiniciando sistema..."); window.location.href="/";</script>');
    setTimeout(() => process.exit(1), 1000);
});

app.post('/logout-main', async (req, res) => {
    const { deleteData } = req.body;
    const shouldDeleteAll = deleteData === "true";
    
    console.log(`\x1b[31m[SISTEMA]\x1b[0m Solicitud de cierre de sesión del Bot Principal. (Borrar todo: ${shouldDeleteAll})`);
    
    try {
        // 1. Siempre borramos la sesión
        const sessionsDir = path.join(process.cwd(), 'sessions');
        if (existsSync(sessionsDir)) {
            const sessionFiles = readdirSync(sessionsDir);
            for (const file of sessionFiles) {
                // Borrar TODO lo que esté en sessions/ para asegurar cierre total
                const filePath = path.join(sessionsDir, file);
                try {
                    await fs.unlink(filePath);
                } catch (err) {
                    console.error(`[Error al borrar ${file}]:`, err.message);
                }
            }
            console.log('\x1b[32m[LIMPIEZA]\x1b[0m Carpeta sessions/ vaciada correctamente.');
        }

        // 2. Si el usuario pidió borrar TODO
        if (shouldDeleteAll) {
            console.log('\x1b[33m[LIMPIEZA]\x1b[0m Eliminando bases de datos y archivos...');
            
            // Borrar database.json (publicaciones, campañas)
            const dbP = path.join(process.cwd(), 'storage', 'databases', 'database.json');
            if (existsSync(dbP)) await fs.unlink(dbP);
            
            // Borrar grupos.json
            const grP = path.join(process.cwd(), 'storage', 'databases', 'grupos.json');
            if (existsSync(grP)) await fs.unlink(grP);
            
            // Borrar carpeta de imágenes del principal
            const imgP = path.join(process.cwd(), 'storage', 'images');
            if (existsSync(imgP)) {
                const files = readdirSync(imgP);
                for (const file of files) {
                    await fs.unlink(path.join(imgP, file)).catch(() => {});
                }
            }
            
            res.send('<script>alert("SISTEMA RESETEADO: Se eliminó la sesión y TODOS los datos. Reinciciando..."); window.location.href="/";</script>');
        } else {
            res.send('<script>alert("SESIÓN CERRADA: Se mantuvo tu configuración y archivos. Reinciciando..."); window.location.href="/";</script>');
        }

        setTimeout(() => process.exit(1), 1500);
    } catch (e) {
        console.error('[ERROR LOGOUT]', e);
        res.status(500).send('Error en el proceso: ' + e.message);
    }
});

app.post('/principal-link-code', async (req, res) => {
    const { num } = req.body;
    if (!num) return res.status(400).send('Número requerido');
    try {
        if (global.conn && typeof global.conn.requestPairingCode === 'function') {
            let code = await global.conn.requestPairingCode(num.replace(/\D/g, ''));
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            res.json({ code });
        } else {
            res.status(500).send('Instancia de bot no lista');
        }
    } catch (e) {
        res.status(500).send(e.message);
    }
});
// ---------------------------------------

const upload = multer({ storage: multer.memoryStorage() })

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
}

function renderMaskedSpan(value, { className = 'info-value', style = '' } = {}) {
  const safe = escapeAttr(value || '---')
  const cls = ['mask-field', className].filter(Boolean).join(' ')
  const styleAttr = style ? ` style="${style}"` : ''
  return `<span class="${cls}"${styleAttr} data-value="${safe}" data-hidden="1" title="Clic para mostrar" onclick="toggleSensitive(this)">${'&bull;'.repeat(8)}</span>`
}

app.get('/', async (req, res) => {
  // Intentamos leer la DB pero no dejamos que bloquee el renderizado si falla
  try {
  } catch (e) {}
  
  if (isSubBot) {
      return res.redirect('/panel-master')
  }

  // Obtenemos los subbots desde la DB cargada
  const subbots = (db && db.data && db.data.subbots) ? db.data.subbots : {};
  const usuariosDir = path.join(process.cwd(), 'usuarios')
  
  // Sincronización de carpetas de subbots
  try {
      if (existsSync(usuariosDir)) {
          const folders = readdirSync(usuariosDir).filter(f => {
              try {
                const folderPath = path.join(usuariosDir, f)
                return statSync(folderPath).isDirectory() && existsSync(path.join(folderPath, 'link.json'))
              } catch (e) { return false }
          })
          
          for (const number of folders) {
              try {
                  const linkPath = path.join(usuariosDir, number, 'link.json')
                  const linkData = JSON.parse(readFileSync(linkPath, 'utf8'))
                  if (subbots[number]) {
                      subbots[number].panelUser = linkData.panelUser || subbots[number].panelUser
                      subbots[number].panelPass = linkData.panelPass || subbots[number].panelPass
                      subbots[number].name = linkData.name || subbots[number].name
                      subbots[number] = mergeSubbotRentalFromLink(subbots[number], linkData)
                  }
              } catch (e) {}
          }
      }
  } catch (err) {
      console.error('[MAESTRO] Error sincronizando sub-bots para la UI:', err.message)
  }

  const publicIP = getLocalIP()
  const domainCfg = getDomainConfig()
  const domainOn = isDomainModeActive()
  // Asegurar slugs de todos los sub-bots visibles
  getSlugRegistry(true)

  const subbotList = Object.entries(subbots)
  const dashTotal = subbotList.length
  const dashOnline = subbotList.filter(([, d]) => d.status === 'online' && resolveRentalStatus(d) === 'active').length
  const dashPaused = subbotList.filter(([, d]) => resolveRentalStatus(d) === 'paused').length
  const dashExpired = subbotList.filter(([, d]) => resolveRentalStatus(d) === 'expired').length
  const brandingCfg = getText3dConfig()
  const themeCfg = getThemeConfig()
  // Migrar IMAP local del maestro → archivo global (una vez)
  try {
    const existing = ensureBotCodes(db)
    const g = getGlobalMailConfig()
    if (!g.mailbox?.password && existing.mailboxes?.[0]?.password) {
      saveGlobalMailConfig({
        domain: existing.domain,
        mailbox: existing.mailboxes[0],
      })
    }
  } catch { /* ignore */ }
  const globalMail = getGlobalMailConfig()
  const botCodesCfg = ensureBotCodes(db)
  const botMail = globalMail.mailbox || {}
  const codeTiming = globalMail.responseTiming || {
    minReadSec: 2,
    maxReadSec: 5,
    minTypingSec: 3,
    maxTypingSec: 8,
  }
  const mailProviderOpts = MAIL_PROVIDERS.map(
    (p) =>
      `<option value="${escapeAttr(p.id)}"${(botMail.provider || 'spacemail') === p.id ? ' selected' : ''}>${escapeAttr(p.label)}</option>`
  ).join('')
  const mailPresetsJson = JSON.stringify(
    Object.fromEntries(
      MAIL_PROVIDERS.map((p) => [
        p.id,
        { imapHost: p.imapHost, imapPort: p.imapPort, smtpHost: p.smtpHost, smtpPort: p.smtpPort },
      ])
    )
  )

  // Códigos de canje
  const redeemCodesList = readRedeemCodes().codes || []
  const codesTotal = redeemCodesList.length
  const { links: masterGroupLinks } = readGroupLinks()
  const glTotal = masterGroupLinks.length
  const glAlive = masterGroupLinks.filter((l) => l.enabled !== false && l.status === 'alive').length
  const glFree = masterGroupLinks.filter((l) => l.enabled !== false && l.status === 'alive' && !l.joinApprovalMode).length
  const glApproval = masterGroupLinks.filter((l) => l.enabled !== false && l.status === 'alive' && l.joinApprovalMode).length
  const glDead = masterGroupLinks.filter((l) => l.status === 'dead').length

  const codesCardsHtml = codesTotal === 0
    ? `<div class="code-empty"><i class="fas fa-ticket"></i><p>Aún no has generado códigos. Crea uno para que tus clientes sumen tiempo.</p></div>`
    : redeemCodesList.map(c => {
        const used = c.redemptions.length
        const full = used >= c.maxUses
        const reward = c.rentalInfinite ? 'Tiempo infinito' : getRentalLabel(c.durationValue, { rentalInfinite: c.rentalInfinite })
        const lastUses = c.redemptions.slice(-3).reverse().map(r =>
          `<li>${escapeAttr(r.subName || r.subId)} · ${formatDateTime(r.at)}</li>`
        ).join('')
        return `
        <div class="code-card ${full ? 'code-full' : ''}">
          <div class="code-card-top">
            <div class="code-value" title="Clic para copiar" onclick="copyCode('${c.code}', this)">
              <i class="fas fa-ticket"></i><span>${c.code}</span><i class="fas fa-copy code-copy-ic"></i>
            </div>
            <button class="code-del" title="Eliminar código" onclick="deleteCode('${c.id}', this)"><i class="fas fa-trash-can"></i></button>
          </div>
          ${c.label ? `<div class="code-label">${escapeAttr(c.label)}</div>` : ''}
          <div class="code-meta">
            <span class="code-chip reward"><i class="fas fa-gift"></i> +${reward}</span>
            <span class="code-chip ${full ? 'danger' : 'ok'}"><i class="fas fa-users"></i> ${used}/${c.maxUses} usos</span>
          </div>
          ${lastUses ? `<ul class="code-uses">${lastUses}</ul>` : `<p class="code-nouse">Nadie lo ha canjeado todavía.</p>`}
        </div>`
      }).join('')

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dashboard | ${escapeAttr(brandingCfg.brand)} ${escapeAttr(brandingCfg.version)}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-body: #0c0d0f;
            --bg-card: #14161a;
            --bg-input: #0f1114;
            --primary: #c4a574;
            --primary-dim: rgba(196, 165, 116, 0.16);
            --primary-glow: rgba(196, 165, 116, 0.28);
            --secondary: #d4b896;
            --accent: #6b7280;
            --danger: #d97a7a;
            --text-main: #e8eaed;
            --text-dim: #8b929e;
            --border: #2a2e36;
            --radius-lg: 0px;
            --radius-md: 0px;
            --shadow: none;
        }

        @keyframes fadeUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
            0%, 100% { opacity: 0.55; }
            50% { opacity: 0.85; }
        }
        @keyframes orbDrift {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(12px, -14px, 0); }
        }
        @keyframes statusPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.65; }
        }
        @keyframes liveBar {
            0% { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body { 
            font-family: 'IBM Plex Sans', 'Inter', system-ui, -apple-system, sans-serif; 
            background: var(--bg-body); 
            color: var(--text-main); 
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
            position: relative;
            min-height: 100vh;
        }
        body::before,
        body::after { display: none; }
        .ambient, .orb { display: none !important; }

        .container { max-width: 1240px; margin: 0 auto; padding: 24px; position: relative; z-index: 1; }

        .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 20px; 
            background: var(--bg-card);
            padding: 20px 22px; 
            border-radius: 0; 
            border: 1px solid var(--border);
            box-shadow: none;
            animation: fadeUp 0.4s ease;
            position: relative;
            overflow: hidden;
        }
        .header::before { display: none; }

        .header-title h1,
        .header-title .brand-heading {
            font-family: 'IBM Plex Sans', 'Inter', sans-serif;
            font-size: clamp(1.2rem, 3vw, 1.45rem);
            letter-spacing: -0.02em;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
            color: var(--text-main);
            -webkit-text-fill-color: var(--text-main);
            background: none;
            font-weight: 600;
        }
        .header-title h1 i {
            color: var(--primary);
            -webkit-text-fill-color: var(--primary);
            filter: none;
        }
        .header-title small {
            color: var(--text-dim);
            font-weight: 500;
            display: block;
            margin-top: 6px;
            font-size: 0.82rem;
            letter-spacing: 0.12em;
            text-transform: uppercase;
        }
        .header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

        .dash-stats {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 1px;
            margin-bottom: 22px;
            background: var(--border);
            border: 1px solid var(--border);
            animation: fadeUp 0.55s ease 0.08s backwards;
        }
        .dash-stat {
            background: var(--bg-card);
            border: none;
            border-radius: 0;
            padding: 14px 16px;
            text-align: left;
            transition: none;
        }
        .dash-stat:hover { transform: none; border-color: transparent; }
        .dash-stat-val {
            font-family: 'IBM Plex Mono', 'Space Grotesk', monospace;
            font-size: 1.35rem;
            font-weight: 500;
            line-height: 1;
            margin-bottom: 6px;
        }
        .dash-stat-lbl {
            font-size: 0.65rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-dim);
            font-weight: 500;
        }
        .dash-stat.stat-total .dash-stat-val { color: var(--text-main); }
        .dash-stat.stat-online .dash-stat-val { color: var(--primary); text-shadow: none; }
        .dash-stat.stat-paused .dash-stat-val { color: var(--warning, #d4a574); }
        .dash-stat.stat-expired .dash-stat-val { color: var(--danger); }

        .nav-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 18px;
            padding: 0;
            background: transparent;
            backdrop-filter: none;
            border: none;
            border-bottom: 1px solid var(--border);
            border-radius: 0;
            animation: fadeUp 0.5s ease 0.1s backwards;
        }

        .nav-links { display: flex; gap: 0; flex-wrap: wrap; }
        .nav-links a { 
            color: var(--text-dim); 
            text-decoration: none; 
            font-weight: 500; 
            font-size: 13px; 
            display: inline-flex; 
            align-items: center; 
            gap: 8px; 
            padding: 10px 14px;
            border-radius: 0;
            border: none;
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
            transition: color 0.15s, border-color 0.15s;
        }
        .nav-links a:hover { color: var(--text-main); background: transparent; }
        .nav-links a.active {
            color: var(--text-main);
            background: transparent;
            border-color: transparent;
            border-bottom-color: var(--primary);
            box-shadow: none;
        }

        .clients-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 16px;
            margin-bottom: 18px;
            flex-wrap: wrap;
            animation: fadeUp 0.55s ease 0.12s backwards;
        }
        .clients-title {
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 1.05rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 4px;
            letter-spacing: -0.02em;
        }
        .clients-title i { color: var(--primary); }
        .clients-sub { font-size: 0.85rem; color: var(--text-dim); }

        /* â”€â”€ Códigos de canje â”€â”€ */
        .codes-section {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 0;
            padding: 16px;
            margin-bottom: 24px;
            animation: fadeUp 0.55s ease 0.1s backwards;
        }
        .codes-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 16px;
            flex-wrap: wrap;
            margin-bottom: 18px;
        }
        .codes-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 14px;
        }
        .codes-grid.is-collapsed .code-card:nth-child(n+4) {
            display: none;
        }
        .codes-more-wrap {
            display: flex;
            justify-content: center;
            margin-top: 14px;
        }
        .codes-more-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-radius: 0;
            border: 1px solid var(--border);
            background: transparent;
            color: var(--text-dim);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: border-color .15s, color .15s;
        }
        .codes-more-btn:hover {
            border-color: #3d4450;
            color: var(--text-main);
            background: transparent;
        }
        .codes-more-btn i { font-size: 0.75rem; transition: transform .25s ease; }
        .codes-more-btn.is-open i { transform: rotate(180deg); }
        .code-card {
            background: #15171e;
            border: 1px solid rgba(13,148,136,0.18);
            border-radius: 14px;
            padding: 14px 15px;
            transition: opacity .25s ease, transform .25s ease, border-color .2s ease;
        }
        .code-card.code-full { border-color: rgba(255,99,99,0.3); opacity: 0.85; }
        .code-card-top { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
        .code-value {
            display: flex; align-items: center; gap: 8px;
            font-family: 'Space Grotesk', monospace;
            font-weight: 700; font-size: 1rem; letter-spacing: 1px;
            color: var(--primary); cursor: pointer; user-select: all;
            background: rgba(13,148,136,0.08); padding: 7px 11px; border-radius: 9px;
            flex: 1; transition: background .2s ease;
        }
        .code-value:hover { background: rgba(13,148,136,0.16); }
        .code-value.copied { background: rgba(13,148,136,0.3); }
        .code-value span { flex: 1; }
        .code-copy-ic { font-size: 0.8rem; opacity: 0.7; }
        .code-del {
            background: rgba(255,62,62,0.12); border: none; color: #ff6363;
            width: 34px; height: 34px; border-radius: 9px; cursor: pointer;
            flex-shrink: 0; transition: background .2s ease;
        }
        .code-del:hover { background: rgba(255,62,62,0.25); }
        .code-label { font-size: 0.82rem; color: var(--text-dim); margin: 10px 0 0; }
        .code-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
        .code-chip {
            font-size: 0.72rem; padding: 4px 9px; border-radius: 20px;
            display: inline-flex; align-items: center; gap: 5px; font-weight: 600;
        }
        .code-chip.reward { background: rgba(14,165,233,0.15); color: #38bdf8; }
        .code-chip.ok { background: rgba(13,148,136,0.13); color: var(--primary); }
        .code-chip.danger { background: rgba(255,62,62,0.15); color: #ff6363; }
        .code-uses {
            list-style: none; margin: 12px 0 0; padding: 10px 0 0;
            border-top: 1px solid rgba(255,255,255,0.06);
            font-size: 0.74rem; color: var(--text-dim);
        }
        .code-uses li { padding: 2px 0; }
        .code-nouse { font-size: 0.74rem; color: var(--text-dim); margin: 12px 0 0; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); }
        .code-empty {
            grid-column: 1 / -1; text-align: center; padding: 30px 16px; color: var(--text-dim);
        }
        .code-empty i { font-size: 2rem; color: rgba(13,148,136,0.4); margin-bottom: 10px; }
        .code-empty p { font-size: 0.88rem; }

        /* â”€â”€ Toasts â”€â”€ */
        #toastWrap {
            position: fixed; bottom: 22px; right: 22px; z-index: 12000;
            display: flex; flex-direction: column; gap: 10px; max-width: 90vw;
        }
        .toast {
            display: flex; align-items: center; gap: 10px;
            background: #15171e; color: #fff; padding: 13px 17px;
            border-radius: 12px; font-size: 0.88rem; font-family: 'Inter', sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            border-left: 4px solid var(--primary);
            opacity: 0; transform: translateX(40px); transition: all .35s cubic-bezier(.2,.9,.3,1.2);
        }
        .toast.show { opacity: 1; transform: translateX(0); }
        .toast.toast-error { border-left-color: #ff3e3e; }
        .toast.toast-ok i { color: var(--primary); }
        .toast.toast-error i { color: #ff3e3e; }

        .grid-users { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); 
            gap: 18px; 
        }

        .user-card { 
            background: #11151c;
            border-radius: 12px; 
            padding: 0 0 16px; 
            border: 1px solid rgba(148, 163, 184, 0.12);
            position: relative;
            overflow: hidden;
            transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
            animation: fadeUp 0.45s ease backwards;
            box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset, 0 10px 28px rgba(0,0,0,0.22);
        }
        .user-card::before {
            content: '';
            position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 3px;
            background: #475569;
        }
        .user-card.is-online::before { background: linear-gradient(180deg, #34d399, #14b8a6); box-shadow: 0 0 12px rgba(52, 211, 153, 0.35); }
        .user-card.is-online {
            border-color: rgba(20, 184, 166, 0.22);
            background: linear-gradient(165deg, rgba(20, 184, 166, 0.08) 0%, #11151c 42%);
            box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset, 0 10px 28px rgba(0,0,0,0.22), 0 0 28px rgba(20, 184, 166, 0.08);
        }
        .user-card.is-pairing::before,
        .user-card.is-connecting::before { background: #d97706; }
        .user-card.is-offline::before,
        .user-card.is-expired::before,
        .user-card.is-error_session::before { background: #ef4444; }
        .user-card.is-paused::before { background: #64748b; }
        .user-card:hover {
            transform: translateY(-4px);
            border-color: rgba(20, 184, 166, 0.35);
            box-shadow: 0 1px 0 rgba(255,255,255,0.05) inset, 0 20px 44px rgba(0,0,0,0.38), 0 0 36px rgba(20, 184, 166, 0.12);
        }
        .user-card.hero-card {
            grid-column: 1 / -1;
            border-color: rgba(20, 184, 166, 0.3);
            background: linear-gradient(180deg, rgba(20, 184, 166, 0.12) 0%, #11151c 55%);
        }
        .card-accent { display: none; }

        .card-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 18px 0 20px; gap: 12px; }
        .card-identity { display: flex; gap: 12px; align-items: flex-start; min-width: 0; flex: 1; }
        .card-avatar {
            width: 42px;
            height: 42px;
            border-radius: 10px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Space Grotesk', sans-serif;
            font-weight: 700;
            font-size: 0.95rem;
            color: #e2e8f0;
            background: #1e293b;
            border: 1px solid rgba(148, 163, 184, 0.22);
            letter-spacing: 0.02em;
        }
        .card-name {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 1rem;
            font-weight: 700;
            margin-bottom: 3px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 190px;
            color: #f1f5f9;
            letter-spacing: -0.01em;
        }
        .card-phone {
            color: #94a3b8;
            font-size: 0.8rem;
            display: flex;
            align-items: center;
            gap: 6px;
            text-decoration: none;
        }
        .card-phone .mask-field { text-decoration: none; border-bottom: none; color: #94a3b8 !important; }
        .card-phone .mask-field:hover { color: #cbd5e1 !important; }

        .card-body-info {
            background: rgba(15, 23, 42, 0.55);
            border-radius: 10px;
            padding: 0;
            margin: 14px 18px 0 20px;
            border: 1px solid rgba(148, 163, 184, 0.1);
            overflow: hidden;
        }
        .card-body-info .info-section-label {
            font-size: 0.65rem;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: #64748b;
            font-weight: 700;
            margin: 0;
            padding: 10px 14px 8px;
            background: rgba(30, 41, 59, 0.45);
            border-bottom: 1px solid rgba(148, 163, 184, 0.08);
        }
        .card-actions {
            display: flex;
            flex-wrap: nowrap;
            gap: 8px;
            padding: 14px 18px 0 20px;
            align-items: stretch;
        }
        .card-actions .btn { min-height: 40px; border-radius: 8px; font-weight: 600; font-size: 0.82rem; }
        .card-actions .btn-primary-link {
            flex: 1.4;
            background: #0f766e !important;
            color: #ecfdf5 !important;
            border: 1px solid rgba(45, 212, 191, 0.25) !important;
            text-decoration: none !important;
        }
        .card-actions .btn-primary-link:hover {
            background: #0d9488 !important;
            box-shadow: 0 6px 18px rgba(15, 118, 110, 0.3);
        }
        .card-actions .btn-edit {
            flex: 1;
            background: #1e293b !important;
            color: #e2e8f0 !important;
            border: 1px solid rgba(148, 163, 184, 0.2) !important;
        }
        .card-actions .btn-edit:hover { background: #334155 !important; }
        .card-actions .btn-icon {
            width: 40px;
            min-width: 40px;
            padding: 0;
            flex-shrink: 0;
        }
        .card-actions .btn-restart {
            background: #312e81 !important;
            color: #e0e7ff !important;
            border: 1px solid rgba(129, 140, 248, 0.28) !important;
        }
        .card-actions .btn-restart:hover { background: #3730a3 !important; }
        
        .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.82rem;
            margin: 0;
            padding: 9px 14px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.06);
        }
        .info-row:last-child { margin-bottom: 0; border-bottom: none; }
        .info-label { color: #64748b; font-weight: 500; letter-spacing: 0.01em; }
        .info-value { color: #94a3b8; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.8rem; }
        .info-value.plan-val { color: #5eead4; font-weight: 600; }
        .mask-field {
            cursor: pointer;
            user-select: none;
            color: #94a3b8 !important;
            border-bottom: 1px dotted rgba(148, 163, 184, 0.35);
            transition: color 0.2s, border-color 0.2s;
            text-decoration: none;
        }
        .mask-field:hover {
            border-bottom-color: #5eead4;
            color: #5eead4 !important;
        }
        .mask-field.revealed {
            border-bottom-style: solid;
            border-bottom-color: rgba(94, 234, 212, 0.35);
            color: #e2e8f0 !important;
        }
        .masked-phone {
            font-family: ui-monospace, SFMono-Regular, monospace;
            letter-spacing: 0.02em;
        }

        .status-pill { 
            font-size: 0.68rem; 
            font-weight: 700; 
            padding: 5px 10px 5px 8px; 
            border-radius: 6px; 
            text-transform: uppercase; 
            letter-spacing: 0.06em;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }
        .status-pill::before {
            content: '';
            width: 6px; height: 6px;
            border-radius: 50%;
            background: currentColor;
            box-shadow: 0 0 0 3px rgba(255,255,255,0.04);
        }
        .status-online { background: rgba(20, 184, 166, 0.12); color: #5eead4; border: 1px solid rgba(45, 212, 191, 0.28); }
        .status-online::before { animation: statusPulse 2s ease-out infinite; }
        .status-pairing, .status-connecting { background: rgba(217, 119, 6, 0.1); color: #fbbf24; border: 1px solid rgba(217, 119, 6, 0.25); }
        .status-offline, .status-error_session { background: rgba(239, 68, 68, 0.08); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
        .status-expired { background: rgba(239, 68, 68, 0.12); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.28); }
        .status-paused { background: rgba(100, 116, 139, 0.12); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.22); }
        .rental-badge {
            font-size: 0.72rem;
            color: #64748b;
            margin-top: 6px;
            display: flex;
            align-items: center;
            gap: 5px;
            flex-wrap: wrap;
        }
        .rental-badge strong { color: #cbd5e1; font-weight: 600; }
        .rental-badge .rem-chip {
            background: rgba(30, 41, 59, 0.9);
            border: 1px solid rgba(148, 163, 184, 0.14);
            color: #94a3b8;
            padding: 1px 7px;
            border-radius: 999px;
            font-size: 0.68rem;
        }
        .reseller-chip, .parent-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 0.65rem;
            padding: 2px 8px;
            border-radius: 999px;
            margin-top: 4px;
            margin-right: 6px;
        }
        .reseller-chip {
            background: rgba(196, 165, 116, 0.12);
            border: 1px solid rgba(196, 165, 116, 0.35);
            color: #d4b896;
        }
        .parent-chip {
            background: rgba(56, 189, 248, 0.1);
            border: 1px solid rgba(56, 189, 248, 0.28);
            color: #7dd3fc;
        }
        .btn-reseller { min-width: 40px; }
        ${renderRentalTimeStyles()}

        .btn { 
            font-family: inherit;
            font-size: 0.875rem;
            font-weight: 600;
            padding: 8px 12px; 
            border-radius: 0; 
            border: 1px solid var(--border); 
            cursor: pointer; 
            display: inline-flex; 
            align-items: center; 
            justify-content: center;
            gap: 8px;
            transition: filter 0.15s, border-color 0.15s;
            text-decoration: none;
            font-family: inherit;
            font-weight: 600;
            font-size: 13px;
        }
        .btn:active { transform: none; filter: brightness(0.96); }
        .btn-primary {
            background: var(--primary);
            color: var(--bg-body);
            border: 1px solid var(--primary);
            box-shadow: none;
        }
        .btn-primary:hover { background: var(--primary); filter: brightness(1.05); transform: none; }
        .btn-secondary { background: transparent; color: var(--text-main); border: 1px solid var(--border); }
        .btn-ghost { background: transparent; color: var(--text-dim); border: 1px solid var(--border); }
        .btn-danger { background: transparent; color: var(--danger); border: 1px solid #4a3030; }
        .btn-danger:hover { background: transparent; color: var(--danger); border-color: var(--danger); filter: brightness(1.08); }

        .pairing-box { 
            background: var(--bg-input); 
            padding: 14px 16px; 
            border-radius: 0; 
            margin: 12px 18px 0 20px; 
            text-align: center;
            border: 1px solid var(--border);
        }
        .pairing-box p { margin: 0; }
        .pairing-code { 
            font-family: 'IBM Plex Mono', monospace; 
            font-size: 1.25rem; 
            color: var(--primary); 
            letter-spacing: 0.12em; 
            margin: 8px 0;
            font-weight: 600;
        }

        .modal { 
            display: none; 
            position: fixed; 
            inset: 0; 
            background: rgba(0,0,0,0.72); 
            backdrop-filter: none;
            z-index: 1000; 
            padding: 16px;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
        }
        .modal-content { 
            background: var(--bg-card); 
            max-width: 450px; 
            width: calc(100% - 8px);
            margin: 24px auto 32px; 
            padding: 22px 18px; 
            border-radius: 0;
            border: 1px solid var(--border);
            box-shadow: none;
            box-sizing: border-box;
            max-height: calc(100dvh - 48px);
            overflow-y: auto;
        }

        input { 
            width: 100%; 
            padding: 8px 10px; 
            margin: 8px 0 16px; 
            background: var(--bg-input); 
            border: 1px solid var(--border); 
            color: var(--text-main); 
            border-radius: 0; 
            outline: none;
            transition: border-color 0.15s;
            font-family: inherit;
            font-size: 13px;
        }
        input:focus { border-color: var(--primary); }
        label {
            font-size: 11px;
            color: var(--text-dim);
            font-weight: 500;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        .modal-content select {
            width: 100%;
            padding: 8px 10px;
            margin: 8px 0 16px;
            background: var(--bg-input);
            border: 1px solid var(--border);
            color: var(--text-main);
            border-radius: 0;
            outline: none;
            font-size: 13px;
            cursor: pointer;
            transition: border-color 0.15s;
            -webkit-appearance: none;
            appearance: none;
            font-family: inherit;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b929e' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 14px center;
        }
        .modal-content select:focus { border-color: var(--primary); }
        .modal-content select option { background: var(--bg-card); color: var(--text-main); }
        .modal-content input[type="checkbox"] { width: auto; margin: 0; }

        /* Config modal tabs — estilo Códigos */
        .cfg-tabs {
            display: flex; flex-wrap: wrap; gap: 0;
            margin: 0 0 16px; padding: 0;
            background: transparent; border: none; border-bottom: 1px solid var(--border); border-radius: 0;
        }
        .cfg-tab {
            flex: 1 1 auto; min-width: calc(50% - 4px);
            padding: 10px 8px; border: none; border-radius: 0; cursor: pointer;
            background: transparent; color: var(--text-dim); font-size: 11px;
            font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase;
            font-family: inherit; line-height: 1.25; transition: color .15s, border-color .15s;
            border-bottom: 2px solid transparent; margin-bottom: -1px;
        }
        .cfg-tab:hover { color: var(--text-main); background: transparent; }
        .cfg-tab.is-on {
            color: var(--text-main); background: transparent;
            border-bottom-color: var(--primary);
            box-shadow: none;
        }
        .cfg-pane { display: none; }
        .cfg-pane.is-on { display: block; }
        .cfg-sec-title {
            font-size: 0.78rem; color: var(--text-main); font-weight: 600;
            letter-spacing: -0.01em; margin-bottom: 12px; text-transform: none;
        }
        @media (min-width: 520px) {
            .cfg-tab { min-width: calc(33.33% - 4px); font-size: 11px; padding: 10px 8px; }
        }

        /* Tema global */
        .theme-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 10px;
            margin-bottom: 14px;
        }
        .theme-card {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 10px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--bg-input);
            cursor: pointer;
            transition: border-color .15s, box-shadow .15s, transform .12s;
        }
        .theme-card:hover { border-color: var(--primary); transform: translateY(-1px); }
        .theme-card.is-on {
            border-color: var(--primary);
            box-shadow: 0 0 0 1px var(--primary-glow), 0 8px 20px rgba(0,0,0,0.15);
        }
        .theme-swatch {
            height: 52px;
            border-radius: 10px;
            position: relative;
            overflow: hidden;
            border: 1px solid var(--border);
        }
        .theme-swatch i {
            position: absolute;
            left: 10px; bottom: 10px;
            width: 28px; height: 22px;
            border-radius: 6px;
            display: block;
        }
        .theme-swatch b {
            position: absolute;
            right: 10px; top: 10px;
            width: 14px; height: 14px;
            border-radius: 999px;
            display: block;
        }
        .theme-swatch-custom {
            background: linear-gradient(135deg, #0f172a 0%, #334155 50%, #14b8a6 100%);
        }
        .theme-swatch-custom i {
            background: rgba(255,255,255,0.12);
            border: 2px solid #38bdf8;
        }
        .theme-swatch-custom b { background: #f472b6; }
        .theme-meta strong {
            display: block;
            font-size: 0.8rem;
            color: var(--text-main);
        }
        .theme-meta small {
            display: block;
            font-size: 0.68rem;
            color: var(--text-dim);
            line-height: 1.3;
        }
        .custom-colors {
            display: none;
            grid-template-columns: 1fr;
            gap: 10px;
            margin: 4px 0 12px;
            padding: 12px;
            border-radius: 12px;
            border: 1px dashed var(--border);
            background: rgba(0,0,0,0.12);
        }
        .custom-colors.is-open { display: grid; }
        .color-field label {
            display: block;
            font-size: 0.72rem;
            color: var(--text-dim);
            margin-bottom: 6px;
        }
        .color-row {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .color-row input[type="color"] {
            width: 44px;
            height: 40px;
            padding: 0;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: transparent;
            cursor: pointer;
        }
        .color-row input[type="text"] {
            flex: 1;
            margin: 0 !important;
            font-family: ui-monospace, monospace;
            font-size: 0.85rem;
        }
        .theme-live-preview {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--bg-input);
            margin-top: 4px;
        }
        .tlp-bar {
            width: 8px;
            height: 40px;
            border-radius: 6px;
            background: var(--primary);
        }
        .tlp-card {
            flex: 1;
            height: 40px;
            border-radius: 10px;
            background: var(--bg-card-solid, var(--bg-card));
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 10px;
        }
        .tlp-card i {
            width: 18px; height: 18px; border-radius: 6px;
            background: var(--primary-dim);
            border: 1px solid var(--primary);
        }
        .tlp-card b {
            height: 8px; width: 42%;
            border-radius: 4px;
            background: var(--text-dim);
            opacity: 0.45;
        }
        .tlp-label {
            font-size: 0.72rem;
            color: var(--text-dim);
            font-weight: 600;
            white-space: nowrap;
        }

        .refresh-btn { 
            background: transparent; 
            color: var(--primary); 
            border: 1px solid rgba(13,148,136,0.3); 
            padding: 6px 12px; 
            border-radius: 6px; 
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
        }
        .refresh-btn:hover { background: rgba(13,148,136,0.05); }

        @media (max-width: 768px) {
            .dash-stats { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
            .header { flex-direction: column; gap: 20px; text-align: center; }
            .header-actions { justify-content: center; width: 100%; }
            .nav-bar { flex-direction: column; gap: 12px; }
            .card-name { max-width: 140px; }
        }
    </style>
</head>
<body>
    ${renderLoaderBlock()}
    <div class="ambient" aria-hidden="true">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
    </div>
    <div class="container">
        <header class="header">
            <div class="header-title">
                ${renderBrandHeading('fas fa-shield-halved')}
                <small>Panel maestro · Multi-bot</small>
            </div>
            <div class="header-actions">
                <button class="btn btn-ghost" onclick="document.getElementById('modalConfig').style.display='block'">
                    <i class="fas fa-cog"></i> Configuración
                </button>
                <button class="btn btn-primary" onclick="document.getElementById('modalUser').style.display='block'">
                    <i class="fas fa-plus"></i> Nuevo usuario
                </button>
            </div>
        </header>

        <div class="dash-stats">
            <div class="dash-stat stat-total"><div class="dash-stat-val">${dashTotal}</div><div class="dash-stat-lbl">Clientes</div></div>
            <div class="dash-stat stat-online"><div class="dash-stat-val">${dashOnline}</div><div class="dash-stat-lbl">Online</div></div>
            <div class="dash-stat stat-paused"><div class="dash-stat-val">${dashPaused}</div><div class="dash-stat-lbl">Pausados</div></div>
            <div class="dash-stat stat-expired"><div class="dash-stat-val">${dashExpired}</div><div class="dash-stat-lbl">Vencidos</div></div>
        </div>

        <nav class="nav-bar">
            <div class="nav-links">
                <a href="/" class="active"><i class="fas fa-layer-group"></i> Usuarios</a>
                <a href="/panel-master"><i class="fas fa-terminal"></i> Tu panel</a>
                <a href="/links-grupos"><i class="fas fa-link"></i> Links de grupos</a>
            </div>
            <button class="refresh-btn" onclick="location.reload()"><i class="fas fa-rotate"></i> Actualizar</button>
        </nav>

        <div class="codes-section" style="margin-bottom:22px;">
            <div class="codes-head">
                <div>
                    <h2 class="clients-title"><i class="fab fa-whatsapp" style="color:#25d366"></i> Links de grupos WhatsApp</h2>
                    <p class="clients-sub">Carga invitaciones, verifica si están vivas, libres o piden aceptación. Los sub-bots se unen desde su panel.</p>
                </div>
                <a href="/links-grupos" class="btn btn-primary" style="text-decoration:none;">
                    <i class="fas fa-arrow-right"></i> Administrar links
                </a>
            </div>
            <div class="dash-stats" style="margin:0; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));">
                <div class="dash-stat stat-total"><div class="dash-stat-val">${glTotal}</div><div class="dash-stat-lbl">Links</div></div>
                <div class="dash-stat stat-online"><div class="dash-stat-val">${glAlive}</div><div class="dash-stat-lbl">Vivos</div></div>
                <div class="dash-stat" style="border-color:rgba(20,184,166,0.25);"><div class="dash-stat-val" style="color:#5eead4">${glFree}</div><div class="dash-stat-lbl">Libres</div></div>
                <div class="dash-stat stat-paused"><div class="dash-stat-val">${glApproval}</div><div class="dash-stat-lbl">Piden aceptar</div></div>
                <div class="dash-stat stat-expired"><div class="dash-stat-val">${glDead}</div><div class="dash-stat-lbl">Muertos</div></div>
            </div>
        </div>

        <div class="codes-section">
            <div class="codes-head">
                <div>
                    <h2 class="clients-title"><i class="fas fa-ticket"></i> Códigos de canje</h2>
                    <p class="clients-sub">Genera códigos para que tus clientes sumen tiempo a su panel</p>
                </div>
                <button class="btn btn-primary" onclick="document.getElementById('modalCode').style.display='flex'">
                    <i class="fas fa-plus"></i> Generar código
                </button>
            </div>
            <div class="codes-grid${codesTotal > 3 ? ' is-collapsed' : ''}" id="codesGrid">${codesCardsHtml}</div>
            ${codesTotal > 3 ? `
            <div class="codes-more-wrap">
                <button type="button" class="codes-more-btn" id="codesMoreBtn" onclick="toggleCodesMore()" aria-expanded="false">
                    <span id="codesMoreLabel">Mostrar todos (${codesTotal})</span>
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>` : ''}
        </div>

        <div class="clients-toolbar">
            <div>
                <h2 class="clients-title"><i class="fas fa-users-rectangle"></i> Instancias de clientes</h2>
                <p class="clients-sub">Accesos, planes y paneles de cada sub-bot</p>
            </div>
        </div>

        <main class="grid-users">
            <div class="user-card hero-card" id="card-principal">
                <div class="card-accent hero"></div>
                <div class="card-header">
                    <div class="card-identity">
                        <div class="card-avatar" style="background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#000"><i class="fas fa-crown"></i></div>
                        <div>
                            <h3 class="card-name" style="max-width:none;color:var(--primary)">Bot principal</h3>
                            <span class="card-phone">Núcleo del sistema · WhatsApp maestro</span>
                        </div>
                    </div>
                    <span id="badge-principal" class="status-pill status-offline">VERIFICANDO...</span>
                </div>
                
                <div id="status-principal-content" style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap; padding: 8px 20px 4px;">
                    <div id="qr-container-principal" style="background: white; padding: 10px; border-radius: 8px; display: none; width: fit-content;">
                        <img id="qr-img-principal" style="width: 180px; height: 180px;">
                        <p style="color: black; font-size: 0.7rem; text-align: center; margin-top: 5px; font-weight: bold;">ESCANEA PARA CONECTAR</p>
                    </div>
                    
                    <div style="flex: 1; min-width: 250px;">
                        <p id="msg-principal" style="color: var(--text-dim); font-size: 0.9rem; margin-bottom: 12px;">Mantén el bot principal conectado para que los sub-bots funcionen correctamente.</p>
                        
                        <div id="form-link-principal" style="display: none; flex-direction: column; gap: 10px; max-width: 320px;">
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="num-principal" placeholder="Número (ej: 521...)" style="flex:1; padding: 10px; background: #0a0b10; border: 1px solid #262b36; border-radius: 6px; color: white;">
                                <button onclick="vincularPrincipal()" class="btn btn-primary">CÓDIGO</button>
                            </div>
                            <p style="font-size: 0.75rem; color: var(--text-dim);">Ingresa el número con código de país para vincular por código.</p>
                        </div>

                        <div id="code-display-principal" style="display: none; background: #0a0b10; padding: 15px; border-radius: 10px; border: 1px dashed var(--primary); text-align: center; max-width: 320px;">
                            <span style="font-size: 0.8rem; color: var(--text-dim); display: block; margin-bottom: 5px;">Código de vinculación:</span>
                            <strong id="pairing-code-principal" style="font-size: 2.2rem; letter-spacing: 5px; color: var(--primary); font-family: monospace;">----</strong>
                        </div>
                    </div>

                    <div id="connected-controls-principal" style="display: none;">
                        <div style="display: flex; gap: 10px;">
                            <form action="/restart-main" method="POST" style="margin:0">
                                <button type="submit" class="btn btn-primary" style="background: var(--secondary); border:none">
                                    <i class="fas fa-sync-alt"></i> REINICIAR
                                </button>
                            </form>
                            <form action="/logout-main" method="POST" id="logoutFormMain" style="margin:0">
                                <input type="hidden" name="deleteData" id="deleteDataInput" value="false">
                                <button type="button" class="btn btn-danger" onclick="confirmarCierreSesion()">
                                    <i class="fas fa-sign-out-alt"></i> CERRAR SESIÓN
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            ${Object.entries(subbots).map(([number, data], cardIdx) => {
                const port = data.port || '4001';
                const rentalStatus = resolveRentalStatus(data);
                const statusClass = rentalStatus === 'expired' ? 'status-expired'
                    : (rentalStatus === 'paused' ? 'status-paused' : `status-${data.status || 'offline'}`);
                const statusLabel = rentalStatus === 'expired' ? 'vencido'
                    : (rentalStatus === 'paused' ? 'pausado' : (data.status || 'offline'));
                const expiresLabel = formatDateTime(data.expiresAt, data);
                const remainingLabel = isInfiniteRental(data) ? '' : (data.expiresAt ? formatRemaining(data.expiresAt - Date.now(), data) : '');
                const safeName = String(data.name || 'Instancia Anonima').replace(/"/g, '&quot;');
                const safeUser = escapeAttr(data.panelUser || '');
                const safePass = escapeAttr(data.panelPass || '');
                const avatarLetter = String(data.name || 'B').charAt(0).toUpperCase();
                const cardStateClass = `is-${(rentalStatus === 'expired' || rentalStatus === 'paused') ? rentalStatus : (data.status || 'offline')}`;
                // Slug / URL pública (mismo puerto del maestro, IP o dominio)
                let panelSlug = data.panelSlug || '';
                let panelId = data.panelId || '';
                try {
                    const userDir = path.join(process.cwd(), 'usuarios', number);
                    const linkPath = path.join(userDir, 'link.json');
                    if (existsSync(linkPath)) {
                        const lf = JSON.parse(readFileSync(linkPath, 'utf8'));
                        const fixed = ensurePanelSlugFields(lf, { name: data.name || lf.name });
                        panelSlug = fixed.panelSlug;
                        panelId = fixed.panelId;
                        if (fixed.changed) {
                            const { changed, ...clean } = fixed;
                            writeFileSync(linkPath, JSON.stringify(clean, null, 2));
                        }
                        data.panelSlug = panelSlug;
                        data.panelId = panelId;
                    }
                } catch (_) {}
                const panelUrl = buildSubbotPanelUrl({ panelSlug, publicIP, masterPort: PORT });
                const accessLabel = panelSlug ? `/${panelSlug}/` : '—';
                const rp = getResellerPanel(data);
                const resellerChildCount = rp.enabled ? countResellerChildren(db.data.subbots || {}, number) : 0;
                const resellerBadge = rp.enabled
                    ? `<span class="reseller-chip" title="Panel revendedor activo"><i class="fas fa-store"></i> Revendedor${rp.maxSubbots ? ` · ${resellerChildCount}/${rp.maxSubbots}` : (resellerChildCount ? ` · ${resellerChildCount}` : '')}${rp.canGrantMaster ? ' · 100%' : ''}</span>`
                    : '';
                const parentBadge = data.parentReseller
                    ? `<span class="parent-chip" title="Creado por revendedor ${data.parentReseller}"><i class="fas fa-sitemap"></i> Revendedor: ${data.parentReseller}</span>`
                    : '';
                return `
                <div class="user-card ${cardStateClass}" id="subbot-card-${number}" data-number="${number}" data-port="${port}" data-panel-url="${escapeAttr(panelUrl)}" data-panel-slug="${escapeAttr(panelSlug || '')}" style="animation-delay:${cardIdx * 0.05}s">
                    <div class="card-accent ${statusClass}" id="card-accent-${number}"></div>
                    <div class="card-header">
                        <div class="card-identity">
                            <div class="card-avatar">${avatarLetter}</div>
                            <div style="min-width:0">
                                <h3 class="card-name" title="${safeName}">${data.name || 'Instancia Anonima'}</h3>
                                <span class="card-phone"><i class="fab fa-whatsapp"></i> ${renderMaskedSpan(number, { className: 'info-value masked-phone' })}</span>
                                ${resellerBadge}${parentBadge}
                                <span class="rental-badge"><i class="fas fa-calendar-day"></i> Vence: <strong>${expiresLabel}</strong>${remainingLabel ? ` <span class="rem-chip">${remainingLabel}</span>` : ''}</span>
                            </div>
                        </div>
                        <span class="status-pill ${statusClass}" id="status-pill-${number}">${statusLabel}</span>
                    </div>

                    <div class="card-body-info">
                        <div class="info-section-label">Credenciales y acceso</div>
                        <div class="info-row">
                            <span class="info-label">Usuario</span>
                            ${renderMaskedSpan(data.panelUser)}
                        </div>
                        <div class="info-row">
                            <span class="info-label">Contraseña</span>
                            ${renderMaskedSpan(data.panelPass)}
                        </div>
                        <div class="info-row">
                            <span class="info-label">Plan</span>
                            <span class="info-value plan-val">${getRentalLabel(data.rentalDuration, data)}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Ruta pública</span>
                            <span class="info-value" style="font-size:0.78rem; word-break:break-all;" title="${escapeAttr(panelUrl)}">${escapeAttr(accessLabel)}</span>
                        </div>
                    </div>

                    <div id="pairing-slot-${number}">
                    ${(data.status === 'pairing' || data.status === 'connecting' || data.pairingCode) ? `
                        <div class="pairing-box">
                            <p style="font-size:0.7rem; color:#94a3b8; letter-spacing:0.08em; text-transform:uppercase; font-weight:700;">Código de vinculación</p>
                            <div class="pairing-code" id="pairing-${number}">${data.pairingCode || 'Esperando código...'}</div>
                            <p style="font-size:0.68rem; color:#64748b">WhatsApp → Dispositivos vinculados</p>
                        </div>
                    ` : ''}
                    </div>

                    <div class="card-actions" id="actions-${number}">
                        <div id="entrar-slot-${number}" style="display:contents">
                        ${data.status === 'online' && rentalStatus === 'active' ? `
                            <a href="${escapeAttr(panelUrl)}" target="_blank" class="btn btn-primary-link">
                                <i class="fas fa-arrow-up-right-from-square"></i> Entrar
                            </a>
                        ` : ''}
                        </div>

                        <button type="button" class="btn btn-edit"
                            data-number="${number}"
                            data-name="${safeName}"
                            data-user="${safeUser}"
                            data-pass="${safePass}"
                            data-expires="${data.expiresAt || ''}"
                            data-infinite="${isInfiniteRental(data) ? '1' : '0'}"
                            data-rental="${data.rentalDuration || '1w'}"
                            data-status="${rentalStatus}"
                            onclick="openEditSubbot(this)">
                            <i class="fas fa-pen"></i> Editar
                        </button>

                        <button type="button" class="btn btn-edit btn-reseller"
                            data-number="${number}"
                            data-reseller-enabled="${rp.enabled ? '1' : '0'}"
                            data-reseller-max="${rp.maxSubbots}"
                            data-reseller-grant="${rp.canGrantMaster ? '1' : '0'}"
                            data-reseller-label="${escapeAttr(rp.label || '')}"
                            onclick="openResellerConfig(this)"
                            title="Panel revendedor">
                            <i class="fas fa-store"></i>
                        </button>
                        
                        <form action="/restart-subbot" method="POST" style="margin:0">
                            <input type="hidden" name="number" value="${number}">
                            <button type="submit" class="btn btn-icon btn-restart" title="Reiniciar">
                                <i class="fas fa-rotate"></i>
                            </button>
                        </form>

                        <form action="/delete-user" method="POST" style="margin:0" onsubmit="return confirm('¿Eliminar esta instancia permanentemente?\n\nSe borrará TODO: sesión, publicaciones, grupos, imágenes, auto-respuestas y gestor. No se puede deshacer.')">
                            <input type="hidden" name="number" value="${number}">
                            <button type="submit" class="btn btn-danger btn-icon" title="Eliminar"><i class="fas fa-trash-can"></i></button>
                        </form>
                    </div>
                </div>
            `}).join('')}
        </main>
    </div>

    <!-- MODALS -->
    <div id="modalConfig" class="modal">
        <div class="modal-content" style="max-width:640px; max-height:90vh; overflow:auto;">
            <h2 style="font-size:1.3rem; margin-bottom:8px"><i class="fas fa-cog"></i> Configuración</h2>
            <p style="color:var(--text-dim); font-size:0.85rem; margin:0 0 14px;">Ordenado por secciones. Cada pestaña guarda lo suyo.</p>

            <div class="cfg-tabs" role="tablist">
                <button type="button" class="cfg-tab is-on" data-cfg="user" onclick="switchCfgTab('user', this)">User / Pass</button>
                <button type="button" class="cfg-tab" data-cfg="ui" onclick="switchCfgTab('ui', this)">UI</button>
                <button type="button" class="cfg-tab" data-cfg="by" onclick="switchCfgTab('by', this)">By / Marca</button>
                <button type="button" class="cfg-tab" data-cfg="dominio" onclick="switchCfgTab('dominio', this)">Dominio</button>
                <button type="button" class="cfg-tab" data-cfg="planes" onclick="switchCfgTab('planes', this)">Planes y WS</button>
                <button type="button" class="cfg-tab" data-cfg="email" onclick="switchCfgTab('email', this)">Email</button>
            </div>

            <!-- USER / PASS -->
            <div class="cfg-pane is-on" id="cfg-pane-user">
            <form action="/update-master-credentials" method="POST">
                <div class="cfg-sec-title"><i class="fas fa-lock"></i> Seguridad maestra</div>
                <label>Admin User</label>
                <input type="text" name="new_username" value="${db.data.panelUser || 'admin'}" required>
                <label>Nueva contraseña</label>
                <input type="password" name="new_password" placeholder="********" required>
                <div style="display:flex; gap:12px; margin-top:8px;">
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalConfig').style.display='none'" style="flex:1">CERRAR</button>
                    <button type="submit" class="btn btn-primary" style="flex:1">ACTUALIZAR ACCESO</button>
                </div>
            </form>
            </div>

            <!-- UI / TEMA -->
            <div class="cfg-pane" id="cfg-pane-ui">
            <form action="/update-theme" method="POST" id="themeForm">
                <div class="cfg-sec-title"><i class="fas fa-swatchbook"></i> Tema global</div>
                <p style="color:var(--text-dim); font-size:0.78rem; margin:0 0 14px; line-height:1.45;">Se aplica en el panel maestro y en todos los sub-bots al recargar.</p>
                <div class="theme-grid" id="themeGrid">
                  ${themePreviewHtml(themeCfg.id)}
                </div>
                <div id="customColorsBox" class="custom-colors ${themeCfg.id === 'custom' ? 'is-open' : ''}">
                    <div class="color-field">
                        <label>Acento / primario</label>
                        <div class="color-row">
                            <input type="color" id="cPrimary" value="${escapeAttr(themeCfg.custom.primary)}" title="Primario">
                            <input type="text" name="themePrimary" id="tPrimary" value="${escapeAttr(themeCfg.custom.primary)}" maxlength="7" pattern="#?[0-9A-Fa-f]{3,8}">
                        </div>
                    </div>
                    <div class="color-field">
                        <label>Fondo</label>
                        <div class="color-row">
                            <input type="color" id="cBg" value="${escapeAttr(themeCfg.custom.bg)}" title="Fondo">
                            <input type="text" name="themeBg" id="tBg" value="${escapeAttr(themeCfg.custom.bg)}" maxlength="7">
                        </div>
                    </div>
                    <div class="color-field">
                        <label>Tarjetas / superficie</label>
                        <div class="color-row">
                            <input type="color" id="cSurface" value="${escapeAttr(themeCfg.custom.surface)}" title="Superficie">
                            <input type="text" name="themeSurface" id="tSurface" value="${escapeAttr(themeCfg.custom.surface)}" maxlength="7">
                        </div>
                    </div>
                </div>
                <div class="theme-live-preview" id="themeLivePreview" aria-hidden="true">
                    <span class="tlp-bar"></span>
                    <span class="tlp-card"><i></i><b></b></span>
                    <span class="tlp-label">Vista previa</span>
                </div>
                <div style="display:flex; gap:12px; margin-top:12px;">
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalConfig').style.display='none'" style="flex:1">CERRAR</button>
                    <button type="submit" class="btn btn-primary" style="flex:1"><i class="fas fa-paint-roller"></i> Aplicar tema</button>
                </div>
            </form>
            </div>

            <!-- BY / MARCA -->
            <div class="cfg-pane" id="cfg-pane-by">
            <form action="/update-branding" method="POST" enctype="multipart/form-data">
                <div class="cfg-sec-title"><i class="fas fa-palette"></i> Apariencia / Marca</div>
                <label>Nombre (brand)</label>
                <input type="text" name="brand" value="${escapeAttr(brandingCfg.brand)}" maxlength="80" required placeholder="BOT SPAM ULTRA">
                <label>Versión</label>
                <input type="text" value="${escapeAttr(brandingCfg.version)}" disabled readonly style="opacity:0.7; cursor:not-allowed; margin-bottom:12px;">
                <label>Logo del loader / favicon</label>
                <div style="display:flex; gap:12px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
                    ${brandingCfg.loaderLogo ? `
                      <img src="/branding-logo?v=${Date.now()}" alt="Logo" style="width:56px;height:56px;border-radius:14px;object-fit:cover;border:1px solid var(--border);background:var(--bg-input);">
                    ` : `
                      <div style="width:56px;height:56px;border-radius:14px;display:grid;place-items:center;font-weight:800;font-family:'Space Grotesk',sans-serif;color:#ecfdf5;background:linear-gradient(145deg,var(--primary),var(--secondary));">${escapeAttr((brandingCfg.brand || 'B').charAt(0).toUpperCase())}</div>
                    `}
                    <div style="flex:1; min-width:180px;">
                        <input type="file" name="loaderLogo" accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/svg+xml,.ico" style="width:100%; font-size:0.82rem;">
                        <p style="font-size:0.72rem; color:var(--text-dim); margin:6px 0 0;">PNG/JPG/WebP/ICO. Sin logo = letra inicial.</p>
                        ${brandingCfg.loaderLogo ? `<label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.8rem;color:#fca5a5;cursor:pointer;"><input type="checkbox" name="clearLogo" value="1"> Quitar logo actual</label>` : ''}
                    </div>
                </div>
                <label>Texto del loader</label>
                <input type="text" name="loaderTagline" value="${escapeAttr(brandingCfg.loaderTagline)}" maxlength="120" placeholder="Cargando panel del bot...">
                <label>By (autor) <span style="color:var(--text-dim); font-weight:400;">— vacío = no se muestra</span></label>
                <input type="text" name="author" value="${escapeAttr(brandingCfg.author)}" maxlength="60" placeholder="Sunkovv </>">
                <div style="display:flex; gap:12px; margin-top:8px;">
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalConfig').style.display='none'" style="flex:1">CERRAR</button>
                    <button type="submit" class="btn btn-primary" style="flex:1"><i class="fas fa-save"></i> Guardar marca</button>
                </div>
            </form>
            </div>

            <!-- DOMINIO -->
            <div class="cfg-pane" id="cfg-pane-dominio">
            <form action="/update-panel-domain" method="POST">
                <input type="hidden" name="section" value="domain">
                <div class="cfg-sec-title"><i class="fas fa-globe"></i> Dominio, landing y ruta secreta</div>
                <p style="color:var(--text-dim); font-size:0.78rem; margin:0 0 12px; line-height:1.45;">
                    <strong>Un solo puerto</strong> para el maestro y todos los clientes.
                    El panel maestro abre en una ruta secreta. Cada sub-bot entra por
                    <code style="color:var(--primary)">/12345-nombre/</code>.
                </p>
                <div style="font-size:0.72rem; color:#5eead4; margin:0 0 14px; padding:10px 12px; border-radius:10px; background:rgba(13,148,136,0.1); border:1px solid rgba(13,148,136,0.25); line-height:1.45;">
                    <i class="fas fa-key"></i> Panel maestro ahora:
                    <strong>${domainOn && domainCfg.domain
                      ? `${escapeAttr(domainCfg.protocol || 'https')}://${escapeAttr(domainCfg.domain)}${escapeAttr(getMasterPanelBase())}/`
                      : `http://${escapeAttr(publicIP)}:${PORT}${escapeAttr(getMasterPanelBase())}/`}</strong>
                    <br><span style="opacity:0.85">Guarda esta URL. No se muestra en la web pública.</span>
                </div>
                <label>Ruta secreta del panel maestro (sin /)</label>
                <input type="text" name="masterPath" value="${escapeAttr(domainCfg.masterPath || 'whis-sunkovv-z')}"
                  placeholder="ej: whis-sunkovv-z" pattern="[A-Za-z0-9_-]{4,48}" maxlength="48"
                  style="margin-bottom:8px;" required>
                <p style="font-size:0.72rem; color:var(--text-dim); margin:0 0 12px;">Solo letras, números, guion y guion bajo. Mín. 4 caracteres.</p>
                <label style="display:flex; align-items:center; gap:10px; margin-bottom:12px; cursor:pointer;">
                    <input type="checkbox" name="landingEnabled" value="1" ${domainCfg.landingEnabled !== false ? 'checked' : ''} style="width:auto; accent-color:var(--primary);">
                    <span>Landing pública en / (recomendado)</span>
                </label>
                <label style="display:flex; align-items:center; gap:10px; margin-bottom:12px; cursor:pointer;">
                    <input type="checkbox" name="domainEnabled" value="1" ${domainOn ? 'checked' : ''} style="width:auto; accent-color:var(--primary);">
                    <span>Activar dominio (opcional)</span>
                </label>
                <label>Dominio (sin https://)</label>
                <input type="text" name="domainHost" value="${escapeAttr(domainCfg.domain || '')}" placeholder="ej: zonagrupos.lat" style="margin-bottom:10px;">
                <label>Protocolo</label>
                <select name="domainProtocol" style="width:100%; margin-bottom:12px; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border); border-radius:8px; padding:10px;">
                    <option value="https" ${domainCfg.protocol !== 'http' ? 'selected' : ''}>https</option>
                    <option value="http" ${domainCfg.protocol === 'http' ? 'selected' : ''}>http</option>
                </select>
                <p style="font-size:0.75rem; color:#5eead4; margin:0 0 10px; line-height:1.45;">
                    Todos los paneles usan el <b>mismo puerto</b> (${PORT}). Por IP: <strong>http://${escapeAttr(publicIP)}:${PORT}/48291-cliente/</strong>
                    ${domainCfg.domain ? `<br>Por dominio: <strong>${domainCfg.protocol}://${escapeAttr(domainCfg.domain)}/48291-cliente/</strong>` : ''}
                </p>
                <div style="display:flex; gap:12px; margin-top:8px;">
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalConfig').style.display='none'" style="flex:1">CERRAR</button>
                    <button type="submit" class="btn btn-primary" style="flex:1"><i class="fas fa-link"></i> Guardar dominio</button>
                </div>
            </form>
            </div>

            <!-- PLANES Y WS -->
            <div class="cfg-pane" id="cfg-pane-planes">
            <form action="/update-panel-domain" method="POST">
                <input type="hidden" name="section" value="plans">
                <div class="cfg-sec-title"><i class="fas fa-tags"></i> Planes y WhatsApp</div>
                <label>WhatsApp de contacto en la landing (vacío = no se muestra)</label>
                <input type="text" name="landingContact" value="${escapeAttr(domainCfg.contact || '')}"
                  placeholder="ej: +51927909197" style="margin-bottom:6px;" maxlength="40" inputmode="tel">
                <p style="font-size:0.72rem; color:var(--text-dim); margin:0 0 14px;">Solo número (con o sin +). Botón WhatsApp y mensajes prearmados.</p>
                <p style="font-size:0.75rem; color:var(--text-dim); margin:0 0 10px;">Precios de planes. Vacío = “Consultar”. Moneda:</p>
                <input type="text" name="currency" value="${escapeAttr(domainCfg.currency || 'S/')}" maxlength="8" style="width:100px; margin-bottom:12px;" title="Moneda">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                  ${['week1', 'week2', 'month1', 'month2'].map((k) => {
                    const p = (domainCfg.plans && domainCfg.plans[k]) || { label: k, price: '' }
                    return `<div style="background:rgba(0,0,0,0.25); border:1px solid var(--border); border-radius:10px; padding:10px;">
                      <label style="font-size:0.72rem; color:var(--text-dim);">Nombre</label>
                      <input type="text" name="plan_${k}_label" value="${escapeAttr(p.label || '')}" maxlength="40" style="margin-bottom:6px; font-size:0.85rem;">
                      <label style="font-size:0.72rem; color:var(--text-dim);">Precio (${escapeAttr(domainCfg.currency || 'S/')})</label>
                      <input type="text" name="plan_${k}_price" value="${escapeAttr(p.price || '')}" placeholder="ej: 25" maxlength="24" style="font-size:0.85rem;">
                    </div>`
                  }).join('')}
                </div>
                <div style="display:flex; gap:12px; margin-top:8px;">
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalConfig').style.display='none'" style="flex:1">CERRAR</button>
                    <button type="submit" class="btn btn-primary" style="flex:1"><i class="fas fa-save"></i> Guardar planes</button>
                </div>
            </form>
            </div>

            <!-- EMAIL / IMAP -->
            <div class="cfg-pane" id="cfg-pane-email">
            <form action="/update-master-email" method="POST" id="masterEmailForm">
                <div class="cfg-sec-title"><i class="fas fa-envelope"></i> Correo IMAP global (Bot Códigos)</div>
                <p style="color:var(--text-dim); font-size:0.78rem; margin:0 0 14px; line-height:1.45;">
                    <strong>Global para todos los bots.</strong> Un solo Spacemail/catch-all.
                    Cada sub-bot solo gestiona sus alias y números; no ve ni edita estas credenciales.
                </p>
                <label>Proveedor</label>
                <select name="provider" id="masterMailProvider">${mailProviderOpts}</select>
                <label>Etiqueta</label>
                <input type="text" name="label" value="${escapeAttr(botMail.label || 'Streaming')}" required>
                <label>Email (usuario IMAP)</label>
                <input type="email" name="email" value="${escapeAttr(botMail.email || '')}" required placeholder="cuentas-streaming@nexcodea.com">
                <label>Contraseña ${botMail.password ? '(vacío = no cambiar)' : ''}</label>
                <input type="password" name="password" autocomplete="new-password" placeholder="${botMail.password ? '••••••••' : 'Contraseña del buzón'}">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                  <div>
                    <label>IMAP host</label>
                    <input type="text" name="imapHost" id="masterImapHost" value="${escapeAttr(botMail.imapHost || 'mail.spacemail.com')}">
                  </div>
                  <div>
                    <label>IMAP puerto</label>
                    <input type="number" name="imapPort" id="masterImapPort" value="${escapeAttr(String(botMail.imapPort || 993))}">
                  </div>
                  <div>
                    <label>SMTP host</label>
                    <input type="text" name="smtpHost" id="masterSmtpHost" value="${escapeAttr(botMail.smtpHost || 'mail.spacemail.com')}">
                  </div>
                  <div>
                    <label>SMTP puerto</label>
                    <input type="number" name="smtpPort" id="masterSmtpPort" value="${escapeAttr(String(botMail.smtpPort || 465))}">
                  </div>
                </div>
                <label>Dominio de alias</label>
                <input type="text" name="domain" value="${escapeAttr(globalMail.domain || botCodesCfg.domain || 'nexcodea.com')}" placeholder="nexcodea.com">
                <label>Notas</label>
                <input type="text" name="notes" value="${escapeAttr(botMail.notes || '')}">
                <div class="cfg-sec-title" style="margin-top:18px"><i class="fas fa-clock"></i> Respuesta /code (simulación humana)</div>
                <p style="color:var(--text-dim); font-size:0.78rem; margin:0 0 14px; line-height:1.45;">
                    Al usar <code>/code</code> o <code>/codigo</code>: primero “lee” el mensaje (X s), luego muestra <em>escribiendo…</em> (Y s) y recién manda el código.
                    Rangos aleatorios entre mín y máx. Global para todos los bots.
                </p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                  <div>
                    <label>Leer mín (seg)</label>
                    <input type="number" name="minReadSec" min="0" max="60" value="${escapeAttr(String(codeTiming.minReadSec))}">
                  </div>
                  <div>
                    <label>Leer máx (seg)</label>
                    <input type="number" name="maxReadSec" min="0" max="90" value="${escapeAttr(String(codeTiming.maxReadSec))}">
                  </div>
                  <div>
                    <label>Escribiendo mín (seg)</label>
                    <input type="number" name="minTypingSec" min="1" max="60" value="${escapeAttr(String(codeTiming.minTypingSec))}">
                  </div>
                  <div>
                    <label>Escribiendo máx (seg)</label>
                    <input type="number" name="maxTypingSec" min="1" max="120" value="${escapeAttr(String(codeTiming.maxTypingSec))}">
                  </div>
                </div>
                <div style="display:flex; gap:12px; margin-top:8px; flex-wrap:wrap;">
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalConfig').style.display='none'" style="flex:1">CERRAR</button>
                    <button type="submit" formaction="/test-master-email" class="btn btn-ghost" style="flex:1"><i class="fas fa-plug"></i> Probar</button>
                    <button type="submit" class="btn btn-primary" style="flex:1"><i class="fas fa-save"></i> Guardar email</button>
                </div>
            </form>
            <script>
              (function(){
                const presets = ${mailPresetsJson};
                const sel = document.getElementById('masterMailProvider');
                if (!sel) return;
                sel.addEventListener('change', function(){
                  const p = presets[sel.value];
                  if (!p) return;
                  if (p.imapHost) document.getElementById('masterImapHost').value = p.imapHost;
                  if (p.imapPort) document.getElementById('masterImapPort').value = p.imapPort;
                  if (p.smtpHost) document.getElementById('masterSmtpHost').value = p.smtpHost;
                  if (p.smtpPort) document.getElementById('masterSmtpPort').value = p.smtpPort;
                });
              })();
            </script>
            </div>
        </div>
    </div>

    <script>
    function switchCfgTab(id, btn) {
      document.querySelectorAll('#modalConfig .cfg-tab').forEach(function(t){ t.classList.remove('is-on'); });
      document.querySelectorAll('#modalConfig .cfg-pane').forEach(function(p){ p.classList.remove('is-on'); });
      if (btn) btn.classList.add('is-on');
      var pane = document.getElementById('cfg-pane-' + id);
      if (pane) pane.classList.add('is-on');
    }
    </script>

    <div id="modalUser" class="modal">
        <div class="modal-content">
            <h2 style="font-size:1.3rem; margin-bottom:24px"><i class="fas fa-plus-circle"></i> Nuevo Sub-Bot</h2>
            <form action="/create-user" method="POST">
                <label>Nombre del sub bot</label>
                <input type="text" name="name" placeholder="Ej: Amigo malo" required>
                <label>Numero WhatsApp(sin + )</label>
                <input type="text" name="number" placeholder="Ej: 51900111222" required>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label>Login User</label>
                        <input type="text" name="user" placeholder="admin" required>
                    </div>
                    <div>
                        <label>Login Pass</label>
                        <input type="password" name="pass" placeholder="1234" required>
                    </div>
                </div>

                <label>Tiempo de alquiler</label>
                ${renderRentalTimeFields({ fieldPrefix: '', showSkip: false, showInfinite: true, defaultMode: 'preset' })}
                
                <div style="display:flex; gap:12px; margin-top:16px">
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalUser').style.display='none'" style="flex:1">CANCELAR</button>
                    <button type="submit" class="btn btn-primary" style="flex:1">CREAR</button>
                </div>
            </form>
        </div>
    </div>

    <div id="modalCode" class="modal">
        <div class="modal-content" style="max-width:460px;">
            <h2 style="font-size:1.3rem; margin-bottom:8px"><i class="fas fa-ticket"></i> Generar código de canje</h2>
            <p style="color:var(--text-dim); font-size:0.85rem; margin-bottom:20px;">El cliente que lo canjee sumará el tiempo elegido a su panel. Cada sub-bot solo puede canjearlo una vez.</p>
            <form id="codeForm" onsubmit="return generateCode(event)">
                <label>Nombre / nota (opcional)</label>
                <input type="text" name="label" placeholder="Ej: Promo fin de semana" maxlength="60">

                <label>Tiempo que agrega</label>
                <div style="display:grid; grid-template-columns:1fr 1.2fr; gap:12px;">
                    <input type="number" name="amount" id="code_amount" min="1" value="2" placeholder="2">
                    <select name="unit" id="code_unit">
                        <option value="min">Minutos</option>
                        <option value="h" selected>Horas</option>
                        <option value="d">Días</option>
                        <option value="w">Semanas</option>
                        <option value="mo">Meses</option>
                    </select>
                </div>
                <label style="display:flex; align-items:center; gap:8px; margin-top:12px; cursor:pointer; font-size:0.85rem;">
                    <input type="checkbox" id="code_infinite" style="width:auto; margin:0;" onchange="toggleCodeInfinite()"> Tiempo infinito
                </label>

                <label style="margin-top:14px;">Límite de canjes (cuántos clientes pueden usarlo)</label>
                <input type="number" name="maxUses" id="code_maxUses" min="1" value="1" placeholder="1">

                <div style="display:flex; gap:12px; margin-top:20px">
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCode').style.display='none'" style="flex:1">CANCELAR</button>
                    <button type="submit" class="btn btn-primary" style="flex:1">GENERAR</button>
                </div>
            </form>
        </div>
    </div>

    <div id="modalEditSubbot" class="modal">
        <div class="modal-content" style="max-width:480px;">
            <h2 style="font-size:1.3rem; margin-bottom:24px"><i class="fas fa-user-pen"></i> Editar Sub-Bot</h2>
            <form action="/edit-subbot" method="POST">
                <input type="hidden" name="number" id="edit_number">
                <label>Número WhatsApp (no editable)</label>
                <input type="text" id="edit_number_display" disabled style="opacity:0.6; cursor:not-allowed;">
                <label>Nombre del sub bot</label>
                <input type="text" name="name" id="edit_name" required>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label>Login User</label>
                        <input type="text" name="user" id="edit_user" required>
                    </div>
                    <div>
                        <label>Login Pass</label>
                        <input type="text" name="pass" id="edit_pass" required>
                    </div>
                </div>
                <label>Cambiar tiempo de alquiler</label>
                ${renderRentalTimeFields({ fieldPrefix: 'extend_', showSkip: true, showInfinite: true, defaultMode: 'preset' })}
                <p style="font-size:0.75rem; color:var(--text-dim); margin:-4px 0 12px;">El tiempo elegido reemplaza el plan actual desde ahora (no se suma al tiempo restante).</p>
                <p id="edit_expires_info" style="font-size:0.8rem; color:var(--text-dim); margin:0 0 16px;"></p>
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">
                    <button type="submit" name="action" value="save" class="btn btn-primary" style="flex:1">GUARDAR</button>
                    <button type="submit" formaction="/pause-subbot" name="action" value="pause" class="btn btn-secondary" style="flex:1; background:#64748b;">PAUSAR</button>
                    <button type="submit" formaction="/resume-subbot" name="action" value="resume" class="btn btn-primary" style="flex:1; background:#0f766e; color:#ecfdf5;">REANUDAR</button>
                </div>
                <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalEditSubbot').style.display='none'" style="width:100%;">CANCELAR</button>
            </form>
        </div>
    </div>

    <div id="modalReseller" class="modal">
        <div class="modal-content" style="max-width:480px;">
            <h2 style="font-size:1.3rem; margin-bottom:8px"><i class="fas fa-store"></i> Panel revendedor</h2>
            <p style="color:var(--text-dim); font-size:0.82rem; margin-bottom:18px; line-height:1.5;">
                Desde aquí activás un panel secundario para que este sub-bot cree y gestione sus propios usuarios con límites.
                El formulario de creación de usuario <strong>no</strong> incluye esto — solo se configura al editar.
            </p>
            <form action="/reseller-config" method="POST">
                <input type="hidden" name="number" id="reseller_number">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; text-transform:none; font-size:0.9rem; color:var(--text-main);">
                    <input type="checkbox" name="enabled" value="1" id="reseller_enabled" style="width:auto;">
                    Activar panel revendedor
                </label>
                <label>Máximo sub-bots (0 = sin límite)</label>
                <input type="number" name="maxSubbots" id="reseller_max" min="0" max="500" value="10">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; text-transform:none; font-size:0.9rem; color:var(--text-main); margin-top:14px;">
                    <input type="checkbox" name="canGrantMaster" value="1" id="reseller_grant" style="width:auto;">
                    Poder completo (100%) — puede dar panel revendedor a sus usuarios
                </label>
                <p style="font-size:0.72rem; color:var(--text-dim); margin:6px 0 12px;">Sin esta opción, solo gestiona sus sub-bots pero no reparte el panel revendedor.</p>
                <label>Etiqueta (opcional)</label>
                <input type="text" name="label" id="reseller_label" maxlength="80" placeholder="Ej: Revendedor Lima">
                <div style="display:flex; gap:12px; margin-top:20px;">
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalReseller').style.display='none'" style="flex:1">CANCELAR</button>
                    <button type="submit" class="btn btn-primary" style="flex:1"><i class="fas fa-save"></i> GUARDAR</button>
                </div>
            </form>
        </div>
    </div>
    <div id="modalLogoutMain" style="display:none; position: fixed; z-index: 11000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); align-items: center; justify-content: center; font-family: 'Inter', sans-serif;">
        <div style="background: #15171e; border: 1px solid var(--primary); padding: 30px; border-radius: 15px; max-width: 450px; text-align: center; box-shadow: 0 0 30px rgba(13,148,136,0.3); width: 90%;">
            <i class="fas fa-sign-out-alt" style="font-size: 3rem; color: #ff3e3e; margin-bottom: 20px;"></i>
            <h2 style="font-size: 1.5rem; margin-bottom: 15px; color: white;">¿Cerrar Sesión Principal?</h2>
            <p style="color: var(--text-dim); margin-bottom: 25px; line-height: 1.5; font-size: 1rem;">Selecciona una opción para proceder con la desconexión del Bot Principal.</p>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button type="button" class="btn btn-danger" onclick="ejecutarLogout(true)" style="padding: 18px; font-weight: bold; width: 100%; cursor: pointer;">
                    <i class="fas fa-trash-can"></i> BORRAR TODO DEFINITIVAMENTE
                    <span style="display: block; font-size: 0.7rem; opacity: 0.8; margin-top: 4px;">(Sesión + Publicaciones + Grupos + Imágenes)</span>
                </button>
                
                <button type="button" class="btn btn-primary" onclick="ejecutarLogout(false)" style="padding: 18px; font-weight: bold; width: 100%; cursor: pointer; background: var(--secondary); border: none;">
                    <i class="fas fa-key"></i> SOLO CERRAR SESIÓN
                    <span style="display: block; font-size: 0.7rem; opacity: 0.8; margin-top: 4px;">(Mantiene tus anuncios y archivos intactos)</span>
                </button>
                
                <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalLogoutMain').style.display='none'" style="padding: 12px; border: 1px solid #333; width: 100%; background: transparent; color: white; cursor: pointer; border-radius: 8px;">
                    <i class="fas fa-times"></i> CANCELAR / NO HACER NADA
                </button>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
    <script>
    function showToast(msg, type) {
        let wrap = document.getElementById('toastWrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'toastWrap';
            document.body.appendChild(wrap);
        }
        const t = document.createElement('div');
        t.className = 'toast ' + (type === 'error' ? 'toast-error' : 'toast-ok');
        t.innerHTML = '<i class="fas ' + (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check') + '"></i><span>' + msg + '</span>';
        wrap.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 4000);
    }

    function toggleCodeInfinite() {
        const inf = document.getElementById('code_infinite').checked;
        document.getElementById('code_amount').disabled = inf;
        document.getElementById('code_unit').disabled = inf;
    }

    async function generateCode(e) {
        e.preventDefault();
        const form = document.getElementById('codeForm');
        const infinite = document.getElementById('code_infinite').checked;
        const payload = {
            label: form.label.value,
            mode: infinite ? 'infinite' : 'time',
            amount: form.amount.value,
            unit: form.unit.value,
            maxUses: form.maxUses.value,
        };
        try {
            const res = await fetch('/generate-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!data.ok) { showToast(data.error || 'No se pudo generar', 'error'); return false; }
            document.getElementById('modalCode').style.display = 'none';
            showToast('Código generado: ' + data.code.code, 'ok');
            setTimeout(() => location.reload(), 900);
        } catch (err) {
            showToast('Error de red al generar', 'error');
        }
        return false;
    }

    function fallbackCopy(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.top = '-9999px';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, text.length);
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) {
            return false;
        }
    }

    function copyCode(code, el) {
        const onOk = () => {
            showToast('Código copiado: ' + code, 'ok');
            if (el) { el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 800); }
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(code).then(onOk).catch(() => {
                if (fallbackCopy(code)) onOk(); else showToast('No se pudo copiar', 'error');
            });
        } else {
            if (fallbackCopy(code)) onOk(); else showToast('No se pudo copiar', 'error');
        }
    }

    function toggleCodesMore() {
        const grid = document.getElementById('codesGrid');
        const btn = document.getElementById('codesMoreBtn');
        const label = document.getElementById('codesMoreLabel');
        if (!grid || !btn) return;
        const open = grid.classList.toggle('is-collapsed') === false;
        btn.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        const total = grid.querySelectorAll('.code-card').length;
        if (label) label.textContent = open ? 'Mostrar menos' : ('Mostrar todos (' + total + ')');
    }

    function refreshCodesMoreBtn() {
        const grid = document.getElementById('codesGrid');
        const wrap = document.querySelector('.codes-more-wrap');
        const btn = document.getElementById('codesMoreBtn');
        const label = document.getElementById('codesMoreLabel');
        if (!grid) return;
        const total = grid.querySelectorAll('.code-card').length;
        if (total <= 3) {
            grid.classList.remove('is-collapsed');
            if (wrap) wrap.style.display = 'none';
            return;
        }
        if (wrap) wrap.style.display = '';
        if (!grid.classList.contains('is-collapsed') && label) {
            label.textContent = 'Mostrar menos';
        } else if (label) {
            label.textContent = 'Mostrar todos (' + total + ')';
        }
        if (btn) {
            const open = !grid.classList.contains('is-collapsed');
            btn.classList.toggle('is-open', open);
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
    }

    async function deleteCode(id, btn) {
        if (!confirm('¿Eliminar este código? Los clientes ya no podrán canjearlo.')) return;
        try {
            const res = await fetch('/delete-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            const data = await res.json();
            if (!data.ok) { showToast(data.error || 'No se pudo eliminar', 'error'); return; }
            const card = btn.closest('.code-card');
            if (card) {
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    card.remove();
                    refreshCodesMoreBtn();
                }, 250);
            }
            showToast('Código eliminado', 'ok');
        } catch (err) {
            showToast('Error de red al eliminar', 'error');
        }
    }

    function initThemePicker() {
        const grid = document.getElementById('themeGrid');
        const customBox = document.getElementById('customColorsBox');
        if (!grid) return;

        function setActive(id) {
            grid.querySelectorAll('.theme-card').forEach((card) => {
                card.classList.toggle('is-on', card.getAttribute('data-theme-id') === id);
            });
            if (customBox) customBox.classList.toggle('is-open', id === 'custom');
        }

        grid.querySelectorAll('.theme-card').forEach((card) => {
            card.addEventListener('click', () => {
                const id = card.getAttribute('data-theme-id');
                const radio = card.querySelector('input[type=radio]');
                if (radio) radio.checked = true;
                setActive(id);
            });
        });

        const pairs = [
            ['cPrimary', 'tPrimary'],
            ['cBg', 'tBg'],
            ['cSurface', 'tSurface'],
        ];
        pairs.forEach(([cId, tId]) => {
            const c = document.getElementById(cId);
            const t = document.getElementById(tId);
            if (!c || !t) return;
            c.addEventListener('input', () => {
                t.value = c.value;
                // al tocar color, forzar personalizado
                const radio = grid.querySelector('input[value=custom]');
                if (radio) { radio.checked = true; setActive('custom'); }
                applyLivePreview();
            });
            t.addEventListener('input', () => {
                let v = t.value.trim();
                if (v && v[0] !== '#') v = '#' + v;
                if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
                    c.value = v;
                    applyLivePreview();
                }
            });
        });

        function applyLivePreview() {
            const id = (grid.querySelector('input[name=themeId]:checked') || {}).value || 'codigos';
            const presets = ${JSON.stringify(Object.fromEntries(Object.entries(THEME_PRESETS).map(([k, v]) => [k, v.seed])))};
            let seed;
            if (id === 'custom') {
                seed = {
                    primary: document.getElementById('tPrimary')?.value || '#c4a574',
                    bg: document.getElementById('tBg')?.value || '#0c0d0f',
                    surface: document.getElementById('tSurface')?.value || '#14161a',
                };
            } else {
                seed = presets[id] || presets.codigos;
            }
            const live = document.getElementById('themeLivePreview');
            if (!live) return;
            live.style.setProperty('--lp-p', seed.primary);
            live.style.setProperty('--lp-bg', seed.bg);
            live.style.setProperty('--lp-s', seed.surface);
            live.style.background = seed.bg;
            const bar = live.querySelector('.tlp-bar');
            const card = live.querySelector('.tlp-card');
            const i = live.querySelector('.tlp-card i');
            if (bar) bar.style.background = seed.primary;
            if (card) { card.style.background = seed.surface; card.style.borderColor = seed.primary + '55'; }
            if (i) { i.style.borderColor = seed.primary; i.style.background = seed.primary + '33'; }
        }

        const initial = (grid.querySelector('input[name=themeId]:checked') || {}).value || 'codigos';
        setActive(initial);
        applyLivePreview();
        grid.querySelectorAll('input[name=themeId]').forEach((r) => {
            r.addEventListener('change', applyLivePreview);
        });
    }
    document.addEventListener('DOMContentLoaded', initThemePicker);

    function toggleSensitive(el) {
        if (!el || el.dataset.value == null) return;
        const hidden = el.dataset.hidden !== '0';
        el.textContent = hidden ? el.dataset.value : '\u2022'.repeat(8);
        el.dataset.hidden = hidden ? '0' : '1';
        el.classList.toggle('revealed', hidden);
        el.title = hidden ? 'Clic para ocultar' : 'Clic para mostrar';
    }

    function confirmarCierreSesion() {
        const modal = document.getElementById('modalLogoutMain');
        if (modal) modal.style.display = 'flex';
    }

    function ejecutarLogout(borrarTodo) {
        const input = document.getElementById('deleteDataInput');
        const form = document.getElementById('logoutFormMain');
        if (!input || !form) return;
        
        if (borrarTodo) {
            if (!confirm("❗ ÚLTIMA ADVERTENCIA: Se eliminarán todas las publicaciones y bases de datos permanentemente. ¿Estás seguro?")) return;
        }

        input.value = borrarTodo ? "true" : "false";
        form.submit();
    }

    async function updatePrincipalStatus() {
        try {
            const res = await fetch('/principal-status');
            const data = await res.json();
            const badge = document.getElementById('badge-principal');
            const qrCont = document.getElementById('qr-container-principal');
            const qrImg = document.getElementById('qr-img-principal');
            const formLink = document.getElementById('form-link-principal');
            const codeDisp = document.getElementById('code-display-principal');
            const connectedCtrl = document.getElementById('connected-controls-principal');
            const msg = document.getElementById('msg-principal');

            if (!badge) return;

            if (data.status === 'online') {
                badge.innerText = 'ONLINE';
                badge.className = 'status-pill status-online';
                qrCont.style.display = 'none';
                formLink.style.display = 'none';
                codeDisp.style.display = 'none';
                connectedCtrl.style.display = 'block';
                msg.innerHTML = '<span style="color:var(--primary)">âœ“ Conectado como: <strong>' + (data.user || '') + '</strong></span>';
            } else if (data.status === 'restarting') {
                badge.innerText = 'REINICIANDO...';
                badge.className = 'status-pill status-pairing';
                qrCont.style.display = 'none';
                formLink.style.display = 'none';
                codeDisp.style.display = 'none';
                connectedCtrl.style.display = 'none';
                msg.innerHTML = '<span style="color:#f59e0b"><i class="fas fa-sync-alt fa-spin"></i> Reiniciando Bot Principal, por favor espera...</span>';
            } else if (data.status === 'qr') {
                badge.innerText = 'ESPERANDO QR';
                badge.className = 'status-pill status-pairing';
                qrCont.style.display = 'block';
                formLink.style.display = 'flex';
                connectedCtrl.style.display = 'none';
                msg.innerText = 'Escanea el código QR o solicita un código de vinculación.';
                
                QRCode.toDataURL(data.qr, { width: 180, margin: 2 }, (err, url) => {
                    if (!err) qrImg.src = url;
                });
            } else if (data.status === 'waiting') {
                badge.innerText = 'INICIANDO...';
                badge.className = 'status-pill status-offline';
                qrCont.style.display = 'none';
                formLink.style.display = 'none';
                connectedCtrl.style.display = 'none';
            }
        } catch (e) {
            const badge = document.getElementById('badge-principal');
            const msg = document.getElementById('msg-principal');
            if (badge && badge.innerText !== 'ONLINE') {
                badge.innerText = 'REINICIANDO...';
                badge.className = 'status-pill status-pairing';
                if (msg) msg.innerHTML = '<span style="color:#f59e0b"><i class="fas fa-sync-alt fa-spin"></i> Reiniciando Bot Principal, por favor espera...</span>';
            }
        }
    }

    async function vincularPrincipal() {
        const numElement = document.getElementById('num-principal');
        if (!numElement || !numElement.value) return alert('Ingresa un número válido');
        const num = numElement.value;
        try {
            const res = await fetch('/principal-link-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ num })
            });
            const data = await res.json();
            if (data.code) {
                document.getElementById('code-display-principal').style.display = 'block';
                document.getElementById('pairing-code-principal').innerText = data.code;
                document.getElementById('form-link-principal').style.display = 'none';
            }
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }

    setInterval(updatePrincipalStatus, 3000);
    updatePrincipalStatus();

    ${renderLiveSubbotsScript({ statusUrl: '/status', publicIP })}

    function openEditSubbot(btn) {
        const d = btn.dataset;
        document.getElementById('edit_number').value = d.number;
        document.getElementById('edit_number_display').value = d.number;
        document.getElementById('edit_name').value = d.name || '';
        document.getElementById('edit_user').value = d.user || '';
        document.getElementById('edit_pass').value = d.pass || '';
        setRentalMode('extend_', d.infinite === '1' ? 'infinite' : 'preset');
        const extendDur = document.getElementById('extend_rental_duration');
        if (extendDur) extendDur.value = '';
        const expires = d.infinite === '1'
            ? 'Tiempo infinito'
            : (d.expires ? new Date(parseInt(d.expires, 10)).toLocaleString('es-ES') : 'Sin límite');
        const status = d.status || 'active';
        document.getElementById('edit_expires_info').innerText = 'Estado: ' + status.toUpperCase() + ' · Vence: ' + expires;
        document.getElementById('modalEditSubbot').style.display = 'block';
    }

    function openResellerConfig(btn) {
        const d = btn.dataset;
        document.getElementById('reseller_number').value = d.number || '';
        document.getElementById('reseller_enabled').checked = d.resellerEnabled === '1';
        document.getElementById('reseller_max').value = d.resellerMax || '10';
        document.getElementById('reseller_grant').checked = d.resellerGrant === '1';
        document.getElementById('reseller_label').value = d.resellerLabel || '';
        document.getElementById('modalReseller').style.display = 'block';
    }
    ${renderRentalTimeScript()}
    </script>
</body>
</html>
  `;
  res.send(html)
})

app.post('/create-user', requireMaster, async (req, res) => {
    const { number, user, pass, name } = req.body
    if (!number) return res.send('Número requerido')
    if (!user || !pass) return res.send('Usuario y Contraseña requeridos para el sub-bot')
    
    const cleanNumber = number.replace(/\D/g, '')
    
    // Verificacion de duplis
    if (global.activeSubBots && global.activeSubBots.has(cleanNumber)) {
        return res.send(`El usuario ${cleanNumber} ya está en proceso de inicio o activo.`)
    }

    const rentalParsed = parseRentalFromBody(req.body)
    if (!rentalParsed) {
        return res.send('<script>alert("Tiempo de alquiler inválido. Usa un preset, tiempo personalizado o Tiempo Infinito."); history.back();</script>')
    }

    
    const generateUniquePort = () => {
        const usedPorts = Object.values(db.data.subbots || {}).map(s => parseInt(s.port)).filter(p => !isNaN(p));
        
        usedPorts.push(parseInt(PORT));
        
        let newPort;
        let attempts = 0;
        do {
            // puertos alea.
            newPort = Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000;
            attempts++;
        } while (usedPorts.includes(newPort) && attempts < 100);
        return newPort;
    }

    const port = generateUniquePort();
    const rentalFields = buildRentalFromParsed(rentalParsed)
    
    
    db.data.subbots = db.data.subbots || {}
    db.data.subbots[cleanNumber] = {
        name: name || 'Sub-Bot',
        number: cleanNumber,
        port,
        status: 'pairing',
        pairingCode: null,
        panelUser: user,
        panelPass: pass,
        createdAt: Date.now(),
        parentReseller: null,
        resellerPanel: normalizeResellerPanel(),
        ...rentalFields,
    }
    
    
    const userDir = path.join(process.cwd(), 'usuarios', cleanNumber)
    if (!existsSync(userDir)) {
        
        global.isCreatingUser = true;
        await fs.mkdir(userDir, { recursive: true })
        
        setTimeout(() => { global.isCreatingUser = false; }, 2000);
    }
    
    
    const linkFile = path.join(userDir, 'link.json')
    await syncRentalToLink(userDir, db.data.subbots[cleanNumber], fs)
    const linkWithSlug = await ensureLinkPanelSlug(userDir, {
        name: name || 'Sub-Bot',
        port,
    }, fs)
    db.data.subbots[cleanNumber].panelId = linkWithSlug.panelId
    db.data.subbots[cleanNumber].panelSlug = linkWithSlug.panelSlug
    invalidateSlugCache()
    
    await safeDbWrite(db)
    
    
    if (global.spawnSubBot) {
        console.log(`[HTTP] Solicitando creación de sub-bot para ${cleanNumber} (ruta /${linkWithSlug.panelSlug}/)`)
        await global.spawnSubBot(cleanNumber, port, name)
    }
    
    res.redirect('/')
})

app.post('/edit-subbot', requireMaster, async (req, res) => {
    const { number, name, user, pass } = req.body
    if (!number || !db.data.subbots?.[number]) return res.redirect('/')

    const sub = db.data.subbots[number]
    sub.name = (name || sub.name || '').trim() || sub.name
    if (user) sub.panelUser = user.trim()
    if (pass) sub.panelPass = pass.trim()

    const rentalParsed = parseRentalFromBody(req.body, 'extend_')
    if (rentalParsed) {
        const fields = replaceRentalFields(sub, rentalParsed)
        if (fields) {
            Object.assign(sub, fields)
            delete sub.expiredAt
        }
    }

    sub.rentalStatus = resolveRentalStatus(sub)
    const userDir = path.join(process.cwd(), 'usuarios', number)
    await syncRentalToLink(userDir, sub, fs)
    const linkWithSlug = await ensureLinkPanelSlug(userDir, { name: sub.name, port: sub.port }, fs)
    sub.panelId = linkWithSlug.panelId
    sub.panelSlug = linkWithSlug.panelSlug
    invalidateSlugCache()
    await safeDbWrite(db)

    if (rentalParsed && global.spawnSubBot && !isRentalBlocked(sub)) {
        setTimeout(() => global.spawnSubBot(number, sub.port, sub.name), 1500)
    }

    res.redirect('/')
})

app.post('/reseller-config', requireMaster, async (req, res) => {
    const number = String(req.body.number || '').replace(/\D/g, '')
    if (!number || !db.data.subbots?.[number]) return res.redirect('/')
    const result = await saveResellerConfigForSubbot(db, number, req.body, fs)
    if (!result.ok) {
        return res.send(`<script>alert(${JSON.stringify(result.error || 'Error')}); history.back();</script>`)
    }
    await safeDbWrite(db)
    res.redirect('/')
})

app.get('/panel-revendedor', requireResellerPanel, async (req, res) => {
    const subbots = readMasterSubbotsSync()
    const childrenRaw = listResellerChildren(subbots, subBotNumber)
    const publicIP = getLocalIP()
    const children = childrenRaw.map(([num, data]) => {
        let panelUrl = ''
        try {
            const slug = data.panelSlug || ''
            panelUrl = buildSubbotPanelUrl({ panelSlug: slug, publicIP, masterPort: PORT })
        } catch { /* ignore */ }
        return [num, { ...data, panelUrl }]
    })
    const rp = req.resellerPanel
    const used = children.length
    let toast = ''
    if (req.query.created) toast = 'Sub-bot creado correctamente.'
    if (req.query.saved) toast = 'Cambios guardados.'
    if (req.query.deleted) toast = 'Sub-bot eliminado.'
    res.send(renderResellerPage({
        resellerPanel: rp,
        children,
        used,
        max: rp.maxSubbots,
        canGrantMaster: rp.canGrantMaster,
        label: rp.label,
        homeLink: '/panel-master',
        loaderBlock: renderLoaderBlock(),
        toast,
        publicIP,
    }))
})

app.post('/reseller/create-user', requireResellerPanel, async (req, res) => {
    const { number, user, pass, name } = req.body
    const cleanNumber = String(number || '').replace(/\D/g, '')
    if (!cleanNumber) return res.send('<script>alert("Número inválido"); history.back();</script>')
    const rentalParsed = parseRentalFromBody(req.body)
    if (!rentalParsed) {
        return res.send('<script>alert("Tiempo de alquiler inválido."); history.back();</script>')
    }
    const result = await mutateMasterSubbots(async (subbots) => {
        const can = canResellerCreateChild(subbots, subBotNumber)
        if (!can.ok) return { ok: false, error: can.reason }
        return createSubbotEntry({
            subbots,
            number: cleanNumber,
            user,
            pass,
            name,
            rentalParsed,
            parentReseller: subBotNumber,
            fs,
            masterPort: PORT,
        })
    })
    if (!result.ok) {
        return res.send(`<script>alert(${JSON.stringify(result.error || 'No se pudo crear')}); history.back();</script>`)
    }
    await requestSubbotSpawn(result.number, result.port, result.entry?.name || name)
    res.redirect('/panel-revendedor?created=1')
})

app.post('/reseller/edit-subbot', requireResellerPanel, async (req, res) => {
    const number = String(req.body.number || '').replace(/\D/g, '')
    if (!number) return res.redirect('/panel-revendedor')
    await mutateMasterSubbots(async (subbots) => {
        const child = subbots[number]
        if (!child || String(child.parentReseller || '') !== String(subBotNumber)) {
            return { ok: false, error: 'Sub-bot no encontrado' }
        }
        const { name, user, pass } = req.body
        if (name) child.name = String(name).trim() || child.name
        if (user) child.panelUser = String(user).trim()
        if (pass) child.panelPass = String(pass).trim()
        const rentalParsed = parseRentalFromBody(req.body, 'extend_')
        if (rentalParsed) {
            const fields = replaceRentalFields(child, rentalParsed)
            if (fields) {
                Object.assign(child, fields)
                delete child.expiredAt
            }
        }
        child.rentalStatus = resolveRentalStatus(child)
        const userDir = path.join(process.cwd(), 'usuarios', number)
        await syncRentalToLink(userDir, child, fs)
        const linkWithSlug = await ensureLinkPanelSlug(userDir, { name: child.name, port: child.port }, fs)
        child.panelId = linkWithSlug.panelId
        child.panelSlug = linkWithSlug.panelSlug
        invalidateSlugCache()
        return { ok: true, child }
    })
    res.redirect('/panel-revendedor?saved=1')
})

app.post('/reseller/pause-subbot', requireResellerPanel, async (req, res) => {
    const number = String(req.body.number || '').replace(/\D/g, '')
    const subbots = readMasterSubbotsSync()
    const child = subbots[number]
    if (!child || String(child.parentReseller || '') !== String(subBotNumber)) {
        return res.redirect('/panel-revendedor')
    }
    await mutateMasterSubbots(async (sb) => {
        const sub = sb[number]
        if (!sub) return
        sub.rentalStatus = 'paused'
        sub.paused = true
        const userDir = path.join(process.cwd(), 'usuarios', number)
        await syncRentalToLink(userDir, sub, fs)
        await pauseSubBotCampaigns(userDir, fs)
    })
    if (process.send && process.connected) process.send({ type: 'reseller_kill_subbot', number })
    res.redirect('/panel-revendedor?saved=1')
})

app.post('/reseller/resume-subbot', requireResellerPanel, async (req, res) => {
    const number = String(req.body.number || '').replace(/\D/g, '')
    const subbots = readMasterSubbotsSync()
    const child = subbots[number]
    if (!child || String(child.parentReseller || '') !== String(subBotNumber)) {
        return res.redirect('/panel-revendedor')
    }
    const rentalParsed = parseRentalFromBody(req.body, 'extend_')
    await mutateMasterSubbots(async (sb) => {
        const sub = sb[number]
        if (!sub) return
        if (rentalParsed) {
            const fields = replaceRentalFields(sub, rentalParsed)
            if (fields) Object.assign(sub, fields)
        }
        sub.paused = false
        sub.rentalStatus = resolveRentalStatus(sub)
        await syncRentalToLink(path.join(process.cwd(), 'usuarios', number), sub, fs)
    })
    const updated = readMasterSubbotsSync()[number]
    if (updated && !isRentalBlocked(updated)) {
        await requestSubbotSpawn(number, updated.port, updated.name)
    }
    res.redirect('/panel-revendedor?saved=1')
})

app.post('/reseller/child-reseller-config', requireResellerPanel, async (req, res) => {
    const childNumber = String(req.body.childNumber || '').replace(/\D/g, '')
    if (!childNumber) return res.redirect('/panel-revendedor')
    const result = await mutateMasterSubbots(async (subbots) => {
        if (!resellerCanGrantMaster(subbots, subBotNumber)) {
            return { ok: false, error: 'No tenés permiso para dar panel revendedor.' }
        }
        const child = subbots[childNumber]
        if (!child || String(child.parentReseller || '') !== String(subBotNumber)) {
            return { ok: false, error: 'Ese sub-bot no es tuyo.' }
        }
        const prev = getResellerPanel(child)
        const enabled = req.body.enabled === '1'
        child.resellerPanel = normalizeResellerPanel({
            enabled,
            maxSubbots: req.body.maxSubbots,
            canGrantMaster: req.body.canGrantMaster === '1',
            label: req.body.label,
            enabledAt: enabled ? prev.enabledAt || Date.now() : null,
        })
        const userDir = path.join(process.cwd(), 'usuarios', childNumber)
        await syncResellerPanelToLink(userDir, child.resellerPanel, fs)
        return { ok: true }
    })
    if (!result.ok) {
        return res.send(`<script>alert(${JSON.stringify(result.error || 'Error')}); history.back();</script>`)
    }
    res.redirect('/panel-revendedor?saved=1')
})

app.post('/reseller/delete-user', requireResellerPanel, async (req, res) => {
    const number = String(req.body.number || '').replace(/\D/g, '')
    if (!number) return res.redirect('/panel-revendedor')
    const subbots = readMasterSubbotsSync()
    const child = subbots[number]
    if (!child || String(child.parentReseller || '') !== String(subBotNumber)) {
        return res.redirect('/panel-revendedor')
    }
    global.subBotDeleteGuard = global.subBotDeleteGuard || new Set()
    global.subBotDeleteGuard.add(number)
    try {
        await mutateMasterSubbots(async (sb) => {
            delete sb[number]
        })
        if (process.send && process.connected) {
            process.send({ type: 'reseller_kill_subbot', number })
        }
        await new Promise((r) => setTimeout(r, 1500))
        const dir = path.join(process.cwd(), 'usuarios', number)
        if (existsSync(dir)) {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
        }
        invalidateSlugCache()
        res.redirect('/panel-revendedor?deleted=1')
    } catch (e) {
        console.error('[RESELLER] delete-user:', e)
        res.status(500).send('Error eliminando sub-bot: ' + e.message)
    } finally {
        global.subBotDeleteGuard.delete(number)
    }
})

app.post('/pause-subbot', requireMaster, async (req, res) => {
    const { number } = req.body
    if (!number || !db.data.subbots?.[number]) return res.redirect('/')
    await applySubBotRentalBlock(number, db, fs, safeDbWrite, 'paused')
    res.redirect('/')
})

app.post('/resume-subbot', requireMaster, async (req, res) => {
    const { number } = req.body
    if (!number || !db.data.subbots?.[number]) return res.redirect('/')

    const sub = db.data.subbots[number]
    const rentalParsed = parseRentalFromBody(req.body, 'extend_')

    if (rentalParsed) {
        await renewSubBotRental(number, rentalParsed, db, fs, safeDbWrite)
    } else if (!isInfiniteRental(sub) && sub.expiresAt && Date.now() > sub.expiresAt) {
        return res.send('<script>alert("El alquiler está vencido. Extiende el tiempo o elige Tiempo Infinito antes de reanudar."); window.location.href="/";</script>')
    } else {
        sub.paused = false
        sub.rentalStatus = 'active'
        await syncRentalToLink(path.join(process.cwd(), 'usuarios', number), sub, fs)
        await safeDbWrite(db)
    }

    if (global.spawnSubBot && !isRentalBlocked(db.data.subbots[number])) {
        setTimeout(() => global.spawnSubBot(number, sub.port, sub.name), 1500)
    }
    res.redirect('/')
})

app.get('/branding-logo', (req, res) => {
  try {
    const logoPath = getLoaderLogoPath()
    if (!logoPath) return res.status(404).end()
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.sendFile(logoPath)
  } catch (e) {
    return res.status(404).end()
  }
})

app.post('/update-theme', requireMaster, async (req, res) => {
  try {
    const themeId = String(req.body.themeId || 'codigos')
    const allowed = new Set([...Object.keys(THEME_PRESETS), 'custom'])
    if (!allowed.has(themeId)) {
      return res.send('<script>alert("Tema no válido."); history.back();</script>')
    }
    const saved = saveThemeConfig({
      id: themeId,
      primary: req.body.themePrimary,
      bg: req.body.themeBg,
      surface: req.body.themeSurface,
    })
    console.log(`\x1b[36m[THEME]\x1b[0m Tema global: ${saved.id} · primary=${saved.tokens.primary}`)
    res.send(`
      <script>
        try { sessionStorage.setItem('t3dSkipLoader', '1'); } catch (e) {}
        alert('Tema global aplicado. Se verá en maestro y sub-bots al recargar.');
        window.location.href = '/';
      </script>
    `)
  } catch (e) {
    res.send('Error al guardar tema: ' + e.message)
  }
})

app.post('/update-panel-domain', requireMaster, async (req, res) => {
  try {
    const section = String(req.body.section || 'all')
    const current = getDomainConfig()

    if (section === 'plans') {
      const contact = String(req.body.landingContact || '').trim().slice(0, 40)
      const currency = String(req.body.currency || current.currency || 'S/').trim().slice(0, 8)
      const planPrices = {}
      const planLabels = {}
      for (const k of ['week1', 'week2', 'month1', 'month2']) {
        planPrices[k] = req.body[`plan_${k}_price`]
        planLabels[k] = req.body[`plan_${k}_label`]
      }
      saveDomainConfig({ contact, currency, planPrices, planLabels })
      return res.send(`
        <script>
          try { sessionStorage.setItem('t3dSkipLoader', '1'); } catch (e) {}
          alert('Planes y WhatsApp guardados.');
          window.location.href = ${JSON.stringify(getMasterPanelBase() + '/')};
        </script>
      `)
    }

    const enabled = req.body.domainEnabled === '1' || req.body.domainEnabled === 'on'
    const landingEnabled = req.body.landingEnabled === '1' || req.body.landingEnabled === 'on'
    const domainHost = String(req.body.domainHost || '').trim()
    const protocol = req.body.domainProtocol === 'http' ? 'http' : 'https'
    const masterPath = sanitizeMasterPath(req.body.masterPath || 'whis-sunkovv-z')

    if (enabled && !domainHost) {
      return res.send('<script>alert("Escribe el dominio (ej: zonagrupos.lat) o desactiva la opción de dominio."); history.back();</script>')
    }

    const payload = {
      enabled,
      domain: domainHost,
      protocol,
      masterPath,
      landingEnabled,
    }

    // Compat: si llega el form completo (sin section), también guarda planes/contact
    if (section === 'all') {
      payload.contact = String(req.body.landingContact || '').trim().slice(0, 40)
      payload.currency = String(req.body.currency || 'S/').trim().slice(0, 8)
      const planPrices = {}
      const planLabels = {}
      for (const k of ['week1', 'week2', 'month1', 'month2']) {
        planPrices[k] = req.body[`plan_${k}_price`]
        planLabels[k] = req.body[`plan_${k}_label`]
      }
      payload.planPrices = planPrices
      payload.planLabels = planLabels
    }

    const saved = saveDomainConfig(payload)
    getSlugRegistry(true)
    const newBase = `/${saved.masterPath}`
    console.log(
      `\x1b[36m[DOMAIN]\x1b[0m ${saved.enabled ? 'ACTIVO' : 'OFF'} · master=${newBase} · landing=${saved.landingEnabled ? 'ON' : 'OFF'} · ${saved.protocol}://${saved.domain || '(sin dominio)'}`
    )
    const entryHint = saved.enabled && saved.domain
      ? `${saved.protocol}://${saved.domain}${newBase}/`
      : `${newBase}/`
    res.send(`
      <script>
        try { sessionStorage.setItem('t3dSkipLoader', '1'); } catch (e) {}
        alert(${JSON.stringify(
          `Guardado.\\n\\nLanding: /\\nPanel maestro: ${entryHint}\\n\\nGuarda la ruta secreta; no se publica en la web.`
        )});
        window.location.href = ${JSON.stringify(newBase + '/')};
      </script>
    `)
  } catch (e) {
    res.send('Error al guardar dominio: ' + e.message)
  }
})

app.post('/update-master-email', requireMaster, async (req, res) => {
  try {
    const current = getGlobalMailConfig()
    const pass = String(req.body.password || '')
    const mailbox = {
      ...current.mailbox,
      label: String(req.body.label || current.mailbox.label || 'Streaming').trim(),
      email: String(req.body.email || '').trim().toLowerCase(),
      provider: String(req.body.provider || current.mailbox.provider || 'spacemail'),
      imapHost: String(req.body.imapHost || current.mailbox.imapHost || '').trim(),
      imapPort: parseInt(req.body.imapPort || current.mailbox.imapPort || 993, 10),
      smtpHost: String(req.body.smtpHost || current.mailbox.smtpHost || '').trim(),
      smtpPort: parseInt(req.body.smtpPort || current.mailbox.smtpPort || 465, 10),
      notes: String(req.body.notes || ''),
      password: pass || current.mailbox.password || '',
    }
    const domain = String(req.body.domain || current.domain || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9.-]/g, '')
    const responseTiming = {
      minReadSec: parseInt(req.body.minReadSec, 10),
      maxReadSec: parseInt(req.body.maxReadSec, 10),
      minTypingSec: parseInt(req.body.minTypingSec, 10),
      maxTypingSec: parseInt(req.body.maxTypingSec, 10),
    }
    saveGlobalMailConfig({ domain, mailbox, responseTiming })
    // Sync mirror en db del maestro (aliases mantienen dominio)
    const cfg = ensureBotCodes(db)
    db.data.botCodes = normalizeBotCodes(cfg)
    await safeDbWrite(db)
    res.send(`
      <script>
        try { sessionStorage.setItem('t3dSkipLoader', '1'); } catch (e) {}
        alert('Correo IMAP + tiempos /code guardados (global).');
        window.location.href = ${JSON.stringify(getMasterPanelBase() + '/')};
      </script>
    `)
  } catch (e) {
    res.send('Error al guardar email: ' + e.message)
  }
})

app.post('/test-master-email', requireMaster, async (req, res) => {
  try {
    const current = getGlobalMailConfig()
    const probe = {
      ...current.mailbox,
      email: String(req.body.email || current.mailbox.email || '').trim().toLowerCase(),
      password: String(req.body.password || '') || current.mailbox.password,
      imapHost: String(req.body.imapHost || current.mailbox.imapHost || 'mail.spacemail.com').trim(),
      imapPort: parseInt(req.body.imapPort || current.mailbox.imapPort || 993, 10),
    }
    if (!probe.email || !probe.password) {
      return res.send('<script>alert("Falta email o contraseña para probar IMAP."); history.back();</script>')
    }
    const result = await testMailboxConnection(probe)
    if (!result.ok) {
      return res.send(`<script>alert(${JSON.stringify('IMAP falló: ' + (result.error || 'error'))}); history.back();</script>`)
    }
    res.send(`
      <script>
        alert(${JSON.stringify(`IMAP OK · ${result.messages} msgs · ${result.unseen} no leídos`)});
        history.back();
      </script>
    `)
  } catch (e) {
    res.send('Error: ' + e.message)
  }
})

app.post('/update-branding', requireMaster, upload.single('loaderLogo'), async (req, res) => {
  try {
    const { brand, loaderTagline, author, clearLogo } = req.body
    if (!brand || !String(brand).trim()) {
      return res.send('<script>alert("El nombre (brand) es obligatorio."); history.back();</script>')
    }

    const fields = { brand, loaderTagline, author }

    if (clearLogo === '1' || clearLogo === 'on' || clearLogo === 'true') {
      const prev = getText3dConfig().loaderLogo
      if (prev) {
        try {
          await fs.unlink(path.join(BRANDING_ASSETS_DIR, prev))
        } catch (_) { /* ignore */ }
      }
      fields.clearLogo = true
    } else if (req.file && req.file.buffer) {
      const mime = String(req.file.mimetype || '')
      const allowed = /^(image\/(png|jpeg|jpg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon))$/i
      if (!allowed.test(mime) && !/\.(png|jpe?g|webp|gif|ico|svg)$/i.test(req.file.originalname || '')) {
        return res.send('<script>alert("Formato de imagen no válido."); history.back();</script>')
      }
      const extFromName = path.extname(req.file.originalname || '').toLowerCase()
      const ext =
        extFromName && /^\.(png|jpe?g|webp|gif|ico|svg)$/.test(extFromName)
          ? extFromName
          : (mime.includes('webp') ? '.webp'
            : mime.includes('gif') ? '.gif'
              : mime.includes('svg') ? '.svg'
                : mime.includes('icon') ? '.ico'
                  : mime.includes('png') ? '.png'
                    : '.jpg')
      await fs.mkdir(BRANDING_ASSETS_DIR, { recursive: true })
      // limpia logos anteriores
      try {
        const prev = getText3dConfig().loaderLogo
        if (prev) await fs.unlink(path.join(BRANDING_ASSETS_DIR, prev)).catch(() => {})
      } catch (_) {}
      const filename = `loader-logo${ext}`
      await fs.writeFile(path.join(BRANDING_ASSETS_DIR, filename), req.file.buffer)
      fields.loaderLogo = filename
    }

    const saved = saveText3dConfig(fields)
    console.log(`\x1b[36m[CONFIG]\x1b[0m Apariencia actualizada: ${saved.brand} (${saved.version})${saved.loaderLogo ? ' + logo' : ''}`)
    res.send(`
      <script>
        alert('Apariencia guardada.');
        window.location.href = '/';
      </script>
    `)
  } catch (e) {
    res.send('Error al guardar apariencia: ' + e.message)
  }
})

app.post('/update-master-credentials', async (req, res) => {
    const { new_username, new_password } = req.body;
    if (!new_username || !new_password || new_password.length < 4) {
        return res.send('Error: Credenciales inválidas o contraseña muy corta.');
    }

    try {
        db.data.panelUser = new_username;
        db.data.panelPass = new_password;
        await safeDbWrite(db);

        // Sincronizar con link.json
        const linkFile = isSubBot 
            ? path.join(process.cwd(), 'usuarios', subBotNumber, 'link.json')
            : path.join(process.cwd(), 'link.json');
            
        if (existsSync(linkFile)) {
            const linkData = JSON.parse(await fs.readFile(linkFile, 'utf8'));
            linkData.panelUser = new_username;
            linkData.panelPass = new_password;
            await fs.writeFile(linkFile, JSON.stringify(linkData, null, 2));
        }

        // Limpiar cookie única
        res.clearCookie(`panel_auth_${PORT}`);
        res.send(`
            <script>
                alert('Credenciales actualizadas con éxito. Por favor, inicia sesión de nuevo.');
                window.location.href = '/login';
            </script>
        `);
    } catch (e) {
        res.send('Error al actualizar credenciales: ' + e.message);
    }
});

app.post('/delete-user', requireMaster, async (req, res) => {
    const number = String(req.body.number || '').replace(/\D/g, '')
    if (!number) {
        return res.status(400).send('Falta el número del sub-bot')
    }

    global.subBotDeleteGuard = global.subBotDeleteGuard || new Set()
    global.subBotDeleteGuard.add(number)

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

    
    async function killSubBotProcess(num) {
        const bot = global.activeSubBots?.get(num)
        global.activeSubBots?.delete(num)
        if (!bot || typeof bot.kill !== 'function') return

        await new Promise((resolve) => {
            let done = false
            const finish = () => {
                if (done) return
                done = true
                clearTimeout(timer)
                resolve()
            }
            const timer = setTimeout(finish, 10000)
            try {
                bot.once('exit', finish)
            } catch {
                /* ignore */
            }
            try {
                bot.kill('SIGKILL')
            } catch {
                finish()
            }
        })
      
        await sleep(800)
    }

   
    async function wipeSubBotFolder(num) {
        const dir = path.join(process.cwd(), 'usuarios', num)
        if (!existsSync(dir)) return true

        for (let attempt = 1; attempt <= 10; attempt++) {
            try {
                await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
            } catch (e) {
                console.error(`[ERROR] Intento ${attempt}/10 borrando ${num}:`, e.message)
            }
            if (!existsSync(dir)) {
                console.log(`[SISTEMA] Carpeta de sub-bot eliminada por completo: usuarios/${num}`)
                return true
            }
            await sleep(350 + attempt * 150)
        }
        console.error(`[ERROR] No se pudo borrar completa la carpeta usuarios/${num}. Puede quedar basura por archivos bloqueados.`)
        return false
    }

    try {
       
        if (db.data.subbots?.[number]) {
            delete db.data.subbots[number]
            await safeDbWrite(db)
        }

        
        await killSubBotProcess(number)

        
        const wiped = await wipeSubBotFolder(number)

        if (!wiped) {
            return res.send(`
                <script>
                    alert('Se eliminó el sub-bot del panel, pero algunos archivos de usuarios/${number} no se pudieron borrar (Windows los tenía bloqueados). Cerrá el programa y borrá la carpeta manualmente, o reintentá eliminar.');
                    window.location.href = '/';
                </script>
            `)
        }

        res.redirect('/')
    } catch (e) {
        console.error(`[ERROR] delete-user ${number}:`, e)
        res.status(500).send('Error eliminando sub-bot: ' + e.message)
    } finally {
        global.subBotDeleteGuard.delete(number)
    }
})

app.post('/restart-subbot', requireMaster, async (req, res) => {
    const { number } = req.body
    if (!number) return res.status(400).send('Falta el número')

    const subData = db.data.subbots[number]
    if (subData && isRentalBlocked(subData)) {
        return res.send('<script>alert("Este sub-bot está vencido o pausado. Renueva o reanuda desde EDITAR."); window.location.href="/";</script>')
    }

    try {
        console.log(`[SISTEMA] Reinicio manual solicitado para sub-bot: ${number}`)
        
        if (global.activeSubBots && global.activeSubBots.has(number)) {
            const child = global.activeSubBots.get(number)
            if (child && typeof child.kill === 'function') {
                child.kill('SIGKILL')
                console.log(`[SISTEMA] Proceso de sub-bot ${number} finalizado exitosamente.`)
            }
            global.activeSubBots.delete(number)
        } else {
            console.log(`[SISTEMA] El sub-bot ${number} no estaba en ejecución activa, se intentará iniciar desde cero.`)
        }

        
        const subData = db.data.subbots[number]
        
        if (subData) {
            
            subData.status = 'connecting'
            await safeDbWrite(db)
            
            
            if (global.spawnSubBot) {
                setTimeout(() => {
                    global.spawnSubBot(number, subData.port)
                }, 2000)
            }
            
            res.send(`
                <script>
                    alert('Reiniciando sub-bot ${number}. Por favor espera unos segundos...');
                    window.location.href = '/';
                </script>
            `)
        } else {
            res.status(404).send('Sub-bot no encontrado en la base de datos')
        }
    } catch (e) {
        console.error(`[RESTART-ERROR] Error al reiniciar ${number}:`, e)
        res.status(500).send('Error interno: ' + e.message)
    }
})

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ CÓDIGOS DE CANJE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Maestro: generar un código nuevo
app.post('/generate-code', requireMaster, async (req, res) => {
    try {
        const { label, mode, amount, unit } = req.body
        let durationValue
        if (mode === 'infinite') {
            durationValue = 'infinite'
        } else {
            const amt = parseInt(amount, 10)
            const u = (unit || 'h').toLowerCase()
            if (!amt || amt < 1) {
                return res.status(400).json({ ok: false, error: 'Cantidad de tiempo inválida' })
            }
            durationValue = `${amt}${u}`
        }
        const maxUses = parseInt(req.body.maxUses, 10) || 1
        const result = createRedeemCode({ label, durationValue, maxUses })
        if (!result.ok) return res.status(400).json(result)
        return res.json(result)
    } catch (e) {
        console.error('[REDEEM] Error generando código:', e)
        return res.status(500).json({ ok: false, error: e.message })
    }
})

// Maestro: eliminar un código
app.post('/delete-code', requireMaster, async (req, res) => {
    try {
        const { id } = req.body
        const result = deleteRedeemCode(id)
        return res.json(result)
    } catch (e) {
        console.error('[REDEEM] Error eliminando código:', e)
        return res.status(500).json({ ok: false, error: e.message })
    }
})

// Sub-bot: canjear un código
app.post('/redeem-code', async (req, res) => {
    try {
        if (!isSubBot) {
            return res.status(403).json({ ok: false, error: 'Solo los sub-bots pueden canjear códigos.' })
        }

        const subId = subBotNumber
        const linkFile = path.join(process.cwd(), 'usuarios', subId, 'link.json')
        const linkData = readRentalFromLink(linkFile)
        const subName = linkData.name || subId

        if (isInfiniteRental(linkData)) {
            return res.status(400).json({ ok: false, error: 'Ya tienes tiempo infinito, no necesitas canjear códigos.' })
        }

        const result = redeemCode(req.body.code, subId, subName)
        if (!result.ok) return res.status(400).json(result)

        // Aplicar el tiempo al alquiler del sub-bot (su propio link.json)
        const now = Date.now()
        const newFields = extendRentalFields(linkData, result.durationValue, now)
        if (!newFields) {
            return res.status(500).json({ ok: false, error: 'No se pudo aplicar el tiempo.' })
        }

        const updatedLink = { ...linkData, ...newFields }
        await fs.writeFile(linkFile, JSON.stringify(updatedLink, null, 2))

        // Guardar historial persistente en la DB del propio sub-bot
        db.data.redeemedCodes ||= []
        db.data.redeemedCodes.unshift({
            code: result.code,
            label: result.label,
            rewardLabel: result.rewardLabel,
            at: now,
        })
        if (db.data.redeemedCodes.length > 100) db.data.redeemedCodes.pop()
        await safeDbWrite(db)

        const newExpiresLabel = newFields.rentalInfinite
            ? 'Tiempo infinito'
            : formatDateTime(newFields.expiresAt, newFields)

        return res.json({
            ok: true,
            rewardLabel: result.rewardLabel,
            newExpiresLabel,
        })
    } catch (e) {
        console.error('[REDEEM] Error canjeando código:', e)
        return res.status(500).json({ ok: false, error: e.message })
    }
})

app.get('/panel-upload-js', (req, res) => {
  res.type('application/javascript; charset=utf-8');
  res.sendFile(path.join(process.cwd(), 'lib', 'panel-upload.js'));
});

app.get('/tutorial-js', (req, res) => {
  res.type('application/javascript; charset=utf-8');
  res.sendFile(path.join(process.cwd(), 'tutorialpanel.js'));
});

app.get('/group-search-js', (req, res) => {
  res.type('application/javascript; charset=utf-8');
  const src = readFileSync(path.join(process.cwd(), 'lib', 'group-search.js'), 'utf8');
  const browser = src.replace(/export function /g, 'function ');
  res.send(browser);
});

app.get('/spam-time-advisor-js', (req, res) => {
  res.type('application/javascript; charset=utf-8');
  const src = readFileSync(path.join(process.cwd(), 'lib', 'spam-time-advisor.js'), 'utf8');
  const browser = src.replace(/export const /g, 'const ').replace(/export function /g, 'function ');
  res.send(browser);
});

app.get('/panel-master', async (req, res) => {
  
  if (!db.data.campaigns) db.data.campaigns = {};
  
  
  if (!db.data.activeCampaign || !db.data.campaigns[db.data.activeCampaign]) {
    db.data.activeCampaign = Object.keys(db.data.campaigns)[0] || "Principal";
    if (!db.data.campaigns[db.data.activeCampaign]) {
        db.data.campaigns[db.data.activeCampaign] = { groups: [], publications: [], interval: 600000, enabled: true };
    }
    await safeDbWrite(db);
  }

    
    let panelRentalInfo = null
    try {
        const linkFile = isSubBot 
            ? path.join(process.cwd(), 'usuarios', subBotNumber, 'link.json')
            : path.join(process.cwd(), 'link.json');
            
        if (existsSync(linkFile)) {
            const linkData = JSON.parse(readFileSync(linkFile, 'utf8'));
            if (linkData.panelUser) db.data.panelUser = linkData.panelUser;
            if (linkData.panelPass) db.data.panelPass = linkData.panelPass;
            if (isSubBot) panelRentalInfo = linkData;
        }
    } catch (e) {}

    const activeCampName = db.data.activeCampaign || 'Principal'
    const activeCampData = db.data.campaigns?.[activeCampName] || { groups: [] }
    const panelGroupCount = (activeCampData.groups || []).length
    let panelPubCount = 0
    for (const gid of (activeCampData.groups || [])) {
      const cfg = db.data.publicaciones?.[gid]
      if (cfg?.publications) {
        panelPubCount += cfg.publications.filter(p => !p.campaign || p.campaign === activeCampName).length
      }
    }
    const panelSelectedCount = (gruposDB.data.selectedGroups || []).length

    normalizeScheduleFields(activeCampData)
    const panelSpamMode = getSpamMode(activeCampData)
    const panelSchedStart12 = formatTime12h(activeCampData.scheduleStart || '07:00')
    const panelSchedStop12 = formatTime12h(activeCampData.scheduleStop || '21:00')
    const panelSchedActive = panelSpamMode === 'weekly'
      ? countWeeklySlots(activeCampData) > 0
      : !!activeCampData.scheduleEnabled
    const panelSchedStatus = getScheduleStatus(activeCampData)
    const panelScheduleBlock = panelSpamMode === 'weekly' ? `
                <div class="stat-group stat-group-schedule ${panelSchedActive ? 'sched-on' : 'sched-off'}">
                    <span class="stat-group-title"><i class="fas fa-calendar-week"></i> Spam programado</span>
                    <div class="stat-group-body schedule-times">
                        <div class="sched-slot" style="flex:1; min-width:0;">
                            <span class="sched-slot-lbl">Modo</span>
                            <span class="sched-slot-val" style="font-size:0.85rem;">Semanal</span>
                        </div>
                        <div class="sched-slot" style="flex:1; min-width:0;">
                            <span class="sched-slot-lbl">Horarios</span>
                            <span class="sched-slot-val" style="font-size:0.85rem;">${countWeeklySlots(activeCampData)} / semana</span>
                        </div>
                        <span class="sched-badge">${panelSchedActive ? 'Programado' : 'Sin horas'}</span>
                    </div>
                    ${panelSchedStatus.nextTime ? `<div style="width:100%; margin-top:6px; font-size:0.75rem; color:var(--text-dim);">Próximo: ${panelSchedStatus.nextTime}</div>` : ''}
                </div>` : `
                <div class="stat-group stat-group-schedule ${panelSchedActive ? 'sched-on' : 'sched-off'}">
                    <span class="stat-group-title"><i class="fas fa-clock"></i> Horario de envío</span>
                    <div class="stat-group-body schedule-times">
                        <div class="sched-slot">
                            <span class="sched-slot-lbl">Inicio</span>
                            <span class="sched-slot-val">${panelSchedStart12}</span>
                        </div>
                        <span class="sched-sep" aria-hidden="true">→</span>
                        <div class="sched-slot">
                            <span class="sched-slot-lbl">Pausa</span>
                            <span class="sched-slot-val">${panelSchedStop12}</span>
                        </div>
                        <span class="sched-badge">${panelSchedActive ? 'Programado' : 'Sin programar'}</span>
                    </div>
                </div>`
    const panelCampaignBlock = `
                <div class="stat-group stat-group-campaign">
                    <span class="stat-group-title"><i class="fas fa-folder-open"></i> Campaña · ${activeCampName}</span>
                    <div class="stat-group-body stat-mini-row">
                        <div class="stat-mini"><span class="stat-mini-val">${panelGroupCount}</span><span class="stat-mini-lbl">Grupos</span></div>
                        <div class="stat-mini"><span class="stat-mini-val">${panelPubCount}</span><span class="stat-mini-lbl">Publicaciones</span></div>
                        <div class="stat-mini"><span class="stat-mini-val">${panelSelectedCount}</span><span class="stat-mini-lbl">Marcados</span></div>
                    </div>
                </div>`

    let panelPlanPill = ''
    if (isSubBot && panelRentalInfo) {
      // Valor principal = TIEMPO RESTANTE real (semanas/días/horas), no la duración del plan.
      let planLabel = 'Sin límite'
      let planDetail = 'Sin límite configurado'
      if (isInfiniteRental(panelRentalInfo)) {
        planLabel = 'Tiempo infinito'
        planDetail = 'Sin fecha de vencimiento'
      } else if (panelRentalInfo.expiresAt) {
        planLabel = formatRemainingLong(panelRentalInfo.expiresAt - Date.now(), panelRentalInfo)
        planDetail = 'Vence: ' + formatDateTime(panelRentalInfo.expiresAt, panelRentalInfo)
      }
      const rentalStatus = resolveRentalStatus(panelRentalInfo)
      const planStatusClass = rentalStatus === 'active' ? 'plan-active'
        : (rentalStatus === 'expired' ? 'plan-expired' : 'plan-paused')
      panelPlanPill = `
                <div class="stat-group stat-group-plan ${planStatusClass}">
                    <span class="stat-group-title"><i class="fas fa-id-card"></i> Tiempo restante</span>
                    <div class="stat-group-body plan-body">
                        <span class="plan-val">${planLabel}</span>
                        <span class="plan-detail">${planDetail}</span>
                    </div>
                </div>`
    }

    // Sección de canje de códigos (solo sub-bots)
    let panelRedeemBlock = ''
    if (isSubBot) {
      const history = (db.data.redeemedCodes || []).slice(0, 20)
      const historyHtml = history.length === 0
        ? `<p class="redeem-empty">Todavía no has canjeado ningún código.</p>`
        : `<ul class="redeem-history">${history.map(h => `
              <li>
                <span class="rh-code"><i class="fas fa-ticket"></i> ${escapeAttr(h.code)}</span>
                <span class="rh-reward">+${escapeAttr(h.rewardLabel || '')}</span>
                <span class="rh-date">${formatDateTime(h.at)}</span>
              </li>`).join('')}</ul>`
      const hasInfinite = isInfiniteRental(panelRentalInfo || {})
      const redeemFormHtml = hasInfinite
        ? `<div class="redeem-infinite"><i class="fas fa-infinity"></i> Ya tienes <strong>tiempo infinito</strong>, no necesitas canjear códigos.</div>`
        : `<p style="color:var(--text-dim); font-size:0.85rem; margin:-6px 0 16px;">¿Tienes un código de BOT SPAM ULTRA? Canjéalo para sumar tiempo a tu panel. Cada código solo se puede usar una vez por cuenta.</p>
            <form id="redeemForm" onsubmit="return redeemCodeNow(event)" class="redeem-form">
                <input type="text" id="redeemInput" name="code" placeholder="ULTRA-XXXX-XXXX" autocomplete="off" spellcheck="false">
                <button type="submit" class="btn btn-primary"><i class="fas fa-check"></i> Canjear</button>
            </form>`
      panelRedeemBlock = `
        <div class="section redeem-section" id="tour-redeem">
            <h2 style="color: var(--primary);"><span class="section-step">7</span><i class="fas fa-gift"></i> Canjear código</h2>
            ${redeemFormHtml}
            <div class="redeem-history-wrap">
                <button type="button" class="redeem-h3 redeem-toggle" id="redeemHistoryToggle" onclick="toggleRedeemHistory()" aria-expanded="false">
                    <span><i class="fas fa-clock-rotate-left"></i> Historial de canjes${history.length ? ` (${history.length})` : ''}</span>
                    <span class="redeem-toggle-ic"><span class="redeem-toggle-txt">Ver</span> <i class="fas fa-chevron-down"></i></span>
                </button>
                <div id="redeemHistoryBody" style="display:none;">${historyHtml}</div>
            </div>
        </div>`
    }

    const resellerNavLink = (isSubBot && readResellerPanelFromLink(subBotNumber).enabled)
        ? `<a href="/panel-revendedor" class="nav-link-btn" style="border-color:rgba(196,165,116,0.4); color:var(--primary);"><i class="fas fa-store"></i> Panel revendedor</a>`
        : ''

    const panelBranding = getText3dConfig()

    let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeAttr(panelBranding.brand)} ${escapeAttr(panelBranding.version)}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-body: #0c0d0f;
            --bg-card: #14161a;
            --bg-input: #0f1114;
            --primary: #c4a574;
            --primary-dim: rgba(196, 165, 116, 0.16);
            --primary-glow: rgba(196, 165, 116, 0.28);
            --secondary: #d4b896;
            --accent: #6b7280;
            --danger: #d97a7a;
            --text-main: #e8eaed;
            --text-dim: #8b929e;
            --border: #2a2e36;
            --radius-lg: 10px;
            --radius-md: 8px;
            --shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
            --shadow-glow: 0 0 36px rgba(196, 165, 116, 0.12);
        }

        @keyframes fadeUp {
            from { opacity: 0; transform: translateY(18px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 0.82; }
        }
        @keyframes statusPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        @keyframes liveBar {
            0% { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
        }
        @keyframes shimmer {
            0% { background-position: 200% center; }
            100% { background-position: -200% center; }
        }
        @keyframes floatBg {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(0, 0, 0); }
        }
        @keyframes orbFloat1 {
            0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.55; }
            50% { transform: translate3d(14px, -16px, 0); opacity: 0.75; }
        }
        @keyframes orbFloat2 {
            0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.4; }
            50% { transform: translate3d(-14px, -10px, 0); opacity: 0.58; }
        }
        @keyframes scanLine {
            0% { transform: translate3d(0, -100%, 0); opacity: 0; }
            50% { opacity: 0.35; }
            100% { transform: translate3d(0, 400%, 0); opacity: 0; }
        }
        @keyframes statCount {
            from { opacity: 0; transform: translate3d(0, 6px, 0); }
            to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes navGlow {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: var(--bg-body);
            color: var(--text-main);
            min-height: 100vh;
            -webkit-font-smoothing: antialiased;
            position: relative;
            overflow-x: hidden;
        }
        body::before {
            content: '';
            position: fixed;
            inset: 0;
            background:
                radial-gradient(ellipse 80% 50% at 20% -10%, rgba(20, 184, 166, 0.16), transparent 52%),
                radial-gradient(ellipse 60% 40% at 90% 10%, rgba(56, 189, 248, 0.1), transparent 45%),
                radial-gradient(ellipse 50% 30% at 50% 100%, rgba(45, 212, 191, 0.08), transparent 50%);
            pointer-events: none;
            z-index: 0;
            /* sin animation: el full-viewport paint continuo causaba lag en Android */
        }
        body::after {
            content: '';
            position: fixed;
            inset: 0;
            background-image: linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
            background-size: 56px 56px;
            pointer-events: none;
            z-index: 0;
            opacity: 0.7;
            /* mask-image se quita en móvil vía panel-performance; en desktop se reduce opacidad */
            mask-image: radial-gradient(ellipse at center, black 40%, transparent 85%);
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            position: relative;
            z-index: 1;
        }
        .ambient {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 0;
            overflow: hidden;
        }
        .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(42px);
            will-change: transform, opacity;
            contain: strict;
        }
        .orb-1 {
            width: 340px; height: 340px;
            background: rgba(20, 184, 166, 0.18);
            top: -8%; left: -5%;
            animation: orbFloat1 22s ease-in-out infinite;
        }
        .orb-2 {
            width: 280px; height: 280px;
            background: rgba(56, 189, 248, 0.12);
            top: 18%; right: -8%;
            animation: orbFloat2 26s ease-in-out infinite reverse;
        }
        .orb-3 {
            width: 240px; height: 240px;
            background: rgba(45, 212, 191, 0.1);
            bottom: 5%; left: 30%;
            animation: orbFloat1 28s ease-in-out infinite 4s;
        }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
        ::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, var(--primary), var(--secondary));
            border-radius: 99px;
        }
        .section {
            background: linear-gradient(145deg, rgba(24, 27, 36, 0.97) 0%, rgba(14, 16, 22, 0.94) 100%);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border-radius: var(--radius-lg);
            padding: 30px;
            margin: 24px 0;
            border: 1px solid var(--border);
            box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,0.04);
            transition: border-color 0.2s ease;
            position: relative;
            overflow: hidden;
        }
        .section::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(13,148,136,0.35), transparent);
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
        }
        @media (hover: hover) and (pointer: fine) {
            .section:hover::after { opacity: 1; }
            .section:hover {
                border-color: rgba(13, 148, 136, 0.22);
                box-shadow: var(--shadow), 0 0 40px rgba(13, 148, 136, 0.08), 0 12px 28px rgba(0,0,0,0.25);
            }
        }
        h2 {
            font-family: 'Space Grotesk', 'Inter', sans-serif;
            font-size: 1.2rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 14px;
            color: var(--text-main);
            margin-bottom: 25px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border);
            position: relative;
            letter-spacing: 0.02em;
        }
        h2 i {
            color: #5eead4;
            font-size: 1.1rem;
            flex-shrink: 0;
        }

        h2::after {
            content: '';
            position: absolute;
            bottom: -1px;
            left: 0;
            width: 64px;
            height: 2px;
            background: linear-gradient(90deg, #0f766e, transparent);
            border-radius: 2px;
        }

        .page-header {
            text-align: center;
            margin-bottom: 24px;
            padding: 40px 28px 32px;
            background:
                radial-gradient(ellipse 70% 80% at 50% -20%, rgba(20, 184, 166, 0.18), transparent 55%),
                linear-gradient(180deg, #121a18 0%, rgba(17, 21, 28, 0.96) 60%);
            border: 1px solid rgba(20, 184, 166, 0.2);
            border-radius: 14px;
            position: relative;
            overflow: hidden;
            animation: fadeUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
            box-shadow: 0 10px 28px rgba(0,0,0,0.22), 0 0 50px rgba(20, 184, 166, 0.08), inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .page-header .scan-fx {
            position: absolute;
            inset: 0;
            overflow: hidden;
            pointer-events: none;
        }
        .page-header .scan-fx::after {
            content: '';
            position: absolute;
            left: 0; right: 0;
            height: 45%;
            background: linear-gradient(180deg, transparent, rgba(20,184,166,0.1), transparent);
            animation: scanLine 5.5s ease-in-out infinite;
        }
        .page-header::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 3px;
            background: linear-gradient(90deg, transparent, #14b8a6, #5eead4, #38bdf8, #14b8a6, transparent);
            background-size: 200% 100%;
            animation: liveBar 4s linear infinite;
        }
        .page-header h1,
        .page-header .brand-heading {
            font-family: 'Space Grotesk', 'Inter', sans-serif;
            margin: 0 0 14px 0;
            font-size: clamp(1.45rem, 4.5vw, 2.15rem);
            font-weight: 700;
            line-height: 1.2;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 10px;
            color: #f1f5f9;
            -webkit-text-fill-color: #f1f5f9;
            background: none;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            position: relative;
            z-index: 1;
        }
        .page-header h1 i {
            -webkit-text-fill-color: #5eead4;
            color: #5eead4;
            filter: drop-shadow(0 0 10px rgba(94, 234, 212, 0.45));
        }
        .page-header .page-subtitle {
            display: block;
            color: var(--text-dim);
            font-size: 1rem;
            line-height: 1.6;
            margin: 0 auto;
            max-width: 520px;
            position: relative;
            z-index: 1;
        }
        .stat-board {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            align-items: stretch;
            gap: 12px;
            margin-top: 28px;
            position: relative;
            z-index: 1;
            max-width: 920px;
            margin-left: auto;
            margin-right: auto;
        }
        .stat-group {
            flex: 1 1 220px;
            max-width: 100%;
            padding: 14px 18px;
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 14px;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.68rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-dim);
            font-weight: 700;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .stat-group-title i { color: var(--primary); font-size: 0.75rem; }
        .stat-group-body { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
        .stat-mini-row {
            width: 100%;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
        }
        .stat-mini {
            min-width: 0;
            text-align: center;
            padding: 10px 6px 8px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            overflow: hidden;
        }
        .stat-mini-val {
            display: block;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 1.35rem;
            font-weight: 700;
            color: #5eead4;
            line-height: 1.1;
            text-shadow: 0 0 18px rgba(94, 234, 212, 0.35);
        }
        .stat-mini-lbl {
            display: block;
            font-size: 0.52rem;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            color: var(--text-dim);
            margin-top: 5px;
            font-weight: 600;
            line-height: 1.3;
            overflow-wrap: break-word;
            word-break: break-word;
            hyphens: auto;
            max-width: 100%;
            padding: 0 1px;
        }
        .schedule-times { width: 100%; justify-content: center; gap: 12px; }
        .sched-slot {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            min-width: 76px;
        }
        .sched-slot-lbl {
            font-size: 0.6rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-dim);
            font-weight: 600;
        }
        .sched-slot-val {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 1.05rem;
            font-weight: 700;
            color: var(--text-main);
            white-space: nowrap;
        }
        .sched-sep { color: var(--text-dim); font-size: 0.9rem; opacity: 0.6; }
        .sched-badge {
            font-size: 0.62rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            padding: 5px 10px;
            border-radius: 99px;
            margin-left: 4px;
        }
        .stat-group-schedule.sched-on {
            border-color: rgba(139, 92, 246, 0.35);
        }
        .stat-group-schedule.sched-on .sched-slot-val { color: #c4b5fd; }
        .stat-group-schedule.sched-on .sched-badge {
            background: rgba(139, 92, 246, 0.2);
            color: #c4b5fd;
            border: 1px solid rgba(139, 92, 246, 0.35);
        }
        .stat-group-schedule.sched-off { opacity: 0.72; }
        .stat-group-schedule.sched-off .sched-badge {
            background: rgba(148, 163, 184, 0.12);
            color: var(--text-dim);
            border: 1px solid rgba(148, 163, 184, 0.2);
        }
        .stat-group-plan .plan-body {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
            width: 100%;
        }
        .stat-group-plan .plan-val {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--primary);
            line-height: 1.25;
        }
        .stat-group-plan .plan-detail {
            font-size: 0.72rem;
            color: var(--text-dim);
            line-height: 1.4;
        }
        .stat-group-plan.plan-expired {
            border-color: rgba(239, 68, 68, 0.45);
        }
        .stat-group-plan.plan-expired .plan-val { color: #fca5a5; }
        .stat-group-plan.plan-paused { border-color: rgba(148, 163, 184, 0.35); }
        .stat-group-plan.plan-paused .plan-val { color: #cbd5e1; }
        @media (max-width: 600px) {
            .stat-board { flex-direction: column; }
            .stat-group { flex: 1 1 auto; }
        }
        .glass-nav {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 12px 16px;
            margin-bottom: 20px;
            background: rgba(10, 12, 18, 0.92);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            border: 1px solid var(--border);
            border-radius: 14px;
            position: sticky;
            top: 12px;
            z-index: 100;
            box-shadow: 0 8px 24px rgba(0,0,0,0.35);
            animation: fadeUp 0.4s ease;
        }
        .glass-nav a {
            color: var(--text-dim);
            text-decoration: none;
            font-size: 0.8rem;
            font-weight: 600;
            padding: 8px 14px;
            border-radius: 10px;
            border: 1px solid transparent;
            transition: all 0.25s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .glass-nav a:hover {
            color: var(--primary);
            background: var(--primary-dim);
            border-color: rgba(13, 148, 136, 0.25);
            transform: translateY(-1px);
        }
        .glass-nav a i { font-size: 0.75rem; opacity: 0.8; }
        .glass-nav a .nav-step {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 18px;
            height: 18px;
            padding: 0 5px;
            border-radius: 6px;
            font-size: 0.65rem;
            font-weight: 800;
            background: rgba(255,255,255,0.06);
            color: var(--text-dim);
        }
        .glass-nav a:hover .nav-step { background: rgba(13,148,136,0.2); color: var(--primary); }
        .section-step {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 26px;
            height: 26px;
            border-radius: 8px;
            font-size: 0.72rem;
            font-weight: 800;
            background: rgba(13,148,136,0.12);
            color: var(--primary);
            border: 1px solid rgba(13,148,136,0.25);
            margin-right: 4px;
            flex-shrink: 0;
        }
        .top-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            align-items: center;
            margin-bottom: 16px;
            animation: fadeUp 0.6s ease 0.12s backwards;
        }
        .top-actions .nav-link-btn,
        .top-actions .nav-btn-autoreply,
        .top-actions .btn-tutorial-trigger { margin: 0; }

        /* â”€â”€ Canjear código (sub-bot) â”€â”€ */
        .redeem-section { border-color: rgba(13,148,136,0.25) !important; }
        .redeem-form { display: flex; gap: 12px; flex-wrap: wrap; }
        .redeem-form input {
            flex: 1; min-width: 200px;
            text-transform: uppercase; letter-spacing: 1px;
            font-family: 'Space Grotesk', monospace; font-weight: 600;
        }
        .redeem-form .btn { white-space: nowrap; }
        .redeem-history-wrap { margin-top: 20px; }
        .redeem-h3 {
            font-size: 0.9rem; color: var(--text-dim); margin-bottom: 12px;
            display: flex; align-items: center; gap: 8px;
        }
        .redeem-toggle {
            width: 100%; justify-content: space-between;
            background: transparent; border: none; cursor: pointer;
            font-family: inherit; font-weight: 600; text-align: left;
            padding: 4px 0; transition: color .2s ease;
        }
        .redeem-toggle:hover { color: var(--primary); }
        .redeem-toggle > span { display: inline-flex; align-items: center; gap: 8px; }
        .redeem-toggle-ic { font-size: 0.78rem; color: var(--primary); }
        .redeem-toggle-ic i { transition: transform .2s ease; }
        .redeem-empty { font-size: 0.85rem; color: var(--text-dim); }
        .redeem-infinite {
            display: flex; align-items: center; gap: 10px;
            background: rgba(13,148,136,0.08); border: 1px solid rgba(13,148,136,0.2);
            border-radius: 12px; padding: 14px 16px; font-size: 0.9rem; color: var(--text);
        }
        .redeem-infinite i { color: var(--primary); font-size: 1.2rem; }
        .redeem-history { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .redeem-history li {
            display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
            border-radius: 10px; padding: 10px 14px; font-size: 0.82rem;
        }
        .rh-code { font-family: 'Space Grotesk', monospace; font-weight: 700; color: var(--primary); }
        .rh-reward { color: #38bdf8; font-weight: 600; }
        .rh-date { color: var(--text-dim); margin-left: auto; }

        /* â”€â”€ Toasts â”€â”€ */
        #toastWrap {
            position: fixed; bottom: 22px; right: 22px; z-index: 99999;
            display: flex; flex-direction: column; gap: 10px; max-width: 90vw;
        }
        .toast {
            display: flex; align-items: center; gap: 10px;
            background: #15171e; color: #fff; padding: 13px 17px;
            border-radius: 12px; font-size: 0.88rem; font-family: 'Inter', sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            border-left: 4px solid var(--primary);
            opacity: 0; transform: translateX(40px); transition: all .35s cubic-bezier(.2,.9,.3,1.2);
        }
        .toast.show { opacity: 1; transform: translateX(0); }
        .toast.toast-error { border-left-color: #ff3e3e; }
        .toast.toast-ok i { color: var(--primary); }
        .toast.toast-error i { color: #ff3e3e; }

        /* Layout Organizado */
        .form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
            align-items: flex-end;
        }
        .input-group {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .control-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 16px;
            margin-top: 20px;
        }
        .status-item {
            background: var(--bg-input);
            padding: 15px;
            margin: 10px 0;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
        }
        .active-campaign-banner {
            background: #0f766e;
            color: #ecfdf5;
            padding: 12px 20px;
            border-radius: var(--radius-md);
            font-weight: 700;
            font-size: 0.9rem;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
            border: 1px solid rgba(45, 212, 191, 0.25);
            box-shadow: none;
        }
        .btn {
            font-family: inherit;
            font-size: 0.875rem;
            font-weight: 600;
            padding: 10px 18px;
            border-radius: var(--radius-md);
            border: none;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }
        .btn::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
            opacity: 0;
            transition: opacity 0.25s;
        }
        .btn:hover::before { opacity: 1; }
        .btn:active { transform: scale(0.97); }
        .btn-primary {
            background: #0f766e;
            color: #ecfdf5;
            border: 1px solid rgba(45, 212, 191, 0.25);
            box-shadow: none;
        }
        .btn-primary:hover {
            background: #0d9488;
            box-shadow: 0 6px 18px rgba(15, 118, 110, 0.28);
            transform: translateY(-1px);
        }
        .btn-secondary { background: #1e293b; color: #e2e8f0; border: 1px solid rgba(148,163,184,0.2); }
        .btn-secondary:hover { background: #334155; }
        .btn-ghost {
            background: rgba(255,255,255,0.03);
            color: var(--text-dim);
            border: 1px solid var(--border);
        }
        .btn-ghost:hover {
            border-color: rgba(13, 148, 136, 0.45);
            color: #5eead4;
            background: var(--primary-dim);
            transform: translateY(-1px);
        }
        .btn-new-campaign { background: #0f766e; color: #ecfdf5; font-weight:700; border: 1px solid rgba(45, 212, 191, 0.25); }

        .campaign-selector {
            background: var(--bg-input);
            padding: 20px;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border);
            display: flex;
            gap: 15px;
            align-items: center;
            margin-bottom: 20px;
        }
        .campaign-selector select {
            background: var(--bg-card);
            color: white;
            padding: 12px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            flex: 1;
            font-size: 1rem;
            outline: none;
        }
        .campaign-selector select:focus { border-color: var(--primary); }

        .optional-badge {
            display: inline-block;
            font-size: 0.58rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-dim);
            background: rgba(148, 163, 184, 0.12);
            border: 1px solid rgba(148, 163, 184, 0.22);
            padding: 3px 9px;
            border-radius: 99px;
            vertical-align: middle;
            margin-left: 8px;
        }
        .spam-mode-picker {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 18px;
        }
        .spam-mode-option {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            padding: 14px 14px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            background: rgba(0,0,0,0.28);
            cursor: pointer;
            transition: border-color 0.2s, background 0.2s;
        }
        .spam-mode-option input { margin-top: 4px; accent-color: #0f766e; }
        .spam-mode-option.active {
            border-color: rgba(13, 148, 136, 0.45);
            background: rgba(13, 148, 136, 0.08);
        }
        .spam-mode-option strong { display: block; color: var(--text-main); font-size: 0.92rem; }
        .spam-mode-option small { display: block; color: var(--text-dim); font-size: 0.75rem; margin-top: 4px; line-height: 1.35; }
        .spam-mode-ico {
            width: 36px; height: 36px; flex-shrink: 0;
            display: inline-flex; align-items: center; justify-content: center;
            border-radius: 10px; background: rgba(13,148,136,0.15); color: #5eead4;
        }
        .weekly-help {
            font-size: 0.82rem; color: var(--text-dim); line-height: 1.45; margin: 0 0 14px;
        }
        .weekly-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 8px;
        }
        .weekly-day {
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            padding: 12px;
            background: rgba(0,0,0,0.28);
        }
        .weekly-day-head {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 10px;
        }
        .weekly-day-head strong { font-size: 0.9rem; color: var(--text-main); }
        .weekly-day-count { font-size: 0.72rem; color: var(--text-dim); }
        .weekly-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 28px; margin-bottom: 10px; }
        .weekly-empty { font-size: 0.75rem; color: var(--text-dim); opacity: 0.7; }
        .weekly-chip {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 4px 8px; border-radius: 999px;
            background: rgba(14, 165, 233, 0.12);
            border: 1px solid rgba(56, 189, 248, 0.28);
            color: #7dd3fc; font-size: 0.78rem; font-weight: 600;
        }
        .weekly-chip-x {
            border: 0; background: transparent; color: #fca5a5; cursor: pointer;
            font-size: 1rem; line-height: 1; padding: 0 2px;
        }
        .weekly-add-row { display: flex; gap: 8px; align-items: center; }
        .weekly-add-row input[type="time"] {
            flex: 1; min-width: 0;
            background: var(--bg-input); border: 1px solid var(--border);
            color: var(--text-main); border-radius: 8px; padding: 6px 8px;
        }
        .btn-weekly-add {
            border: 1px solid rgba(13,148,136,0.35);
            background: rgba(13,148,136,0.12);
            color: #5eead4; border-radius: 8px; padding: 6px 10px;
            font-size: 0.75rem; font-weight: 700; cursor: pointer; white-space: nowrap;
        }
        .btn-weekly-add:hover { background: rgba(13,148,136,0.22); }
        @media (max-width: 720px) {
            .spam-mode-picker, .weekly-grid { grid-template-columns: 1fr; }
        }
        .schedule-card {
            background: linear-gradient(160deg, rgba(20, 24, 32, 0.95) 0%, rgba(14, 17, 24, 0.98) 100%);
            border: 1px solid rgba(139, 92, 246, 0.18);
            border-radius: var(--radius-lg);
            padding: 22px;
            margin-top: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .schedule-card.schedule-active {
            border-color: rgba(13, 148, 136, 0.28);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(13, 148, 136, 0.08);
        }
        .schedule-toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 14px 16px;
            background: rgba(0, 0, 0, 0.28);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            margin-bottom: 20px;
        }
        .schedule-toggle-label {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .schedule-toggle-label strong {
            font-size: 0.95rem;
            color: var(--text-main);
        }
        .schedule-toggle-label span {
            font-size: 0.8rem;
            color: var(--text-dim);
        }
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 52px;
            height: 30px;
            flex-shrink: 0;
        }
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            inset: 0;
            background: #334155;
            border-radius: 999px;
            transition: 0.25s;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .toggle-slider::before {
            content: '';
            position: absolute;
            height: 22px;
            width: 22px;
            left: 3px;
            bottom: 3px;
            background: #fff;
            border-radius: 50%;
            transition: 0.25s;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
        }
        .toggle-switch input:checked + .toggle-slider {
            background: #0f766e;
            border-color: rgba(45, 212, 191, 0.28);
        }
        .toggle-switch input:checked + .toggle-slider::before {
            transform: translateX(22px);
        }
        .schedule-status-box {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            margin-top: 16px;
            padding: 14px 16px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            font-size: 0.88rem;
            line-height: 1.5;
        }
        .schedule-status-box > i {
            margin-top: 2px;
            opacity: 0.9;
            flex-shrink: 0;
        }
        .schedule-status-box.on-window {
            background: rgba(13, 148, 136, 0.08);
            border-color: rgba(13, 148, 136, 0.25);
            color: #5eead4;
        }
        .schedule-status-box.off-window {
            background: rgba(251, 191, 36, 0.08);
            border-color: rgba(251, 191, 36, 0.25);
            color: #fde68a;
        }
        .schedule-status-box.disabled {
            background: rgba(148, 163, 184, 0.08);
            color: var(--text-dim);
        }
        .schedule-time-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
        }
        .schedule-time-slot {
            position: relative;
            padding: 16px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            background: rgba(0, 0, 0, 0.32);
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .schedule-time-slot:hover {
            border-color: rgba(255, 255, 255, 0.14);
        }
        .schedule-time-slot.slot-start {
            border-color: rgba(251, 191, 36, 0.22);
            background: linear-gradient(145deg, rgba(251, 191, 36, 0.06) 0%, rgba(0, 0, 0, 0.32) 55%);
        }
        .schedule-time-slot.slot-stop {
            border-color: rgba(139, 92, 246, 0.25);
            background: linear-gradient(145deg, rgba(139, 92, 246, 0.08) 0%, rgba(0, 0, 0, 0.32) 55%);
        }
        .schedule-time-slot label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.72rem;
            color: var(--text-dim);
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            margin-bottom: 12px;
        }
        .schedule-time-slot label i {
            width: 28px;
            height: 28px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            font-size: 0.8rem;
        }
        .slot-start label i {
            background: rgba(251, 191, 36, 0.15);
            color: #fbbf24;
        }
        .slot-stop label i {
            background: rgba(139, 92, 246, 0.18);
            color: #c4b5fd;
        }
        .schedule-time-field {
            position: relative;
        }
        .schedule-time-field input[type="time"] {
            width: 100%;
            padding: 14px 44px 14px 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            background: #0c0f14;
            color: var(--text-main);
            font-family: 'Space Grotesk', 'Inter', monospace;
            font-size: 1.15rem;
            font-weight: 600;
            letter-spacing: 0.04em;
            outline: none;
            color-scheme: dark;
            transition: border-color 0.2s, box-shadow 0.2s;
            -webkit-appearance: none;
            appearance: none;
        }
        .schedule-time-field input[type="time"]:focus {
            border-color: rgba(13, 148, 136, 0.45);
            box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1);
        }
        .schedule-time-field input[type="time"]::-webkit-calendar-picker-indicator {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            width: 22px;
            height: 22px;
            cursor: pointer;
            opacity: 0.55;
            filter: invert(0.85);
        }
        .schedule-time-field input[type="time"]::-webkit-datetime-edit {
            padding: 0;
        }
        .schedule-time-field input[type="time"]::-webkit-datetime-edit-hour-field,
        .schedule-time-field input[type="time"]::-webkit-datetime-edit-minute-field,
        .schedule-time-field input[type="time"]::-webkit-datetime-edit-ampm-field {
            color: var(--text-main);
            padding: 0 2px;
        }
        .time-hint {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-top: 10px;
            padding: 5px 10px;
            font-size: 0.78rem;
            color: #c4b5fd;
            font-weight: 700;
            background: rgba(139, 92, 246, 0.12);
            border: 1px solid rgba(139, 92, 246, 0.22);
            border-radius: 99px;
        }
        .slot-start .time-hint {
            color: #fde68a;
            background: rgba(251, 191, 36, 0.1);
            border-color: rgba(251, 191, 36, 0.22);
        }
        .btn-schedule-save {
            width: 100%;
            margin-top: 18px;
            padding: 14px 18px;
            background: linear-gradient(135deg, var(--accent) 0%, #6d28d9 100%);
            color: #fff;
            border: 1px solid rgba(139, 92, 246, 0.4);
            box-shadow: 0 4px 20px rgba(139, 92, 246, 0.25);
        }
        .btn-schedule-save:hover {
            box-shadow: 0 6px 28px rgba(139, 92, 246, 0.4);
            transform: translateY(-1px);
        }
        @media (max-width: 600px) {
            .schedule-time-grid { grid-template-columns: 1fr; }
        }
        
        .checkbox-group {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 12px;
        }
        .checkbox-item {
            background: var(--bg-input);
            padding: 12px 14px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            transition: all 0.25s ease;
        }
        .checkbox-item:hover {
            border-color: rgba(13, 148, 136, 0.35);
            background: rgba(13, 148, 136, 0.04);
            transform: translateX(4px);
        }
        .checkbox-item label {
            display: flex;
            align-items: center;
            cursor: pointer;
            color: var(--text-main);
            font-size: 0.9rem;
        }
        .checkbox-item input[type="checkbox"] {
            margin-right: 12px;
            accent-color: var(--primary);
        }
        .checkbox-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 4px;
            padding: 10px 12px;
        }
        .checkbox-item label {
            flex: 1;
            min-width: 0;
        }
        .checkbox-item .group-name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .checkbox-item.is-highlighted {
            border-color: rgba(251, 191, 36, 0.45);
            background: linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(0, 0, 0, 0.2));
            box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.12);
        }
        .status-item.is-highlighted-group {
            border-color: rgba(251, 191, 36, 0.35);
            background: linear-gradient(135deg, rgba(251, 191, 36, 0.06), var(--bg-input));
        }
        .highlight-star {
            color: #fbbf24;
            margin-right: 6px;
        }
        .group-search-wrap {
            position: relative;
            margin-bottom: 14px;
        }
        .group-search-wrap > i {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-dim);
            font-size: 0.88rem;
            width: 18px;
            text-align: center;
            pointer-events: none;
            z-index: 1;
        }
        .group-search-wrap input.group-search-input {
            width: 100%;
            padding: 11px 14px 11px 48px;
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            background: rgba(0, 0, 0, 0.35);
            color: var(--text-main);
            font-family: inherit;
            font-size: 0.9rem;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
            box-sizing: border-box;
        }
        .group-search-wrap input.group-search-input:focus {
            border-color: rgba(13, 148, 136, 0.45);
            box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.08);
        }
        .group-search-wrap input.group-search-input::placeholder {
            color: var(--text-dim);
        }
        .group-search-empty {
            display: none;
            text-align: center;
            padding: 24px 12px;
            color: var(--text-dim);
            font-size: 0.88rem;
        }
        .spam-time-guide {
            background: linear-gradient(160deg, rgba(14, 165, 233, 0.08), rgba(0, 0, 0, 0.25));
            border: 1px solid rgba(14, 165, 233, 0.22);
            border-radius: var(--radius-md);
            padding: 16px 18px;
            margin-bottom: 20px;
        }
        .spam-time-guide-head {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 700;
            font-size: 0.92rem;
            color: var(--secondary);
            margin-bottom: 12px;
        }
        .spam-time-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.86rem;
        }
        .spam-time-table th, .spam-time-table td {
            text-align: left;
            padding: 7px 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .spam-time-table th {
            color: var(--text-dim);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.68rem;
            letter-spacing: 0.06em;
        }
        .spam-time-table td:last-child {
            color: var(--primary);
            font-weight: 700;
            text-align: right;
            font-family: 'Space Grotesk', monospace;
        }
        .spam-time-table tbody tr:last-child td { border-bottom: none; }
        .spam-time-note {
            font-size: 0.82rem;
            color: var(--text-dim);
            line-height: 1.5;
            margin: 12px 0 0;
        }
        .spam-time-note strong { color: var(--text-main); }
        .spam-time-current {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 8px;
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px dashed rgba(255, 255, 255, 0.1);
            font-size: 0.85rem;
            color: var(--text-dim);
        }
        .spam-time-current strong { color: var(--text-main); }
        .spam-time-reco strong { color: var(--primary); }
        .spam-time-disclaimer {
            font-size: 0.8rem;
            color: #fcd34d;
            line-height: 1.5;
            margin: 12px 0 0;
            padding: 10px 12px;
            background: rgba(251, 191, 36, 0.08);
            border: 1px solid rgba(251, 191, 36, 0.25);
            border-radius: 10px;
        }
        .spam-time-disclaimer i { margin-right: 6px; }
        .spam-warn-modal {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.78);
            backdrop-filter: blur(4px);
            z-index: 2000;
            align-items: center;
            justify-content: center;
            padding: 18px;
        }
        .spam-warn-modal.open { display: flex; }
        .spam-warn-box {
            width: 100%;
            max-width: 440px;
            background: linear-gradient(160deg, #1a1410, #14110d);
            border: 1px solid rgba(251, 191, 36, 0.4);
            border-radius: 18px;
            padding: 28px 24px;
            text-align: center;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
        }
        .spam-warn-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 16px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(251, 191, 36, 0.14);
            border: 1px solid rgba(251, 191, 36, 0.4);
            color: #fbbf24;
            font-size: 1.7rem;
        }
        .spam-warn-box h3 {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 1.25rem;
            color: #fde68a;
            margin: 0 0 12px;
        }
        .spam-warn-text {
            font-size: 0.95rem;
            color: var(--text-main);
            line-height: 1.6;
            margin: 0 0 8px;
        }
        .spam-warn-text strong { color: #fbbf24; }
        .spam-warn-sub {
            font-size: 0.82rem;
            color: var(--text-dim);
            line-height: 1.5;
            margin: 0 0 22px;
        }
        .spam-warn-actions {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .spam-warn-actions .btn {
            width: 100%;
            min-width: 0;
            height: auto;
            padding: 13px 16px;
            font-size: 0.9rem;
        }
        .spam-warn-safe {
            background: #0f766e;
            color: #ecfdf5;
            font-weight: 700;
            border: 1px solid rgba(45, 212, 191, 0.25);
        }
        .spam-warn-continue {
            background: transparent;
            color: var(--text-dim);
            border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .spam-warn-continue:hover {
            border-color: var(--danger);
            color: #fca5a5;
        }
        textarea, input[type="number"], input[type="text"], input[type="password"], input[type="file"], input[type="time"], select {
            width: 100%;
            padding: 12px 14px;
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            background: rgba(0, 0, 0, 0.35);
            color: var(--text-main);
            outline: none;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: inherit;
        }
        textarea:focus, input:focus, select:focus { 
            border-color: var(--primary);
            box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.1), 0 0 24px rgba(13, 148, 136, 0.08);
            transform: translateY(-1px);
            background: rgba(13, 148, 136, 0.03);
        }
        .input-group label {
            font-size: 0.75rem;
            color: var(--text-dim);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }

        /* Diseño Moderno para Input File */
        input[type="file"] {
            padding: 8px;
            cursor: pointer;
            font-size: 0.85rem;
        }
        input[type="file"]::-webkit-file-upload-button {
            background: #0f766e;
            color: #ecfdf5;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            margin-right: 12px;
            cursor: pointer;
            font-weight: 700;
            transition: 0.2s;
        }
        input[type="file"]::-webkit-file-upload-button:hover {
            opacity: 0.8;
        }

        /* Botón Adaptivo Seleccionar Todo */
        .btn-toggle-all {
            background: transparent;
            color: var(--text-dim);
            border: 1px solid var(--border);
            padding: 10px 18px;
            border-radius: var(--radius-md);
            cursor: pointer;
            font-weight: 600;
            font-size: 0.85rem;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .btn-toggle-all.is-all {
            background: #0f766e;
            color: #ecfdf5;
            border-color: rgba(45, 212, 191, 0.25);
            box-shadow: none;
        }

        /* Scroll personalizado para grids largos */
        .scroll-grid {
            max-height: 400px;
            overflow-y: auto;
            padding-right: 10px;
            margin-top: 15px;
        }
        .scroll-grid::-webkit-scrollbar { width: 6px; }
        .scroll-grid::-webkit-scrollbar-track { background: var(--bg-body); }
        .scroll-grid::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
        .scroll-grid::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

        /* Espaciado Ajustado y Agrupación */
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
        }
        
        button {
            height: 48px; /* Altura consistente para botones */
            min-width: 140px;
        }
        .checkbox-item .btn-highlight {
            flex-shrink: 0;
            min-width: 0;
            width: auto;
            height: auto;
            padding: 0 2px;
            margin: 0;
            border: none;
            background: transparent;
            border-radius: 0;
            box-shadow: none;
            color: var(--text-dim);
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.85rem;
            line-height: 1;
            opacity: 0.45;
            transition: color 0.2s ease, opacity 0.2s ease, transform 0.15s ease;
        }
        .checkbox-item .btn-highlight:hover {
            color: #fbbf24;
            opacity: 1;
            transform: scale(1.12);
            background: transparent;
        }
        .checkbox-item .btn-highlight.active {
            color: #fbbf24;
            opacity: 1;
            background: transparent;
            box-shadow: none;
            filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.45));
        }

        .btn-danger {
            background: rgba(239, 68, 68, 0.1);
            color: var(--danger);
            border: 1px solid var(--danger);
        }
        .btn-danger:hover {
            background: var(--danger);
            color: white;
        }
        
        .badge {
            background: var(--danger);
            color: white;
            border-radius: 99px;
            padding: 2px 8px;
            font-size: 0.7rem;
            margin-left: 8px;
            font-weight: 800;
        }
        .scroll-grid {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid var(--border);
            padding: 15px;
            border-radius: var(--radius-lg);
            background: rgba(0,0,0,0.2);
            margin-bottom: 12px;
        }
        .scroll-grid::-webkit-scrollbar {
            width: 6px;
        }
        .scroll-grid::-webkit-scrollbar-thumb {
            background: var(--primary);
            border-radius: 10px;
        }
        .btn-show-more {
            width: 100%;
            background: transparent;
            color: var(--primary);
            border: 1px solid var(--primary);
            margin-top: 10px;
            padding: 10px;
            border-radius: var(--radius-md);
            cursor: pointer;
            font-weight: 700;
            transition: 0.3s;
        }
        .btn-show-more:hover {
            background: #0f766e;
            color: #ecfdf5;
        }
        .nav-link-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--text-dim);
            text-decoration: none;
            background: var(--bg-card);
            backdrop-filter: blur(8px);
            padding: 10px 18px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            transition: all 0.25s ease;
            font-weight: 500;
            font-size: 0.875rem;
        }
        .nav-link-btn:hover {
            border-color: var(--primary);
            color: var(--primary);
            background: var(--primary-dim);
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(13, 148, 136, 0.15);
        }
        .nav-btn-autoreply {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 10px 16px 10px 14px;
            border-radius: var(--radius-md);
            text-decoration: none;
            font-weight: 700;
            font-size: 0.875rem;
            color: #ecfdf5;
            background: linear-gradient(135deg, #14b8a6 0%, #0d9488 48%, #0f766e 100%);
            border: 1px solid rgba(94, 234, 212, 0.45);
            box-shadow: 0 4px 18px rgba(13, 148, 136, 0.38);
            transition: all 0.25s ease;
            position: relative;
        }
        .nav-btn-autoreply i { font-size: 1rem; }
        .nav-btn-autoreply:hover {
            transform: translateY(-2px);
            color: #fff;
            box-shadow: 0 8px 26px rgba(13, 148, 136, 0.5);
            filter: brightness(1.05);
        }
        .nav-btn-autoreply .nav-ar-badge {
            font-size: 0.62rem;
            font-weight: 800;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            padding: 3px 7px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.2);
            color: #ccfbf1;
            border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .ar-feature-link {
            display: flex;
            align-items: center;
            gap: 14px;
            width: 100%;
            grid-column: 1 / -1;
            text-align: left;
            text-decoration: none;
            padding: 16px 18px;
            border-radius: 14px;
            color: #ecfdf5;
            background: linear-gradient(120deg, rgba(20,184,166,0.22) 0%, rgba(15,23,42,0.92) 42%, rgba(13,148,136,0.16) 100%);
            border: 1px solid rgba(45, 212, 191, 0.4);
            box-shadow: 0 10px 28px rgba(13, 148, 136, 0.18);
            transition: all 0.25s ease;
            cursor: pointer;
            font: inherit;
        }
        .ar-feature-link:hover {
            transform: translateY(-2px);
            border-color: rgba(94, 234, 212, 0.55);
            box-shadow: 0 14px 32px rgba(13, 148, 136, 0.28);
        }
        .ar-feature-ico {
            width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            background: linear-gradient(135deg, #14b8a6, #0f766e);
            color: #fff; font-size: 1.1rem;
            box-shadow: 0 4px 14px rgba(13, 148, 136, 0.35);
        }
        .ar-feature-copy { flex: 1; min-width: 0; }
        .ar-feature-copy strong {
            display: block; font-size: 0.98rem; font-weight: 700; color: #f0fdfa; margin-bottom: 3px;
        }
        .ar-feature-copy span {
            display: block; font-size: 0.78rem; color: #99f6e4; line-height: 1.35; opacity: 0.92;
        }
        .ar-feature-go {
            color: #5eead4; font-size: 0.9rem; flex-shrink: 0;
        }
        .btn-tutorial-trigger {
            background: linear-gradient(135deg, #a78bfa, #7c3aed);
            color: white;
            border: none;
            padding: 10px 18px;
            border-radius: var(--radius-md);
            cursor: pointer;
            font-weight: 600;
            font-size: 0.875rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 20px rgba(124, 58, 237, 0.35);
        }
        .btn-tutorial-trigger:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 28px rgba(124, 58, 237, 0.5);
        }
        .btn-tutorial-trigger:active { transform: scale(0.97); }

        .reveal-on-scroll {
            opacity: 0;
            transform: translateY(24px);
            transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .reveal-on-scroll.visible {
            opacity: 1;
            transform: translateY(0);
        }

        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        }
    </style>
    <script src="/panel-upload-js"></script>
    <script>
        window.startTour = function() {
            return import('/tutorial-js')
                .then(function(mod) {
                    if (typeof mod.initTutorial === 'function') {
                        mod.initTutorial();
                    } else {
                        throw new Error('initTutorial no exportado');
                    }
                })
                .catch(function(err) {
                    console.error('Tutorial not loaded', err);
                    alert('No se pudo cargar el tutorial. Recarga la pagina e intenta de nuevo.');
                });
        };
    </script>
</head>
<body>
    ${renderLoaderBlock()}
    <div id="spinner-progreso" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 10000; display: none; align-items: center; justify-content: center; flex-direction: column; font-family: 'Inter', sans-serif;">
        <div style="background: #15171e; padding: 40px; border-radius: 20px; border: 1px solid #0d9488; box-shadow: 0 0 30px rgba(13, 148, 136, 0.3); display: flex; flex-direction: column; align-items: center; max-width: 400px; width: 90%;">
            <div style="width: 60px; height: 60px; border: 5px solid rgba(13, 148, 136, 0.2); border-top: 5px solid #0d9488; border-radius: 50%; animation: spin-loader 1s linear infinite; margin-bottom: 20px;"></div>
            <style>@keyframes spin-loader { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            <h3 id="titulo-spinner" style="color: white; font-size: 1.4rem; font-weight: bold; margin: 0 0 10px 0; text-align: center;">Guardando Publicaciones</h3>
            <p id="mensaje-progreso" style="color: #0d9488; font-size: 0.9rem; margin: 0 0 20px 0; text-align: center;">Esto puede tardar según la cantidad de grupos...</p>
            <div style="width: 100%; background: #1c1f26; border-radius: 10px; height: 12px; overflow: hidden; border: 1px solid #262b36;">
                <div id="barra-progreso" style="width: 0%; height: 100%; background: linear-gradient(90deg, #0d9488, #0ea5e9); transition: width 0.3s ease;"></div>
            </div>
            <div id="texto-porcentaje" style="color: white; font-weight: bold; margin-top: 10px; font-family: monospace;">0%</div>
        </div>
    </div>
    <div class="ambient" aria-hidden="true">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
    </div>
    <div class="container">
        <div class="page-header">
            <div class="scan-fx"></div>
            ${renderBrandHeading('fas fa-terminal')}
            <small class="page-subtitle">Gestión de Campañas y Publicaciones Automatizadas</small>
            <div class="stat-board">
                ${panelCampaignBlock}
                ${panelScheduleBlock}
                ${panelPlanPill}
            </div>
        </div>
        
        <div class="top-actions">
        ${!isSubBot ? `
        <a href="/" class="nav-link-btn"><i class="fas fa-arrow-left"></i> Volver</a>
        ` : ''}
        <a href="/pubs" class="nav-link-btn"><i class="fas fa-images"></i> Publicaciones</a>
        <a href="/auto-respuestas" class="nav-btn-autoreply">
            <i class="fas fa-reply-all"></i>
            Respuestas automáticas
            <span class="nav-ar-badge">Privados</span>
        </a>
        <a href="/gestor-general" class="nav-link-btn" style="border-color:rgba(56,189,248,0.35); color:#7dd3fc;">
            <i class="fas fa-briefcase"></i> Gestor General
        </a>
        <a href="/bot-codigos" class="nav-link-btn" style="border-color:rgba(167,139,250,0.4); color:#c4b5fd;">
            <i class="fas fa-key"></i> Bot Códigos
        </a>
        <a href="/links-grupos" class="nav-link-btn" style="border-color:rgba(37,211,102,0.35); color:#86efac;">
            <i class="fas fa-link"></i> Links de grupos
        </a>
        ${resellerNavLink}
        <a href="/activity" class="nav-link-btn"><i class="fas fa-chart-line"></i> Actividad</a>
        <button type="button" onclick="startTour()" class="btn-tutorial-trigger">
            <i class="fas fa-graduation-cap"></i> Tutorial
        </button>
        </div>

        <nav class="glass-nav">
            <a href="#tour-campaign"><span class="nav-step">1</span><i class="fas fa-folder-open"></i> Campaña</a>
            <a href="#tour-control"><span class="nav-step">2</span><i class="fas fa-power-off"></i> Control</a>
            <a href="#tour-groups"><span class="nav-step">3</span><i class="fas fa-users"></i> Grupos</a>
            <a href="#tour-publications"><span class="nav-step">4</span><i class="fas fa-cloud-upload-alt"></i> Publicaciones</a>
            <a href="#tour-timer"><span class="nav-step">5</span><i class="fas fa-hourglass-half"></i> Tiempo</a>
            <a href="#tour-schedule"><span class="nav-step">6</span><i class="fas fa-calendar-day"></i> Modo envío</a>
            ${isSubBot ? `<a href="#tour-redeem"><span class="nav-step">7</span><i class="fas fa-gift"></i> Códigos</a>` : ''}
        </nav>
        
        <div class="section">
            <h2 style="color: var(--primary);"><i class="fas fa-shield-alt"></i> Seguridad de tu panel</h2>
            <form action="/update-master-credentials" method="POST" class="form-grid">
                <div class="input-group">
                    <label style="font-size:0.8rem; color:var(--text-dim)">Usuario Administrador</label>
                    <input type="text" name="new_username" value="${db.data.panelUser}" required>
                </div>
                <div class="input-group">
                    <label style="font-size:0.8rem; color:var(--text-dim)">Nueva Clave Secreta</label>
                    <input type="password" name="new_password" placeholder="********" required>
                </div>
                <button type="submit" class="btn btn-primary" style="height: 46px;">ACTUALIZAR DATOS</button>
            </form>
        </div>

        ${panelRedeemBlock}

        <div class="section" id="tour-campaign">
            <h2 style="color: var(--primary);"><span class="section-step">1</span><i class="fas fa-folder-open"></i> Campaña Activa</h2>
            <div class="form-grid">
                <div class="input-group">
                    <label style="font-size:0.8rem; color:var(--text-dim)">Seleccionar Carpeta</label>
                    <form action="/change-campaign" method="post" style="display:contents;">
                        <select name="campaignName" onchange="this.form.submit()">
                            ${Object.keys(db.data.campaigns || {}).map(c => `<option value="${c}" ${c === db.data.activeCampaign ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </form>
                </div>
                <button class="btn btn-primary" onclick="newCampaign()" style="height:46px;">+ Nueva Carpeta</button>
                <form action="/refresh-groups" method="post" style="display:contents;">
                    <button type="submit" class="btn btn-ghost" style="height:46px;" title="Actualizar lista de grupos">
                        <i class="fas fa-sync-alt"></i> Sincronizar
                    </button>
                </form>
            </div>
            
            <div style="margin-top:20px; padding:20px; background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:12px;">
                <h3 style="font-size:0.9em; color:var(--primary); margin-bottom:15px;"><i class="fas fa-shield-alt"></i> Copia de Seguridad de Grupos</h3>
                
                <div style="background: rgba(20,184,166,0.1); border: 1px solid rgba(20,184,166,0.45); padding: 10px; border-radius: 8px; margin-bottom: 20px; font-size: 0.75rem; color: #99f6e4;">
                    <i class="fas fa-info-circle"></i> <strong>Respaldo completo:</strong> guarda de esta carpeta los <b>grupos</b>, tiempos/horario y <b>publicaciones</b> (texto + imágenes), y también todo lo de <b>Auto-respuestas</b>, el <b>Gestor General</b> y <b>Bot Códigos</b> (buzones/alias). Los <b>videos</b> solo conservan el texto. Usá solo JSON descargados desde este panel.
                </div>

                <!-- EXPORTAR -->
                <div style="margin-bottom:20px; padding-bottom:15px; border-bottom:1px solid #222;">
                    <p style="font-size:0.8rem; color:#aaa; margin-bottom:10px;">
                        <strong>PASO 1 (Descargar):</strong> Copia completa (carpeta activa + auto-respuestas + gestor + bot códigos). Así no tenés que volver a configurar todo al mudarte.
                    </p>
                    <a href="/export-campaign-json" class="btn" style="background:#333; color:white; font-size:0.85em; width:100%; justify-content:center;">
                        <i class="fas fa-download"></i> DESCARGAR MI RESPALDO COMPLETO (JSON)
                    </a>
                </div>

                <!-- IMPORTAR -->
                <div>
                    <p style="font-size:0.8rem; color:#aaa; margin-bottom:10px;">
                        <strong>PASO 2 (Restaurar):</strong> Restaura grupos, publicaciones, auto-respuestas, gestor y bot códigos. Las imágenes del JSON se vuelven a crear en tu carpeta.
                    </p>
                    <form action="/import-campaign-json" method="post" enctype="multipart/form-data" style="display:flex; flex-direction:column; gap:10px;">
                        <input type="file" name="config_file" accept=".json" required style="font-size:0.8em; background:#111; padding:5px; border-radius:5px; border:1px solid #444;">
                        <button type="submit" class="btn" style="background:transparent; color:var(--primary); border:1px solid var(--primary); width:100%; justify-content:center; font-size:0.85em;">
                            <i class="fas fa-upload"></i> SUBIR Y RESTAURAR RESPALDO
                        </button>
                    </form>
                </div>
            </div>

            <div class="active-campaign-banner" style="margin-top:20px;">
                <i class="fas fa-bullseye"></i> Carpeta: ${db.data.activeCampaign}
            </div>
        </div>

        <script>
            function newCampaign() {
                const name = prompt('Nombre de la nueva carpeta (ej: CANVA, BOTS):');
                if (name && name.trim()) {
                    const form = document.createElement('form');
                    form.method = 'POST';
                    form.action = '/create-campaign';
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = 'name';
                    input.value = name.trim();
                    form.appendChild(input);
                    document.body.appendChild(form);
                    form.submit();
                }
            }
        </script>`

  const currentCampaign = db.data.campaigns[db.data.activeCampaign] || { groups: [], publications: [], enabled: false, lastSent: 0, interval: 600000, ...DEFAULT_CAMPAIGN_SCHEDULE }
  normalizeScheduleFields(currentCampaign)
  const scheduleStatus = getScheduleStatus(currentCampaign)
  const campaignSpamMode = getSpamMode(currentCampaign)
  const effectivelyActive = isCampaignEffectivelyEnabled(currentCampaign)
  const campaignRunning = campaignSpamMode === 'weekly'
    ? isCampaignManuallyOn(currentCampaign)
    : effectivelyActive
  const totalPubs = (currentCampaign.publications || []).length

  html += `<div class="section" id="tour-control">
    <div class="section-header">
        <h2 id="tour-control-title"><span class="section-step">2</span><i class="fas fa-power-off" style="color:var(--danger)"></i> Control manual</h2>
    </div>
    <div class="control-grid">
        <form action="/activate" method="post" style="margin:0;">
          <button type="submit" class="btn" style="width:100%; background:${campaignRunning ? 'var(--primary)' : 'var(--bg-input)'}; color:${campaignRunning ? '#000' : 'var(--text-dim)'};">
            <i class="fas fa-play"></i> ${campaignRunning ? 'SISTEMA ACTIVO' : 'ACTIVAR'}
          </button>
        ${currentCampaign.scheduleEnabled && campaignSpamMode === 'auto' ? '<p style="font-size:0.78rem; color:var(--text-dim); margin-top:8px; text-align:center;">Si usas estos botones, la programación diaria se desactivará.</p>' : ''}
        ${campaignSpamMode === 'weekly' ? '<p style="font-size:0.78rem; color:var(--text-dim); margin-top:8px; text-align:center;">Modo spam programado: la carpeta debe estar activa para enviar a las horas config.</p>' : ''}
        </form>
        <form action="/deactivate" method="post" style="margin:0;">
          <button type="submit" class="btn btn-danger" style="width:100%;">
            <i class="fas fa-stop"></i> DESACTIVAR
          </button>
        </form>
        <form action="/delete-campaign" method="post" onsubmit="return confirm('¿Eliminar carpeta ${db.data.activeCampaign}?')" style="margin:0;">
          <button type="submit" class="btn btn-ghost" style="width:100%; color:var(--danger); border-color:rgba(239, 68, 68, 0.2);">
            <i class="fas fa-trash-alt"></i> ELIMINAR
          </button>
        </form>
    </div></div>`

  html += `<div class="section" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <button class="btn btn-secondary" onclick="window.location.href='/pubs'" style="width:100%;">
            <i class="fas fa-list"></i> Ver Publicaciones (${totalPubs})
        </button>
        <button class="btn btn-ghost" onclick="window.location.href='/activity'" style="width:100%; color:var(--accent); border-color:var(--accent);">
            <i class="fas fa-history"></i> Ver Rendimiento
        </button>
        <a href="/auto-respuestas" class="ar-feature-link">
            <span class="ar-feature-ico"><i class="fas fa-reply-all"></i></span>
            <span class="ar-feature-copy">
                <strong>Respuestas automáticas</strong>
                <span>Atiende chats privados con palabras clave, horario y lista negra. Incluye guía de uso.</span>
            </span>
            <span class="ar-feature-go"><i class="fas fa-arrow-right"></i></span>
        </a>
        <a href="/gestor-general" class="ar-feature-link" style="background:linear-gradient(120deg, rgba(56,189,248,0.14) 0%, rgba(15,23,42,0.92) 45%, rgba(20,184,166,0.1) 100%); border-color:rgba(56,189,248,0.35);">
            <span class="ar-feature-ico" style="background:linear-gradient(135deg,#38bdf8,#0e7490);"><i class="fas fa-briefcase"></i></span>
            <span class="ar-feature-copy">
                <strong>Gestor General</strong>
                <span>Cuentas madre, perfiles, clientes y recordatorios de vencimiento (streaming, gym, bots, planes…).</span>
            </span>
            <span class="ar-feature-go"><i class="fas fa-arrow-right"></i></span>
        </a>
        <a href="/bot-codigos" class="ar-feature-link" style="background:linear-gradient(120deg, rgba(167,139,250,0.16) 0%, rgba(15,23,42,0.92) 45%, rgba(20,184,166,0.08) 100%); border-color:rgba(167,139,250,0.4);">
            <span class="ar-feature-ico" style="background:linear-gradient(135deg,#a78bfa,#6d28d9);"><i class="fas fa-key"></i></span>
            <span class="ar-feature-copy">
                <strong>Bot Códigos</strong>
                <span>Alias Spacemail + bandeja IMAP de códigos (Disney, Netflix, Max, Paramount, Crunchyroll…).</span>
            </span>
            <span class="ar-feature-go"><i class="fas fa-arrow-right"></i></span>
        </a>
        <a href="/links-grupos" class="ar-feature-link" style="background:linear-gradient(120deg, rgba(37,211,102,0.18) 0%, rgba(15,23,42,0.92) 42%, rgba(20,184,166,0.12) 100%); border-color:rgba(37,211,102,0.35);">
            <span class="ar-feature-ico" style="background:linear-gradient(135deg,#25d366,#128c7e);"><i class="fas fa-link"></i></span>
            <span class="ar-feature-copy">
                <strong>Links de grupos</strong>
                <span>${isSubBot ? 'Únete a grupos vivos: uno por uno o todos. Ve si ya estás dentro y si piden aprobación.' : 'Carga invitaciones, verifica si están vivas, libres o piden confirmación. Los sub-bots se unen desde su panel.'}</span>
            </span>
            <span class="ar-feature-go"><i class="fas fa-arrow-right"></i></span>
        </a>
    </div>`
  
  html += `<div class="section">
    <div class="section-header">
        <h2><i class="fas fa-list-check"></i> 1. Grupos Seleccionados</h2>
    </div>`
  const highlightedGroups = gruposDB.data.highlightedGroups || []
  const campaignGroups = sortGroupIdsByHighlight(currentCampaign.groups || [], highlightedGroups)
  const groupMap = new Map((gruposDB.data.groups || []).map(g => [g.id, g.name]))
  const campaignInterval = currentCampaign.interval || 600000
  const currentIntervalStr = Math.round(campaignInterval / 60000) + ' min'
  
  if (campaignGroups.length === 0) {
    html += `<p>No hay grupos para esta carpeta.</p>`
  } else {
    html += `<div id="selectedGroupsContainer">`
    campaignGroups.forEach((groupId, index) => {
      const groupName = groupMap.get(groupId) || 'Desconocido'
      const groupHighlighted = isGroupHighlighted(groupId, highlightedGroups)
      const highlightClass = groupHighlighted ? ' is-highlighted-group' : ''
      const highlightIcon = groupHighlighted ? '<i class="fas fa-star highlight-star"></i>' : ''
      const status = campaignSpamMode === 'weekly'
        ? (isCampaignManuallyOn(currentCampaign)
          ? '<span style="color:#38bdf8;">Spam programado</span>'
          : '<span style="color:#888;">Pausada</span>')
        : (effectivelyActive
          ? '<span style="color:#28a745;">Activa</span>'
          : (currentCampaign.scheduleEnabled
            ? '<span style="color:#fbbf24;">Pausada (horario)</span>'
            : '<span style="color:#888;">Pausada</span>'))
      const isHidden = index >= 5 ? 'style="display:none;" data-hidden="true"' : ''
      
      const campaignId = db.data.activeCampaign
      const key = `${campaignId}:${groupId}`
      const storedTime = db.data.timerState?.[key]
      let nextTime = '---'
      
      if (campaignSpamMode === 'weekly') {
          nextTime = scheduleStatus.nextTime || (isCampaignManuallyOn(currentCampaign) ? 'Sin horarios' : 'Carpeta off')
      } else if (effectivelyActive && storedTime) {
          const d = new Date(storedTime)
          if (d > new Date()) {
              nextTime = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
          } else {
              nextTime = 'En cola / Pronto'
          }
      } else if (effectivelyActive) {
          nextTime = 'Calculando...'
      }
      
      html += `<div class="status-item${highlightClass}" ${isHidden}>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span>${highlightIcon}<strong>${groupName}</strong> (${groupId})</span>
            <span style="font-size:0.9em; background:#333; padding:2px 8px; border-radius:4px;">${status}</span>
        </div>
        <div style="margin-top:8px; font-size:0.85em; color:#aaa; display:flex; gap:15px;">
            <span><i class="fas fa-clock"></i> Intervalo de Carpeta: <strong style="color: #00d4ff;">${Math.round(campaignInterval/60000)} min</strong></span>
            <span><i class="fas fa-history"></i> Próx. envío: <strong>${nextTime}</strong></span>
        </div>
      </div>`
    });
    html += `</div>`
    
    if (campaignGroups.length > 5) {
      html += `<button id="btnVerMasSeleccionados" class="btn-show-more" onclick="toggleViewedSelected()">Ver más (${campaignGroups.length - 5} grupos más)</button>`
    }
    
    html += `
    <div style="margin-top: 20px; padding: 20px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); text-align: center;">
        <form action="/manual-send" method="post" id="formManualSend" onsubmit="return confirmarEnvio()">
            <button type="submit" id="btnManualSend" class="btn btn-primary" style="width: 100%; font-weight: bold; margin-bottom: 15px; transition: all 0.3s;">
                <i class="fas fa-paper-plane" id="btnManualIcon"></i> <span id="btnManualText">ENVIAR TODAS MIS PUBLICACIONES AHORA</span>
            </button>
        </form>
        <script>
        function confirmarEnvio() {
            const btn = document.getElementById('btnManualSend');
            if (btn.disabled) return false;
            return confirm('¿Enviar todas las publicaciones ahora? (Recomendado cada 10 min)');
        }
        (function pollSpamStatus() {
            fetch('/spam-status').then(r => r.json()).then(data => {
                const btn = document.getElementById('btnManualSend');
                const icon = document.getElementById('btnManualIcon');
                const txt = document.getElementById('btnManualText');
                if (!btn) return;
                if (data.sending) {
                    btn.disabled = true;
                    btn.style.background = '#555';
                    btn.style.color = '#999';
                    btn.style.cursor = 'not-allowed';
                    icon.className = 'fas fa-spinner fa-spin';
                    txt.textContent = data.pending > 0 ? 'ENVIANDO... (' + data.pending + ' pendientes)' : 'ENVIANDO...';
                } else {
                    btn.disabled = false;
                    btn.style.background = 'var(--accent)';
                    btn.style.color = '#000';
                    btn.style.cursor = 'pointer';
                    icon.className = 'fas fa-paper-plane';
                    txt.textContent = 'ENVIAR TODAS MIS PUBLICACIONES AHORA';
                }
            }).catch(() => {});
            setTimeout(pollSpamStatus, 2000);
        })();
        </script>
        <p style="color: #888; font-size: 0.85em; line-height: 1.5; margin: 0;">
            <i class="fas fa-exclamation-triangle" style="color: #f1c40f;"></i> <strong>NO LO USES SEGUIDO:</strong><br>
            EL ENVÍO MANUAL DISPARA TODAS LAS PUBLICACIONES AL INSTANTE EN TODOS TUS GRUPOS, SIN ESPERAR EL TEMPORIZADOR.
            SI LO PRESIONAS MUCHAS VECES SEGUIDAS, WHATSAPP LO DETECTA COMO ENVÍO MASIVO Y PUEDE RESTRINGIR O BANEAR TU CUENTA.
            ÚSALO SOLO CUANDO REALMENTE NECESITES UN ENVÍO EXTRA Y DEJA AL MENOS 5 A 10 MINUTOS ENTRE CADA USO. EL SPAM AUTOMÁTICO YA TRABAJA SOLO, ESTE BOTÓN ES UN REFUERZO, NO PARA USARLO A CADA RATO.
        </p>
    </div>

    <script>
    function toggleViewedSelected() {
        const btn = document.getElementById('btnVerMasSeleccionados');
        const container = document.getElementById('selectedGroupsContainer');
        const hiddenItems = container.querySelectorAll('[data-hidden="true"]');
        
        
        
        const isCurrentlyHidden = hiddenItems[0].style.display === 'none' || hiddenItems[0].style.display === '';
        
        hiddenItems.forEach(item => {
            item.style.display = isCurrentlyHidden ? 'block' : 'none';
        });
        
        if (isCurrentlyHidden) {
            btn.innerText = 'Ver menos';
        } else {
            btn.innerText = 'Ver más (' + hiddenItems.length + ' grupos más)';
        }
    }
    </script>
    `
  }
  html += `</div>`

  
  const communities = db.data.communities || [];
  let communitiesHtml = '';
  if (communities.length > 0) {
    communitiesHtml = `
    <div class="section" style="border-left: 4px solid #a78bfa; background: rgba(167, 139, 250, 0.03);">
      <h2 style="color: #a78bfa;"><i class="fas fa-sitemap"></i> Comunidades (${communities.length})</h2>
      <p style="font-size: 0.85em; color: #888; margin-bottom: 15px;">Estas son las comunidades raíz detectadas. No se pueden seleccionar para spam directamente, solo sus subgrupos.</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
        ${communities.map(c => `
          <div style="background: #1a1a2e; border: 1px solid #3a3a5c; border-radius: 8px; padding: 10px 15px; display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-building" style="color: #a78bfa; font-size: 1.1em;"></i>
            <span style="color: #c4b5fd; font-size: 0.9em; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.name || 'Sin nombre'}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  html += communitiesHtml;

  html += `<div class="section" id="tour-groups"><h2><span class="section-step">3</span> Seleccionar Grupos para ${db.data.activeCampaign}</h2>
    <div style="margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <button type="button" id="btnToggleAll" onclick="toggleAllGroups()" class="btn-toggle-all">
            <i class="fas fa-check-double"></i> <span>Seleccionar Todo</span>
        </button>
        <div id="selectionStats" style="background: #2a2a2a; padding: 8px 15px; border-radius: 20px; border: 1px solid #444; font-size: 0.9em; color: #aaa;">
            <i class="fas fa-users-viewfinder"></i> Grupos: <strong id="selectedCount" style="color: #00d4ff;">0</strong> de <strong style="color: #ffffff;">${(gruposDB.data.groups || []).length}</strong> marcados
            · <i class="fas fa-star" style="color:#fbbf24"></i> <strong id="highlightedCount" style="color:#fbbf24;">${highlightedGroups.length}</strong> destacados
        </div>
    </div>
    <p style="font-size:0.8rem; color:var(--text-dim); margin:0 0 12px;">
        <i class="fas fa-star" style="color:#fbbf24"></i> Toca la estrella para que ese grupo salga primero en la lista.
    </p>
    <form action="/select-groups" method="post" id="selectGroupsForm">
      <div class="group-search-wrap">
        <i class="fas fa-search"></i>
        <input type="text" id="groupSearchInput" class="group-search-input" placeholder="Buscar grupo por nombre..." oninput="filterGroupSearch()" autocomplete="off">
      </div>
      <div class="scroll-grid">
      <div id="groupSearchEmpty" class="group-search-empty">No hay grupos con ese nombre.</div>
      <div class="checkbox-group" id="groupCheckboxList">`
  
  
  const filteredGroups = sortGroupsByHighlight(
    (gruposDB.data.groups || []).filter(g => {
      const name = (g.name || '').toLowerCase();
      const isCommunityName = name.includes('community') || name.includes('comunidad');
      return !isCommunityName || campaignGroups.includes(g.id);
    }),
    highlightedGroups
  );

  for (const group of filteredGroups) {
    const checked = campaignGroups.includes(group.id) ? 'checked' : ''
    const isHighlighted = isGroupHighlighted(group.id, highlightedGroups)
    const itemClass = isHighlighted ? 'checkbox-item is-highlighted' : 'checkbox-item'
    const btnClass = isHighlighted ? 'btn-highlight active' : 'btn-highlight'
    const searchKey = escapeAttr(toGroupSearchText(`${group.name} ${group.id}`))
    html += `<div class="${itemClass}" data-group-id="${escapeAttr(group.id)}" data-search-text="${searchKey}">
        <label><input type="checkbox" name="selectedGroups" value="${group.id}" ${checked} onchange="updateToggleButton()">
        <span class="group-name">${group.name}</span></label>
        <button type="button" class="${btnClass}" data-group-id="${escapeAttr(group.id)}" onclick="toggleGroupHighlight(this)" title="Destacar grupo">
            <i class="fas fa-star"></i>
        </button>
    </div>`
  }
  html += `</div></div><button type="submit" class="btn btn-primary" style="width:100%; margin-top:20px;">
        <i class="fas fa-save"></i> Guardar Grupos en Carpeta
    </button>
    </form>
    <script src="/group-search-js"></script>
    <script>
        function updateToggleButton() {
            const btn = document.getElementById('btnToggleAll');
            const counter = document.getElementById('selectedCount');
            if(!btn) return;
            const span = btn.querySelector('span');
            const checkboxes = getVisibleGroupCheckboxes();
            const allCheckboxes = document.querySelectorAll('#selectGroupsForm input[type="checkbox"]');
            const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
            const allChecked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
            
            if (counter) counter.innerText = checkedCount;

            if (allChecked) {
                btn.classList.add('is-all');
                span.innerText = 'Desmarcar Todo';
            } else {
                btn.classList.remove('is-all');
                span.innerText = 'Seleccionar Todo';
            }
        }

        function getVisibleGroupCheckboxes() {
            return Array.from(document.querySelectorAll('#selectGroupsForm input[type="checkbox"]')).filter(cb => {
                const item = cb.closest('.checkbox-item');
                return item && item.style.display !== 'none';
            });
        }

        function filterGroupSearch() {
            const rawQuery = (document.getElementById('groupSearchInput')?.value || '').trim();
            const query = (typeof GroupSearch !== 'undefined' && GroupSearch.toGroupSearchText)
                ? GroupSearch.toGroupSearchText(rawQuery)
                : rawQuery.toLowerCase();
            const items = document.querySelectorAll('#groupCheckboxList .checkbox-item');
            let visible = 0;
            items.forEach(item => {
                const haystack = item.getAttribute('data-search-text')
                    || (typeof GroupSearch !== 'undefined' && GroupSearch.toGroupSearchText
                        ? GroupSearch.toGroupSearchText(
                            (item.querySelector('.group-name')?.textContent || '') + ' ' + (item.getAttribute('data-group-id') || '')
                          )
                        : (item.querySelector('.group-name')?.textContent || '').toLowerCase());
                const match = !query || haystack.includes(query);
                item.style.display = match ? '' : 'none';
                if (match) visible++;
            });
            const empty = document.getElementById('groupSearchEmpty');
            if (empty) empty.style.display = query && visible === 0 ? 'block' : 'none';
            updateToggleButton();
        }

        function showToast(msg, type) {
            let wrap = document.getElementById('toastWrap');
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.id = 'toastWrap';
                document.body.appendChild(wrap);
            }
            const t = document.createElement('div');
            t.className = 'toast ' + (type === 'error' ? 'toast-error' : 'toast-ok');
            t.innerHTML = '<i class="fas ' + (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check') + '"></i><span>' + msg + '</span>';
            wrap.appendChild(t);
            requestAnimationFrame(() => t.classList.add('show'));
            setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 5000);
        }

        function toggleRedeemHistory() {
            const body = document.getElementById('redeemHistoryBody');
            const btn = document.getElementById('redeemHistoryToggle');
            if (!body || !btn) return;
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? '' : 'none';
            btn.setAttribute('aria-expanded', hidden ? 'true' : 'false');
            const txt = btn.querySelector('.redeem-toggle-txt');
            const ic = btn.querySelector('.redeem-toggle-ic i');
            if (txt) txt.textContent = hidden ? 'Ocultar' : 'Ver';
            if (ic) ic.className = hidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
        }

        async function redeemCodeNow(e) {
            e.preventDefault();
            const input = document.getElementById('redeemInput');
            const code = (input.value || '').trim();
            if (!code) { showToast('Escribe un código.', 'error'); return false; }
            const btn = e.target.querySelector('button[type=submit]');
            if (btn) btn.disabled = true;
            try {
                const res = await fetch('/redeem-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                });
                const data = await res.json();
                if (!data.ok) { showToast(data.error || 'No se pudo canjear', 'error'); return false; }
                showToast('\u{1F389} ¡Felicidades! Canjeaste un código de BOT SPAM ULTRA: +' + data.rewardLabel, 'ok');
                input.value = '';
                setTimeout(() => location.reload(), 1800);
            } catch (err) {
                showToast('Error de red al canjear', 'error');
            } finally {
                if (btn) btn.disabled = false;
            }
            return false;
        }

        function toggleAllGroups() {
            const checkboxes = getVisibleGroupCheckboxes();
            const allChecked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
            checkboxes.forEach(cb => {
                cb.checked = !allChecked;
            });
            updateToggleButton();
        }
        
        function reorderGroupList() {
            const grid = document.querySelector('#selectGroupsForm .checkbox-group');
            if (!grid) return;
            const items = Array.from(grid.querySelectorAll('.checkbox-item'));
            items.sort((a, b) => {
                const aH = a.classList.contains('is-highlighted') ? 0 : 1;
                const bH = b.classList.contains('is-highlighted') ? 0 : 1;
                if (aH !== bH) return aH - bH;
                const aName = a.querySelector('.group-name')?.textContent || '';
                const bName = b.querySelector('.group-name')?.textContent || '';
                return aName.localeCompare(bName);
            });
            items.forEach(el => grid.appendChild(el));
        }

        async function toggleGroupHighlight(btn) {
            const groupId = btn.getAttribute('data-group-id');
            if (!groupId) return;
            try {
                const res = await fetch('/toggle-group-highlight', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ groupId })
                });
                const data = await res.json();
                if (!data.ok) return;
                const item = btn.closest('.checkbox-item');
                if (item) item.classList.toggle('is-highlighted', data.highlighted);
                btn.classList.toggle('active', data.highlighted);
                const counter = document.getElementById('highlightedCount');
                if (counter) counter.textContent = data.count;
                reorderGroupList();
                filterGroupSearch();
            } catch (e) {
                console.error('No se pudo destacar el grupo', e);
            }
        }

        document.addEventListener('DOMContentLoaded', updateToggleButton);
        setTimeout(updateToggleButton, 500);
    </script>
    </div>`

  
  html += `<div class="section" id="tour-publications">
    <div class="section-header">
        <h2 id="tour-publications-title"><span class="section-step">4</span><i class="fas fa-cloud-upload-alt" style="color:var(--accent)"></i> Agregar Publicaciones (Hasta 5)</h2>
    </div>
    <form action="/add-pub" method="post" enctype="multipart/form-data" id="multiPubForm">
      <div id="pubSlotsContainer">
        <!-- Ranura 1 (Siempre visible) -->
        <div class="pub-slot" style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-weight: bold; color: var(--accent);">Ranura 1</span>
            </div>
            <div class="form-grid" style="grid-template-columns: 1fr; gap: 15px;">
                <div class="input-group">
                    <label>Texto de la publicación:</label>
                    <textarea name="text_0" placeholder="Escribe el mensaje aquí..." style="min-height:80px;"></textarea>
                </div>
                <div class="input-group">
                    <label>Archivo Multimedia (Imagen/Video):</label>
                    <input name="media_0" type="file">
                </div>
            </div>
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
          <button type="button" class="btn btn-secondary" onclick="addPubSlot()" id="addSlotBtn">
            <i class="fas fa-plus-circle"></i> NUEVA RANURA
          </button>
                    <button type="button" class="btn btn-primary" style="flex: 1;" onclick="window.enviarPublicacionMasiva({ preventDefault: function(){}, target: document.getElementById('multiPubForm') })">
                        <i class="fas fa-upload"></i> SUBIR TODAS LAS PUBLICACIONES
                    </button>
      </div>
    </form>

    <script>
        let slotCount = 1;
        function addPubSlot() {
            if (slotCount >= 5) {
                alert('Máximo 5 ranuras permitidas');
                return;
            }
            const container = document.getElementById('pubSlotsContainer');
            const slotHtml = '<div class="pub-slot" id="slot_' + slotCount + '" style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1); position: relative;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">' +
                    '<span style="font-weight: bold; color: var(--accent);">Ranura ' + (slotCount + 1) + '</span>' +
                    '<button type="button" onclick="removeSlot(' + slotCount + ')" style="background: none; border: none; color: var(--danger); cursor: pointer;">' +
                        '<i class="fas fa-times"></i> Quitar' +
                    '</button>' +
                '</div>' +
                '<div class="form-grid" style="grid-template-columns: 1fr; gap: 15px;">' +
                    '<div class="input-group">' +
                        '<label>Texto de la publicación:</label>' +
                        '<textarea name="text_' + slotCount + '" placeholder="Escribe el mensaje aquí..." style="min-height:80px;"></textarea>' +
                    '</div>' +
                    '<div class="input-group">' +
                        '<label>Archivo Multimedia (Imagen/Video):</label>' +
                        '<input name="media_' + slotCount + '" type="file">' +
                    '</div>' +
                '</div>' +
            '</div>';
            container.insertAdjacentHTML('beforeend', slotHtml);
            slotCount++;
            if (slotCount >= 5) document.getElementById('addSlotBtn').style.display = 'none';
        }

        function removeSlot(id) {
            const slot = document.getElementById('slot_' + id);
            if (slot) slot.remove();
            slotCount--;
            document.getElementById('addSlotBtn').style.display = 'block';
        }
    </script>
    </div>`

  
  // â”€â”€ Lógica de tiempos recomendados (grupos × publicaciones) â”€â”€
  const timerGroupCount = (currentCampaign.groups || []).length
  let timerPubCount = (currentCampaign.publications || []).length
  for (const gid of (currentCampaign.groups || [])) {
    const cfg = db.data.publicaciones?.[gid]
    if (cfg?.publications) {
      const perGroup = cfg.publications.filter(p => !p.campaign || p.campaign === db.data.activeCampaign).length
      if (perGroup > timerPubCount) timerPubCount = perGroup
    }
  }
  const timerAdvice = getSpamTimeAdvice(timerGroupCount, timerPubCount)
  const currentMinutes = Math.round((currentCampaign.interval || 600000) / 60000)
  const timerTableRows = SPAM_GROUP_BRACKETS.map(b =>
    `<tr><td>${b.groupsLabel} grupos</td><td>${b.min} - ${b.max} min</td></tr>`
  ).join('')

  html += `<div class="section">
    <div class="section-header">
        <h2 id="tour-timer"><span class="section-step">5</span><i class="fas fa-hourglass-half" style="color:var(--secondary)"></i> Temporizador de Reenvío</h2>
    </div>

    <div class="spam-time-guide">
        <div class="spam-time-guide-head">
            <i class="fas fa-shield-halved"></i>
            <span>Tiempos recomendados para evitar baneos</span>
        </div>
        <table class="spam-time-table">
            <thead><tr><th>Grupos</th><th>Tiempo de spam</th></tr></thead>
            <tbody>${timerTableRows}</tbody>
        </table>
        <p class="spam-time-note">
            <i class="fas fa-images"></i> Con <strong>3 publicaciones</strong> suma <strong>+5 min</strong>, con <strong>4</strong> suma <strong>+8 min</strong>, y <strong>+3 min</strong> por cada publicación extra.
        </p>
        <div class="spam-time-current">
            <span><i class="fas fa-folder-open"></i> Tu campaña: <strong>${timerGroupCount}</strong> grupos · <strong>${timerPubCount}</strong> publicaciones</span>
            <span class="spam-time-reco">Recomendado: <strong>${timerAdvice.minMinutes} - ${timerAdvice.maxMinutes} min</strong></span>
        </div>
        <p class="spam-time-disclaimer">
            <i class="fas fa-triangle-exclamation"></i> Esto no garantiza que tu cuenta esté protegida del ban al 100%. Como sabes, WhatsApp a veces toma bans por sorpresa, pero al menos esto funciona como una barrera para que WhatsApp no sospeche tanto.
        </p>
    </div>

    <form action="/set-time" method="post" class="form-grid" id="setTimeForm">
      <div class="input-group">
        <label>Intervalo de espera (minutos):</label>
        <input type="number" min="1" value="${currentMinutes}" name="minutes" id="setTimeMinutes" placeholder="Ej: 10">
      </div>
      <button type="submit" class="btn btn-secondary">
        <i class="fas fa-clock"></i> ACTUALIZAR TIEMPO
      </button>
    </form></div>

    <div id="spamTimeWarningModal" class="spam-warn-modal">
        <div class="spam-warn-box">
            <div class="spam-warn-icon"><i class="fas fa-triangle-exclamation"></i></div>
            <h3>Tiempo de spam peligroso</h3>
            <p class="spam-warn-text">
                Pusiste <strong id="warnChosen">0</strong> min, pero con
                <strong id="warnGroups">0</strong> grupos y <strong id="warnPubs">0</strong> publicaciones
                el tiempo seguro es de <strong id="warnReco">0 - 0</strong> min.
            </p>
            <p class="spam-warn-sub">Usar un tiempo más bajo aumenta mucho el riesgo de que WhatsApp banee tu número.</p>
            <div class="spam-warn-actions">
                <button type="button" class="btn spam-warn-safe" id="warnApplyReco">
                    <i class="fas fa-shield-halved"></i> Poner tiempo recomendado (<span id="warnRecoMin">0</span> min)
                </button>
                <button type="button" class="btn spam-warn-continue" id="warnContinue">
                    <i class="fas fa-circle-exclamation"></i> Continuar y asumo la responsabilidad
                </button>
            </div>
        </div>
    </div>

    <script src="/spam-time-advisor-js"></script>
    <script>
        (function() {
            var form = document.getElementById('setTimeForm');
            var input = document.getElementById('setTimeMinutes');
            var modal = document.getElementById('spamTimeWarningModal');
            if (!form || !input || !modal) return;
            var groupCount = ${timerGroupCount};
            var pubCount = ${timerPubCount};
            var forceSubmit = false;

            function showModal(ev) {
                var minutes = parseInt(input.value, 10);
                var advisor = (typeof SpamTimeAdvisor !== 'undefined') ? SpamTimeAdvisor : null;
                if (!advisor) return true;
                var result = advisor.evaluateSpamTime(minutes, groupCount, pubCount);
                if (forceSubmit || !result.dangerous) return true;
                ev.preventDefault();
                document.getElementById('warnChosen').textContent = isNaN(minutes) ? '0' : minutes;
                document.getElementById('warnGroups').textContent = groupCount;
                document.getElementById('warnPubs').textContent = pubCount;
                document.getElementById('warnReco').textContent = result.minMinutes + ' - ' + result.maxMinutes;
                document.getElementById('warnRecoMin').textContent = result.minMinutes;
                modal.dataset.reco = result.minMinutes;
                modal.classList.add('open');
                return false;
            }

            form.addEventListener('submit', showModal);

            document.getElementById('warnContinue').addEventListener('click', function() {
                forceSubmit = true;
                modal.classList.remove('open');
                form.submit();
            });
            document.getElementById('warnApplyReco').addEventListener('click', function() {
                input.value = modal.dataset.reco || input.value;
                forceSubmit = true;
                modal.classList.remove('open');
                form.submit();
            });
            modal.addEventListener('click', function(e) {
                if (e.target === modal) modal.classList.remove('open');
            });
        })();
    </script>`

  const schedStart = currentCampaign.scheduleStart || '07:00'
  const schedStop = currentCampaign.scheduleStop || '21:00'
  const schedStart12 = formatTime12h(schedStart)
  const schedStop12 = formatTime12h(schedStop)
  const schedChecked = currentCampaign.scheduleEnabled ? 'checked' : ''
  const isWeeklyMode = campaignSpamMode === 'weekly'
  const weeklyTotal = countWeeklySlots(currentCampaign)
  const schedStatusClass = isWeeklyMode
    ? (isCampaignManuallyOn(currentCampaign) && weeklyTotal > 0 ? 'on-window' : 'off-window')
    : (!scheduleStatus.enabled
      ? 'disabled'
      : (scheduleStatus.withinWindow ? 'on-window' : 'off-window'))
  const schedNextLine = !isWeeklyMode && scheduleStatus.enabled && scheduleStatus.nextTime
    ? `<br><span style="opacity:0.85;">Próximo ${scheduleStatus.nextAction === 'start' ? 'inicio' : 'pausa'}: <strong>${scheduleStatus.nextTime}</strong> (en ${formatScheduleCountdown(scheduleStatus.minutesUntil)})</span>`
    : (isWeeklyMode && scheduleStatus.nextTime
      ? `<br><span style="opacity:0.85;">Próximo envío: <strong>${scheduleStatus.nextTime}</strong></span>`
      : '')

  const weeklyDayOrder = [1, 2, 3, 4, 5, 6, 0]
  let weeklyDaysHtml = ''
  for (const d of weeklyDayOrder) {
    const times = currentCampaign.weeklySlots[String(d)] || []
    const chips = times.map(t => `
            <span class="weekly-chip">
              <span>${formatTime12h(t)}</span>
              <input type="hidden" name="weekly_${d}" value="${t}">
              <button type="button" class="weekly-chip-x" onclick="this.closest('.weekly-chip').remove()" title="Quitar">×</button>
            </span>`).join('')
    weeklyDaysHtml += `
        <div class="weekly-day">
          <div class="weekly-day-head">
            <strong>${WEEKDAY_LABELS[d]}</strong>
            <span class="weekly-day-count">${times.length} envío(s)</span>
          </div>
          <div class="weekly-chips" id="weeklyChips_${d}">${chips || '<span class="weekly-empty">Sin horas</span>'}</div>
          <div class="weekly-add-row">
            <input type="time" id="weeklyAdd_${d}" value="15:00">
            <button type="button" class="btn-weekly-add" onclick="addWeeklySlot(${d})"><i class="fas fa-plus"></i> Agregar hora</button>
          </div>
        </div>`
  }

  html += `<div class="section" id="form-schedule-section">
    <div class="section-header">
        <h2 id="form-schedule"><span class="section-step">6</span><i class="fas fa-calendar-day" style="color:var(--accent)"></i> Modo de envío <span class="optional-badge">Por carpeta</span></h2>
    </div>
    <p style="font-size:0.85em; color:var(--text-dim); margin-bottom:14px; line-height:1.5;">
        Elige <strong>una sola forma</strong> para esta carpeta. Los grupos y publicaciones no cambian; solo cambia cuándo se envía. Cada carpeta es independiente.
    </p>
    <form action="/save-spam-schedule" method="post" id="spamScheduleForm" class="schedule-card ${isWeeklyMode || currentCampaign.scheduleEnabled ? 'schedule-active' : ''}">
        <div class="spam-mode-picker">
            <label class="spam-mode-option ${!isWeeklyMode ? 'active' : ''}">
                <input type="radio" name="spamMode" value="auto" ${!isWeeklyMode ? 'checked' : ''} onchange="toggleSpamModeUI()">
                <span class="spam-mode-ico"><i class="fas fa-sync-alt"></i></span>
                <span>
                    <strong>Automático</strong>
                    <small>Intervalo + ventana horaria (inicio / pausa cada día)</small>
                </span>
            </label>
            <label class="spam-mode-option ${isWeeklyMode ? 'active' : ''}">
                <input type="radio" name="spamMode" value="weekly" ${isWeeklyMode ? 'checked' : ''} onchange="toggleSpamModeUI()">
                <span class="spam-mode-ico"><i class="fas fa-calendar-week"></i></span>
                <span>
                    <strong>SPAM PROGRAMADAS</strong>
                    <small>Horas exactas por día de la semana (ej. Lun 3pm y 10pm)</small>
                </span>
            </label>
        </div>

        <div id="spamModeAutoPanel" style="display:${isWeeklyMode ? 'none' : 'block'};">
            <div class="schedule-toggle-row">
                <div class="schedule-toggle-label">
                    <strong>Ventana diaria (solo modo automático)</strong>
                    <span>Si está off, usa solo Activar/Desactivar y el intervalo.</span>
                </div>
                <label class="toggle-switch" title="Activar o desactivar programación diaria">
                    <input type="checkbox" name="scheduleEnabled" value="1" ${schedChecked}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="schedule-time-grid">
                <div class="schedule-time-slot slot-start">
                    <label><i class="fas fa-sun"></i> Inicio · cada día</label>
                    <div class="schedule-time-field">
                        <input type="time" name="scheduleStart" value="${schedStart}">
                    </div>
                    <span class="time-hint"><i class="fas fa-clock"></i> ${schedStart12}</span>
                </div>
                <div class="schedule-time-slot slot-stop">
                    <label><i class="fas fa-moon"></i> Pausa · cada día</label>
                    <div class="schedule-time-field">
                        <input type="time" name="scheduleStop" value="${schedStop}">
                    </div>
                    <span class="time-hint"><i class="fas fa-clock"></i> ${schedStop12}</span>
                </div>
            </div>
        </div>

        <div id="spamModeWeeklyPanel" style="display:${isWeeklyMode ? 'block' : 'none'};">
            <p class="weekly-help">Configura por día cuántas veces y a qué hora(s). En cada hora se envían todas las publicaciones de esta carpeta a todos sus grupos, una sola vez. Luego espera a la siguiente hora o al otro día.</p>
            <div class="weekly-grid">${weeklyDaysHtml}</div>
        </div>

        <button type="submit" class="btn btn-schedule-save">
            <i class="fas fa-save"></i> GUARDAR MODO Y HORARIO
        </button>
        <div class="schedule-status-box ${schedStatusClass}">
            <i class="fas fa-${isWeeklyMode ? 'calendar-check' : (scheduleStatus.enabled ? (scheduleStatus.withinWindow ? 'play-circle' : 'pause-circle') : 'clock')}"></i>
            <strong>Estado:</strong> ${scheduleStatus.label}${schedNextLine}
            ${!isWeeklyMode && currentCampaign.scheduleEnabled ? `<br><span style="opacity:0.75;">Horario: ${schedStart12} → ${schedStop12} · todos los días</span>` : ''}
            ${isWeeklyMode ? `<br><span style="opacity:0.75;">${weeklyTotal} envío(s) configurados en la semana · carpeta independiente</span>` : ''}
        </div>
    </form>
    <script>
    function toggleSpamModeUI() {
      var weekly = document.querySelector('input[name="spamMode"][value="weekly"]');
      var isW = weekly && weekly.checked;
      var autoP = document.getElementById('spamModeAutoPanel');
      var weekP = document.getElementById('spamModeWeeklyPanel');
      if (autoP) autoP.style.display = isW ? 'none' : 'block';
      if (weekP) weekP.style.display = isW ? 'block' : 'none';
      document.querySelectorAll('.spam-mode-option').forEach(function(el) {
        el.classList.toggle('active', el.querySelector('input').checked);
      });
    }
    function addWeeklySlot(day) {
      var inp = document.getElementById('weeklyAdd_' + day);
      if (!inp || !inp.value) return;
      var v = inp.value;
      var box = document.getElementById('weeklyChips_' + day);
      if (!box) return;
      var exist = box.querySelectorAll('input[name="weekly_' + day + '"]');
      for (var i = 0; i < exist.length; i++) {
        if (exist[i].value === v) return;
      }
      var empty = box.querySelector('.weekly-empty');
      if (empty) empty.remove();
      var h = parseInt(v.slice(0, 2), 10);
      var m = v.slice(3);
      var ampm = h >= 12 ? 'PM' : 'AM';
      var h12 = h % 12; if (h12 === 0) h12 = 12;
      var label = h12 + ':' + m + ' ' + ampm;
      var span = document.createElement('span');
      span.className = 'weekly-chip';
      span.innerHTML = '<span>' + label + '</span>' +
        '<input type="hidden" name="weekly_' + day + '" value="' + v + '">' +
        '<button type="button" class="weekly-chip-x" onclick="this.parentElement.remove()" title="Quitar">&times;</button>';
      box.appendChild(span);
    }
    </script>
    </div>`

  
  html += `</div>
</body>
</html>`

  res.send(html);
});

app.get('/activity', async (req, res) => {
    const logs = global.spamLogs || [];
    const stats = db.data.spamStats || { success: 0, failure: 0, total: 0, lastActivity: null, uniqueGroups: [], uniqueGroupIds: [] };
    
    
    const groupCount = stats.uniqueGroupIds ? stats.uniqueGroupIds.length : (stats.uniqueGroups || []).length;
    const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 100;
    
    
    let lastActiveStr = 'Sin actividad';
    if (stats.lastActivity) {
        lastActiveStr = new Date(stats.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    
    const activeCampaignName = db.data.activeCampaign || 'Principal';
    const campaign = db.data.campaigns?.[activeCampaignName] || {};
    const intervalMin = Math.round((campaign.interval || 0) / 60000);

    const homeLink = isSubBot ? '/panel-master' : '/'
    const homeLabel = isSubBot ? 'Panel' : 'Inicio'

    let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Actividad - ${activeCampaignName}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <script>
        // Auto-recarga cada 5s SIN mostrar el spinner (marca la bandera antes de recargar).
        setTimeout(function(){
            try { sessionStorage.setItem('t3dSkipLoader', '1'); } catch (e) {}
            location.reload();
        }, 5000);
    </script>
    <style>
        :root {
            --bg-body: #0c0d0f;
            --bg-card: #14161a;
            --bg-input: #0f1114;
            --primary: #c4a574;
            --primary-dim: rgba(196, 165, 116, 0.16);
            --secondary: #d4b896;
            --accent: #6b7280;
            --danger: #d97a7a;
            --warning: #d4a574;
            --text-main: #e8eaed;
            --text-dim: #8b929e;
            --border: #2a2e36;
            --radius-lg: 10px;
            --radius-md: 8px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: var(--bg-body);
            color: var(--text-main);
            min-height: 100vh;
            padding: 20px 16px 40px;
            overflow-x: hidden;
            background-image:
                radial-gradient(circle at 15% 10%, rgba(13, 148, 136, 0.06), transparent 35%),
                radial-gradient(circle at 85% 90%, rgba(14, 165, 233, 0.05), transparent 30%);
        }
        .container { max-width: 1100px; margin: 0 auto; width: 100%; overflow-x: hidden; }
        .top-nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .top-nav-left { display: flex; gap: 10px; flex-wrap: wrap; }
        .nav-link-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            background: var(--bg-card);
            color: var(--text-dim);
            text-decoration: none;
            font-size: 0.875rem;
            font-weight: 500;
            transition: 0.2s;
        }
        .nav-link-btn:hover {
            border-color: rgba(13, 148, 136, 0.35);
            color: var(--primary);
        }
        .nav-btn-autoreply {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 10px 16px 10px 14px;
            border-radius: var(--radius-md);
            text-decoration: none;
            font-weight: 700;
            font-size: 0.875rem;
            color: #ecfdf5;
            background: linear-gradient(135deg, #14b8a6 0%, #0d9488 48%, #0f766e 100%);
            border: 1px solid rgba(94, 234, 212, 0.45);
            box-shadow: 0 4px 18px rgba(13, 148, 136, 0.38);
            transition: all 0.25s ease;
        }
        .nav-btn-autoreply:hover {
            transform: translateY(-2px);
            color: #fff;
            box-shadow: 0 8px 26px rgba(13, 148, 136, 0.5);
            filter: brightness(1.05);
        }
        .nav-btn-autoreply .nav-ar-badge {
            font-size: 0.62rem;
            font-weight: 800;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            padding: 3px 7px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.2);
            color: #ccfbf1;
            border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .page-header {
            text-align: center;
            padding: 28px 20px 24px;
            margin-bottom: 24px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
        }
        .page-header h1 {
            font-family: 'Space Grotesk', sans-serif;
            font-size: clamp(1.4rem, 4vw, 2rem);
            font-weight: 700;
            color: var(--text-main);
            margin-bottom: 8px;
        }
        .page-header p {
            color: var(--text-dim);
            font-size: 0.92rem;
        }
        .page-header .meta-badge {
            display: inline-block;
            margin-top: 12px;
            padding: 6px 14px;
            border-radius: 99px;
            background: var(--primary-dim);
            border: 1px solid rgba(13, 148, 136, 0.25);
            color: var(--primary);
            font-size: 0.8rem;
            font-weight: 600;
        }
        .stat-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 14px;
            margin-bottom: 24px;
        }
        .stat-pill {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            padding: 18px 16px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            text-align: center;
            min-width: 0;
        }
        .stat-pill .stat-icon { font-size: 1.3rem; margin-bottom: 2px; }
        .stat-pill .stat-val {
            font-family: 'Space Grotesk', sans-serif;
            font-size: clamp(1.4rem, 4vw, 1.9rem);
            font-weight: 700;
            line-height: 1.1;
            overflow-wrap: anywhere;
            word-break: break-word;
            max-width: 100%;
        }
        .stat-pill .stat-lbl {
            font-size: 0.65rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-dim);
            font-weight: 600;
        }
        .stat-pill.c-groups .stat-icon, .stat-pill.c-groups .stat-val { color: var(--secondary); }
        .stat-pill.c-success .stat-icon, .stat-pill.c-success .stat-val { color: var(--primary); }
        .stat-pill.c-fail .stat-icon, .stat-pill.c-fail .stat-val { color: #fca5a5; }
        .stat-pill.c-time .stat-icon, .stat-pill.c-time .stat-val { color: var(--warning); }
        .stat-pill.c-time .stat-val { font-size: clamp(1rem, 3vw, 1.35rem); }
        .progress-wrap {
            width: 100%;
            height: 4px;
            background: var(--bg-input);
            border-radius: 99px;
            margin-top: 8px;
            overflow: hidden;
        }
        .progress-bar { height: 100%; border-radius: 99px; transition: width 0.3s; }
        .log-section {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            padding: 20px;
            border: 1px solid var(--border);
            overflow: hidden;
        }
        .log-section h2 {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 1.05rem;
            margin-bottom: 16px;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .log-section h2 i { color: var(--primary); }
        .log-item {
            display: grid;
            grid-template-columns: 88px minmax(0, 1.2fr) minmax(0, 2fr);
            gap: 12px;
            align-items: start;
            padding: 14px 0;
            border-bottom: 1px solid var(--border);
        }
        .log-item:last-child { border-bottom: none; }
        .log-time {
            color: var(--text-dim);
            font-size: 0.82rem;
            white-space: nowrap;
        }
        .log-group {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            min-width: 0;
            font-weight: 600;
            color: var(--secondary);
            font-size: 0.85rem;
            overflow-wrap: anywhere;
            word-break: break-all;
        }
        .log-message {
            color: var(--text-main);
            font-size: 0.88rem;
            line-height: 1.45;
            overflow-wrap: anywhere;
            word-break: break-word;
            min-width: 0;
        }
        .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
            margin-top: 5px;
        }
        .type-success .dot { background: var(--primary); box-shadow: 0 0 8px rgba(13,148,136,0.5); }
        .type-error .dot { background: var(--danger); box-shadow: 0 0 8px rgba(239,68,68,0.5); }
        .type-info .dot { background: var(--secondary); }
        .empty-state {
            text-align: center;
            padding: 32px 16px;
            color: var(--text-dim);
            font-size: 0.92rem;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            background: var(--bg-input);
            color: var(--text-main);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 600;
            text-decoration: none;
            transition: 0.2s;
        }
        .btn:hover { border-color: rgba(255,255,255,0.18); }
        .btn-primary { background: #0f766e; color: #ecfdf5; border-color: rgba(45, 212, 191, 0.25); }
        .btn-danger-outline {
            background: rgba(239,68,68,0.1);
            color: #fca5a5;
            border-color: rgba(239,68,68,0.35);
        }
        @media (max-width: 768px) {
            .log-item {
                grid-template-columns: 1fr;
                gap: 6px;
                padding: 16px 0;
            }
            .log-time { font-size: 0.78rem; }
        }
    </style>
</head>
<body>
    ${renderLoaderBlock()}
    <div class="container">
        <div class="top-nav">
            <div class="top-nav-left">
                <a href="${homeLink}" class="nav-link-btn"><i class="fas fa-arrow-left"></i> ${homeLabel}</a>
                <a href="/pubs" class="nav-link-btn"><i class="fas fa-images"></i> Publicaciones</a>
                <a href="/auto-respuestas" class="nav-btn-autoreply">
                    <i class="fas fa-reply-all"></i>
                    Respuestas automáticas
                    <span class="nav-ar-badge">Privados</span>
                </a>
                <a href="/gestor-general" class="nav-link-btn" style="border-color:rgba(56,189,248,0.35); color:#7dd3fc;">
                    <i class="fas fa-briefcase"></i> Gestor
                </a>
                <a href="/bot-codigos" class="nav-link-btn" style="border-color:rgba(167,139,250,0.4); color:#c4b5fd;">
                    <i class="fas fa-key"></i> Bot Códigos
                </a>
                <a href="/links-grupos" class="nav-link-btn" style="border-color:rgba(37,211,102,0.35); color:#86efac;">
                    <i class="fas fa-link"></i> Links de grupos
                </a>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <form action="/reset-stats" method="POST" onsubmit="return confirm('¿Reiniciar estadísticas?')" style="margin:0;">
                    <button type="submit" class="btn btn-danger-outline"><i class="fas fa-undo"></i> Reset</button>
                </form>
                <a href="${homeLink}" class="btn btn-primary"><i class="fas fa-times"></i> Salir</a>
            </div>
        </div>

        <div class="page-header">
            <h1><i class="fas fa-chart-line" style="color:var(--primary); margin-right:8px;"></i> Rendimiento</h1>
            <p>Campaña: <strong style="color:var(--text-main);">${activeCampaignName}</strong> · Intervalo: <strong style="color:var(--text-main);">${intervalMin} min</strong></p>
            <span class="meta-badge"><i class="fas fa-sync-alt"></i> Actualiza cada 5 segundos</span>
        </div>

        <div class="stat-row">
            <div class="stat-pill c-groups">
                <i class="fas fa-users-viewfinder stat-icon"></i>
                <span class="stat-val">${groupCount}</span>
                <span class="stat-lbl">Grupos alcanzados</span>
            </div>
            <div class="stat-pill c-success">
                <i class="fas fa-check-double stat-icon"></i>
                <span class="stat-val">${stats.success}</span>
                <span class="stat-lbl">Envíos exitosos</span>
                <div class="progress-wrap"><div class="progress-bar" style="width:${successRate}%; background:var(--primary);"></div></div>
            </div>
            <div class="stat-pill c-fail">
                <i class="fas fa-exclamation-triangle stat-icon"></i>
                <span class="stat-val">${stats.failure}</span>
                <span class="stat-lbl">Errores / fallos</span>
                <div class="progress-wrap"><div class="progress-bar" style="width:${100 - successRate}%; background:var(--danger);"></div></div>
            </div>
            <div class="stat-pill c-time">
                <i class="fas fa-clock stat-icon"></i>
                <span class="stat-val">${lastActiveStr}</span>
                <span class="stat-lbl">Última actividad</span>
            </div>
        </div>

        <div class="log-section">
            <h2><i class="fas fa-stream"></i> Registro de actividades</h2>
            <div id="logs">
                ${logs.length === 0 ? '<div class="empty-state"><i class="fas fa-hourglass-half" style="font-size:1.5rem; opacity:0.4; display:block; margin-bottom:10px;"></i>Esperando primera actividad...</div>' : ''}
                ${logs.map(log => `
                    <div class="log-item type-${log.type}">
                        <span class="log-time">${log.time}</span>
                        <span class="log-group"><span class="dot"></span>${log.group}</span>
                        <span class="log-message">${log.message}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
</body>
</html>`;
    res.send(html);
});

app.post('/reset-stats', async (req, res) => {
    db.data.spamStats = { success: 0, failure: 0, total: 0, lastActivity: Date.now(), uniqueGroups: [] };
    await safeDbWrite(db);
    res.redirect('/activity');
});

const parseInterval = (timeStr) => {
  const num = parseFloat(timeStr)
  if (timeStr.endsWith('s')) return num * 1000
  if (timeStr.endsWith('m')) return num * 60000
  if (timeStr.endsWith('h')) return num * 3600000
  return num * 60000
}

function renderAutoRepliesPage(res, toast = '') {
  const brandingCfg = getText3dConfig()
  const cfg = ensureAutoReplyConfig(db)
  const homeLink = isSubBot ? '/panel-master' : '/panel-master'
  const html = renderAutoReplyPage({
    cfg,
    brand: brandingCfg.brand,
    version: brandingCfg.version,
    homeLink,
    loaderBlock: renderLoaderBlock(),
    toast,
  })
  res.send(html)
}

app.get('/auto-respuestas', async (req, res) => {
  try {
    renderAutoRepliesPage(res, req.query.ok ? 'Guardado correctamente.' : '')
  } catch (e) {
    res.status(500).send('Error: ' + e.message)
  }
})

// Compatibilidad: ruta antigua en inglés
app.get('/auto-replies', (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  res.redirect(301, '/auto-respuestas' + q)
})
app.use('/auto-replies', (req, res) => {
  res.redirect(307, '/auto-respuestas' + (req.url === '/' ? '' : req.url))
})

app.post('/auto-respuestas/settings', async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const wantEnabled = req.body.enabled === '1' || req.body.enabled === 'on'
    const riskAccepted = req.body.riskAccepted === '1' || req.body.riskAccepted === 'on' || cfg.riskAccepted
    const enabled = wantEnabled && (riskAccepted || cfg.enabled)
    const next = normalizeAutoReplyConfig({
      ...cfg,
      enabled,
      riskAccepted: enabled ? true : (wantEnabled ? !!riskAccepted : cfg.riskAccepted),
      minTypingSec: req.body.minTypingSec,
      maxTypingSec: req.body.maxTypingSec,
      minReadSec: req.body.minReadSec,
      maxReadSec: req.body.maxReadSec,
      folders: cfg.folders,
      rules: cfg.rules,
      blacklist: cfg.blacklist,
      stats: cfg.stats,
      hours: cfg.hours,
      antiSpam: cfg.antiSpam,
    })
    db.data.autoReply = next
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    res.status(500).send('Error guardando ajustes: ' + e.message)
  }
})

app.post('/auto-respuestas/hours', upload.single('media'), async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const hours = { ...(cfg.hours || {}) }
    hours.enabled = req.body.enabled === '1' || req.body.enabled === 'on'
    hours.start = req.body.start
    hours.stop = req.body.stop
    hours.text = String(req.body.text || '').trim()
    hours.limitMode = String(req.body.limitMode || 'free') === 'max' ? 'max' : 'free'
    hours.maxPerContact = req.body.maxPerContact

    if (req.body.clearMedia === '1') {
      if (hours.image) await deletePubImage(hours.image)
      hours.image = null
      hours.imageType = null
    }

    if (req.file?.buffer) {
      if (hours.image) await deletePubImage(hours.image)
      const isVideo = String(req.file.mimetype || '').startsWith('video')
      const ext = path.extname(req.file.originalname || '') || (isVideo ? '.mp4' : '.jpg')
      const filename = `${Date.now()}_hours_${Math.random().toString(36).slice(2, 8)}${ext}`
      const filepath = path.join(imagesPath, filename)
      await fs.mkdir(path.dirname(filepath), { recursive: true })
      await fs.writeFile(filepath, req.file.buffer)
      hours.image = filename
      hours.imageType = isVideo ? 'video' : 'image'
    }

    if (hours.enabled && !hours.text && !hours.image) {
      return res.send('<script>alert("Con horario activo, pon un texto o una imagen/video para fuera de horario."); history.back();</script>')
    }

    cfg.hours = hours
    db.data.autoReply = normalizeAutoReplyConfig(cfg)
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    console.error('[AUTO-REPLY] hours:', e)
    res.status(500).send('Error guardando horario: ' + e.message)
  }
})

app.post('/auto-respuestas/anti-spam', upload.single('media'), async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const antiSpam = { ...(cfg.antiSpam || {}) }
    antiSpam.enabled = req.body.enabled === '1' || req.body.enabled === 'on'
    antiSpam.maxMessages = req.body.maxMessages
    antiSpam.windowSec = req.body.windowSec
    antiSpam.text = String(req.body.text || '').trim()

    if (req.body.clearMedia === '1') {
      if (antiSpam.image) await deletePubImage(antiSpam.image)
      antiSpam.image = null
      antiSpam.imageType = null
    }

    if (req.file?.buffer) {
      if (antiSpam.image) await deletePubImage(antiSpam.image)
      const isVideo = String(req.file.mimetype || '').startsWith('video')
      const ext = path.extname(req.file.originalname || '') || (isVideo ? '.mp4' : '.jpg')
      const filename = `${Date.now()}_antispam_${Math.random().toString(36).slice(2, 8)}${ext}`
      const filepath = path.join(imagesPath, filename)
      await fs.mkdir(path.dirname(filepath), { recursive: true })
      await fs.writeFile(filepath, req.file.buffer)
      antiSpam.image = filename
      antiSpam.imageType = isVideo ? 'video' : 'image'
    }

    if (antiSpam.enabled && !antiSpam.text && !antiSpam.image) {
      return res.send('<script>alert("Con anti-spam activo, pon un mensaje de aviso (texto o media)."); history.back();</script>')
    }

    cfg.antiSpam = antiSpam
    db.data.autoReply = normalizeAutoReplyConfig(cfg)
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    console.error('[AUTO-REPLY] anti-spam:', e)
    res.status(500).send('Error guardando anti-spam: ' + e.message)
  }
})

app.post('/auto-respuestas/save-rule', upload.single('media'), async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const id = String(req.body.id || '').trim()
    const keywords = parseKeywords(req.body.keywords)
    if (!keywords.length) {
      return res.send('<script>alert("Pon al menos una palabra clave."); history.back();</script>')
    }
    const text = String(req.body.text || '').trim()
    let image = null
    let imageType = null

    const existing = id ? cfg.rules.find((r) => r.id === id) : null
    if (existing?.image) {
      image = existing.image
      imageType = existing.imageType || 'image'
    }

    if (req.body.clearMedia === '1') {
      if (image) await deletePubImage(image)
      image = null
      imageType = null
    }

    if (req.file?.buffer) {
      if (image) await deletePubImage(image)
      const isVideo = String(req.file.mimetype || '').startsWith('video')
      const ext = path.extname(req.file.originalname || '') || (isVideo ? '.mp4' : '.jpg')
      const filename = `${Date.now()}_autoreply_${Math.random().toString(36).slice(2, 8)}${ext}`
      const filepath = path.join(imagesPath, filename)
      await fs.mkdir(path.dirname(filepath), { recursive: true })
      await fs.writeFile(filepath, req.file.buffer)
      image = filename
      imageType = isVideo ? 'video' : 'image'
    }

    if (!text && !image) {
      return res.send('<script>alert("La respuesta necesita texto o una imagen/video."); history.back();</script>')
    }

    const limitMode = String(req.body.limitMode || 'free') === 'max' ? 'max' : 'free'
    const folderId = String(req.body.folderId || '').trim() || null
    const rule = {
      id: existing?.id || newRuleId(),
      enabled: req.body.enabled === '1' || req.body.enabled === 'on',
      name: String(req.body.name || 'Respuesta').trim().slice(0, 80) || 'Respuesta',
      keywords,
      text,
      image,
      imageType,
      limitMode,
      maxPerContact: req.body.maxPerContact,
      folderId,
      isFinal: req.body.isFinal === '1' || req.body.isFinal === 'on',
    }

    if (existing) {
      cfg.rules = cfg.rules.map((r) => (r.id === existing.id ? rule : r))
    } else {
      cfg.rules.push(rule)
    }
    db.data.autoReply = normalizeAutoReplyConfig(cfg)
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    console.error('[AUTO-REPLY] save-rule:', e)
    res.status(500).send('Error guardando respuesta: ' + e.message)
  }
})

app.post('/auto-respuestas/toggle-rule', async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const id = String(req.body.id || '')
    cfg.rules = cfg.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    db.data.autoReply = normalizeAutoReplyConfig(cfg)
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.post('/auto-respuestas/delete-rule', async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const id = String(req.body.id || '')
    const victim = cfg.rules.find((r) => r.id === id)
    if (victim?.image) await deletePubImage(victim.image)
    cfg.rules = cfg.rules.filter((r) => r.id !== id)
    db.data.autoReply = normalizeAutoReplyConfig(cfg)
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.post('/auto-respuestas/save-folder', async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const name = String(req.body.name || '').trim().slice(0, 60)
    if (!name) {
      return res.send('<script>alert("Pon un nombre de carpeta."); history.back();</script>')
    }
    const maxOrder = (cfg.folders || []).reduce((m, f) => Math.max(m, f.order || 0), 0)
    cfg.folders = [...(cfg.folders || []), { id: newFolderId(), name, order: maxOrder + 1 }]
    db.data.autoReply = normalizeAutoReplyConfig(cfg)
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    res.status(500).send('Error creando carpeta: ' + e.message)
  }
})

app.post('/auto-respuestas/rename-folder', async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const id = String(req.body.id || '')
    const name = String(req.body.name || '').trim().slice(0, 60)
    if (!id || !name) return res.redirect('/auto-respuestas')
    cfg.folders = (cfg.folders || []).map((f) => (f.id === id ? { ...f, name } : f))
    db.data.autoReply = normalizeAutoReplyConfig(cfg)
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.post('/auto-respuestas/delete-folder', async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const id = String(req.body.id || '')
    cfg.folders = (cfg.folders || []).filter((f) => f.id !== id)
    cfg.rules = (cfg.rules || []).map((r) => (r.folderId === id ? { ...r, folderId: null } : r))
    db.data.autoReply = normalizeAutoReplyConfig(cfg)
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.post('/auto-respuestas/add-blacklist', async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const name = String(req.body.name || '').trim().slice(0, 60)
    const number = normalizePhoneDigits(req.body.number)
    if (!name) {
      return res.send('<script>alert("Pon un nombre."); history.back();</script>')
    }
    if (number.length < 8) {
      return res.send('<script>alert("Número inválido. Usa el número completo con código de país."); history.back();</script>')
    }
    const exists = (cfg.blacklist || []).some((e) => e.number === number || e.number.endsWith(number) || number.endsWith(e.number))
    if (exists) {
      return res.send('<script>alert("Ese número ya está en la lista negra."); history.back();</script>')
    }
    cfg.blacklist = [...(cfg.blacklist || []), { id: newBlacklistId(), number, name }]
    db.data.autoReply = normalizeAutoReplyConfig(cfg)
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    res.status(500).send('Error agregando a lista negra: ' + e.message)
  }
})

app.post('/auto-respuestas/delete-blacklist', async (req, res) => {
  try {
    const cfg = ensureAutoReplyConfig(db)
    const id = String(req.body.id || '')
    cfg.blacklist = (cfg.blacklist || []).filter((e) => e.id !== id)
    db.data.autoReply = normalizeAutoReplyConfig(cfg)
    await safeDbWrite(db)
    res.redirect('/auto-respuestas?ok=1')
  } catch (e) {
    res.status(500).send(e.message)
  }
})

// ─── Gestor General (cuentas madre, perfiles, clientes, recordatorios) ───
function renderGestorPage(res, { toast = '', tab = 'resumen' } = {}) {
  const brandingCfg = getText3dConfig()
  const cfg = ensureAccountManager(db)
  const homeLink = '/panel-master'
  const allowed = new Set(['resumen', 'madres', 'clientes', 'alquileres', 'ajustes'])
  const safeTab = allowed.has(tab) ? tab : 'resumen'
  const html = renderAccountManagerPage({
    cfg,
    brand: brandingCfg.brand,
    version: brandingCfg.version,
    homeLink,
    loaderBlock: renderLoaderBlock(),
    toast,
    tab: safeTab,
  })
  res.send(html)
}

app.get('/gestor-general', async (req, res) => {
  try {
    const tab = String(req.query.tab || 'resumen')
    const toast = req.query.ok
      ? 'Guardado correctamente.'
      : (req.query.err ? String(req.query.err) : '')
    renderGestorPage(res, { toast, tab })
  } catch (e) {
    res.status(500).send('Error: ' + e.message)
  }
})

app.get('/account-manager', (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  res.redirect(301, '/gestor-general' + q)
})

app.post('/gestor-general/settings', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    cfg.enabled = req.body.enabled === '1' || req.body.enabled === 'true' || req.body.enabled === 'on'
    cfg.minTypingSec = parseInt(req.body.minTypingSec, 10)
    cfg.maxTypingSec = parseInt(req.body.maxTypingSec, 10)
    cfg.minReadSec = parseInt(req.body.minReadSec, 10)
    cfg.maxReadSec = parseInt(req.body.maxReadSec, 10)
    cfg.defaultRemindDays = parseInt(req.body.defaultRemindDays, 10)
    cfg.defaultRemindTime = String(req.body.defaultRemindTime || '10:00')
    cfg.defaultRemindMsg = String(req.body.defaultRemindMsg || '')
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=ajustes&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=ajustes&err=' + encodeURIComponent(e.message))
  }
})

app.post('/gestor-general/save-mother', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    const id = String(req.body.id || '').trim()
    if (id) {
      const mother = (cfg.mothers || []).find((m) => m.id === id)
      if (!mother) {
        return res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent('Cuenta no encontrada'))
      }
      mother.name = req.body.name
      mother.category = req.body.category
      mother.motherUser = req.body.motherUser
      mother.motherPass = req.body.motherPass
      mother.motherEmail = req.body.motherEmail
      mother.motherId = req.body.motherId
      mother.notes = req.body.notes
    } else {
      cfg.mothers.push({
        id: newId('mom'),
        name: req.body.name,
        category: req.body.category,
        motherUser: req.body.motherUser,
        motherPass: req.body.motherPass,
        motherEmail: req.body.motherEmail,
        motherId: req.body.motherId,
        notes: req.body.notes,
        profiles: [],
        createdAt: Date.now(),
      })
    }
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=madres&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent(e.message))
  }
})

app.post('/gestor-general/delete-mother', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    const id = String(req.body.id || '')
    cfg.mothers = (cfg.mothers || []).filter((m) => m.id !== id)
    cfg.rentals = (cfg.rentals || []).filter((r) => r.motherId !== id)
    syncProfileRentalStatus(cfg)
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=madres&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent(e.message))
  }
})

app.post('/gestor-general/save-profile', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    const motherId = String(req.body.motherId || '')
    const profileId = String(req.body.profileId || '').trim()
    const mother = (cfg.mothers || []).find((m) => m.id === motherId)
    if (!mother) {
      return res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent('Cuenta no encontrada'))
    }
    mother.profiles = mother.profiles || []
    if (profileId) {
      const profile = mother.profiles.find((p) => p.id === profileId)
      if (!profile) {
        return res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent('Perfil no encontrado'))
      }
      profile.name = req.body.name
      profile.user = req.body.user
      profile.pass = req.body.pass
      profile.pin = req.body.pin
      profile.email = req.body.email
      profile.extraId = req.body.extraId
      profile.notes = req.body.notes
    } else {
      mother.profiles.push({
        id: newId('prf'),
        name: req.body.name,
        user: req.body.user,
        pass: req.body.pass,
        pin: req.body.pin,
        email: req.body.email,
        extraId: req.body.extraId,
        notes: req.body.notes,
        status: 'available',
      })
    }
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=madres&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent(e.message))
  }
})

app.post('/gestor-general/delete-profile', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    const motherId = String(req.body.motherId || '')
    const profileId = String(req.body.profileId || '')
    const mother = (cfg.mothers || []).find((m) => m.id === motherId)
    if (mother) {
      mother.profiles = (mother.profiles || []).filter((p) => p.id !== profileId)
    }
    cfg.rentals = (cfg.rentals || []).filter((r) => r.profileId !== profileId)
    syncProfileRentalStatus(cfg)
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=madres&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent(e.message))
  }
})

app.post('/gestor-general/save-client', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    const whatsapp = sanitizePhone(req.body.whatsapp)
    if (whatsapp.length < 8) {
      return res.redirect('/gestor-general?tab=clientes&err=' + encodeURIComponent('WhatsApp inválido (con código de país)'))
    }
    const id = String(req.body.id || '').trim()
    if (id) {
      const client = (cfg.clients || []).find((c) => c.id === id)
      if (!client) {
        return res.redirect('/gestor-general?tab=clientes&err=' + encodeURIComponent('Cliente no encontrado'))
      }
      client.name = req.body.name
      client.whatsapp = whatsapp
      client.email = req.body.email
      client.notes = req.body.notes
    } else {
      cfg.clients.push({
        id: newId('cli'),
        name: req.body.name,
        whatsapp,
        email: req.body.email,
        notes: req.body.notes,
        createdAt: Date.now(),
      })
    }
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=clientes&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=clientes&err=' + encodeURIComponent(e.message))
  }
})

app.post('/gestor-general/delete-client', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    const id = String(req.body.id || '')
    cfg.clients = (cfg.clients || []).filter((c) => c.id !== id)
    cfg.rentals = (cfg.rentals || []).filter((r) => r.clientId !== id)
    syncProfileRentalStatus(cfg)
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=clientes&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=clientes&err=' + encodeURIComponent(e.message))
  }
})

app.post('/gestor-general/save-rental', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    const clientId = String(req.body.clientId || '')
    const mp = String(req.body.motherProfile || '')
    const [motherId, profileId] = mp.split('::')
    if (!clientId || !motherId || !profileId) {
      return res.redirect('/gestor-general?tab=alquileres&err=' + encodeURIComponent('Faltan cliente o perfil'))
    }
    const startAt = parseDateInput(req.body.startAt)
    const expiresAt = parseDateInput(req.body.expiresAt)
    if (!startAt || !expiresAt) {
      return res.redirect('/gestor-general?tab=alquileres&err=' + encodeURIComponent('Fechas inválidas'))
    }
    if (expiresAt < startAt) {
      return res.redirect('/gestor-general?tab=alquileres&err=' + encodeURIComponent('La fecha de vencimiento debe ser posterior al inicio'))
    }

    cfg.rentals.push({
      id: newId('rnt'),
      clientId,
      motherId,
      profileId,
      planLabel: req.body.planLabel,
      startAt,
      expiresAt,
      remindEnabled: req.body.remindEnabled !== '0',
      remindDaysBefore: parseInt(req.body.remindDaysBefore, 10),
      remindTime: req.body.remindTime || cfg.defaultRemindTime || '10:00',
      remindMessage: sanitizeText(req.body.remindMessage, 2000) || cfg.defaultRemindMsg,
      includeCredentials: req.body.includeCredentials === '1',
      lastRemindDay: '',
      lastExpireNotifyDay: '',
      status: expiresAt < Date.now() ? 'expired' : 'active',
      createdAt: Date.now(),
    })
    syncProfileRentalStatus(cfg)
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=alquileres&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=alquileres&err=' + encodeURIComponent(e.message))
  }
})

app.post('/gestor-general/delete-rental', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    const id = String(req.body.id || '')
    cfg.rentals = (cfg.rentals || []).filter((r) => r.id !== id)
    syncProfileRentalStatus(cfg)
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=alquileres&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=alquileres&err=' + encodeURIComponent(e.message))
  }
})

/** Vincular perfil libre → cliente (crea alquiler + recordatorio). */
app.post('/gestor-general/assign-profile', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    const motherId = String(req.body.motherId || '')
    const profileId = String(req.body.profileId || '')
    const clientId = String(req.body.clientId || '')
    if (!motherId || !profileId || !clientId) {
      return res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent('Elegí cliente y perfil'))
    }
    const mother = (cfg.mothers || []).find((m) => m.id === motherId)
    const profile = mother?.profiles?.find((p) => p.id === profileId)
    const client = (cfg.clients || []).find((c) => c.id === clientId)
    if (!mother || !profile || !client) {
      return res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent('Datos no encontrados'))
    }
    // perfil ya ocupado
    const busy = (cfg.rentals || []).some(
      (r) => r.profileId === profileId && r.status !== 'cancelled' && !(r.expiresAt && r.expiresAt < Date.now())
    )
    if (busy) {
      return res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent('Ese perfil ya está alquilado'))
    }
    const startAt = parseDateInput(req.body.startAt) || Date.now()
    const expiresAt = parseDateInput(req.body.expiresAt)
    if (!expiresAt) {
      return res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent('Indicá la fecha de vencimiento'))
    }
    if (expiresAt < startAt) {
      return res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent('El vencimiento debe ser después del inicio'))
    }
    cfg.rentals.push({
      id: newId('rnt'),
      clientId,
      motherId,
      profileId,
      planLabel: sanitizeText(req.body.planLabel, 80) || 'Alquiler',
      startAt,
      expiresAt,
      remindEnabled: true,
      remindDaysBefore: parseInt(req.body.remindDaysBefore, 10),
      remindTime: req.body.remindTime || cfg.defaultRemindTime || '10:00',
      remindMessage: cfg.defaultRemindMsg,
      includeCredentials: false,
      lastRemindDay: '',
      lastExpireNotifyDay: '',
      status: 'active',
      createdAt: Date.now(),
    })
    syncProfileRentalStatus(cfg)
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=madres&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent(e.message))
  }
})

/** Liberar perfil (cancela/elimina el alquiler activo). */
app.post('/gestor-general/unassign-profile', async (req, res) => {
  try {
    const cfg = ensureAccountManager(db)
    const rentalId = String(req.body.rentalId || '')
    cfg.rentals = (cfg.rentals || []).filter((r) => r.id !== rentalId)
    syncProfileRentalStatus(cfg)
    db.data.accountManager = normalizeAccountManager(cfg)
    await safeDbWrite(db)
    res.redirect('/gestor-general?tab=madres&ok=1')
  } catch (e) {
    res.redirect('/gestor-general?tab=madres&err=' + encodeURIComponent(e.message))
  }
})

// ─── Bot Códigos (Spacemail: buzón, alias+números, bandeja, API) ───
async function renderBotCodigosPage(res, {
  toast = '',
  tab = 'bandeja',
  sync = false,
  filterService = '',
} = {}) {
  const brandingCfg = getText3dConfig()
  const cfg = ensureBotCodes(db)
  const homeLink = '/panel-master'
  const allowed = new Set(['bandeja', 'alias', 'comandos', 'config', 'buzones'])
  const safeTab = ['config', 'buzones'].includes(tab) ? 'comandos' : (allowed.has(tab) ? tab : 'bandeja')

  let inbox = []
  let inboxErrors = []
  if (safeTab === 'bandeja' && sync) {
    const result = await fetchAllInboxes(cfg, { limit: 40, sinceDays: 14 })
    // Solo mails de alias de ESTE bot (no se mezclan entre sub-bots)
    inbox = filterMessagesForBotAliases(result.messages || [], cfg)
    inboxErrors = result.errors || []
  }

  const effectiveMb = getEffectiveMailbox(cfg)
  const html = renderBotCodesPage({
    cfg: { ...cfg, mailboxes: [effectiveMb], domain: getGlobalMailConfig().domain || cfg.domain },
    brand: brandingCfg.brand,
    version: brandingCfg.version,
    homeLink,
    loaderBlock: renderLoaderBlock(),
    toast,
    tab: safeTab,
    inbox,
    inboxErrors,
    filterService,
  })
  res.send(html)
}

app.get('/bot-codigos', async (req, res) => {
  try {
    const tab = String(req.query.tab || 'bandeja')
    const toast = req.query.ok
      ? (req.query.msg ? String(req.query.msg) : 'Guardado correctamente.')
      : (req.query.err ? String(req.query.err) : '')
    await renderBotCodigosPage(res, {
      toast,
      tab,
      sync: req.query.sync === '1' || req.query.sync === 'true',
      filterService: String(req.query.service || ''),
    })
  } catch (e) {
    res.status(500).send('Error: ' + e.message)
  }
})

app.post('/bot-codigos/settings', async (req, res) => {
  try {
    const cfg = ensureBotCodes(db)
    cfg.settings = cfg.settings || {}
    cfg.settings.defaultAccessDays = parseInt(req.body.defaultAccessDays, 10)
    cfg.settings.commandsEnabled = req.body.commandsEnabled === '1' || req.body.commandsEnabled === 'true'
    cfg.settings.enabled = true
    db.data.botCodes = normalizeBotCodes(cfg)
    await safeDbWrite(db)
    res.redirect('/bot-codigos?tab=comandos&ok=1')
  } catch (e) {
    res.redirect('/bot-codigos?tab=comandos&err=' + encodeURIComponent(e.message))
  }
})

app.post('/bot-codigos/settings-domain', async (req, res) => {
  // Dominio es global → solo maestro vía Config Email
  res.redirect('/bot-codigos?tab=comandos&err=' + encodeURIComponent('El dominio del correo es global: panel maestro → Configuración → Email'))
})

app.post('/bot-codigos/save-mailbox', async (req, res) => {
  res.redirect('/bot-codigos?tab=comandos&err=' + encodeURIComponent('El correo IMAP es global: panel maestro → Configuración → Email'))
})

app.post('/bot-codigos/test-mailbox', async (req, res) => {
  res.redirect('/bot-codigos?tab=comandos&err=' + encodeURIComponent('Probá el correo en panel maestro → Configuración → Email'))
})

app.post('/bot-codigos/save-alias', async (req, res) => {
  try {
    const cfg = ensureBotCodes(db)
    let local = sanitizeBotCodesText(req.body.localPart || '', 64).toLowerCase()
    local = local.replace(/@.*$/, '').replace(/[^a-z0-9._+-]/g, '')
    if (!local) {
      return res.redirect('/bot-codigos?tab=alias&err=' + encodeURIComponent('Alias inválido'))
    }
    const serviceRaw = String(req.body.service || 'other')
    const service = STREAMING_SERVICES.some((s) => s.id === serviceRaw) ? serviceRaw : 'other'
    if ((cfg.aliases || []).some((a) => a.localPart === local)) {
      return res.redirect('/bot-codigos?tab=alias&err=' + encodeURIComponent('Ese alias ya existe'))
    }
    cfg.aliases.push({
      id: newBotCodesId('als'),
      localPart: local,
      email: `${local}@${cfg.domain}`,
      mailboxId: 'streaming',
      service,
      notes: req.body.notes,
      spacemailOk: true,
      phones: [],
      createdAt: Date.now(),
    })
    db.data.botCodes = normalizeBotCodes(cfg)
    await safeDbWrite(db)
    res.redirect('/bot-codigos?tab=alias&ok=1')
  } catch (e) {
    res.redirect('/bot-codigos?tab=alias&err=' + encodeURIComponent(e.message))
  }
})

app.post('/bot-codigos/add-phone', async (req, res) => {
  try {
    const cfg = ensureBotCodes(db)
    const aliasId = String(req.body.aliasId || '')
    const alias = (cfg.aliases || []).find((a) => a.id === aliasId)
    if (!alias) {
      return res.redirect('/bot-codigos?tab=alias&err=' + encodeURIComponent('Alias no encontrado'))
    }
    const number = normalizePhoneDigits(req.body.number)
    if (number.length < 8 || number.length > 15) {
      return res.redirect('/bot-codigos?tab=alias&err=' + encodeURIComponent('Número inválido (con código de país)'))
    }
    const defaultDays = cfg.settings?.defaultAccessDays || 30
    const days = Math.max(1, Math.min(3650, parseInt(req.body.accessDays, 10) || defaultDays))
    const createdAt = Date.now()
    alias.phones = alias.phones || []
    alias.phones = alias.phones.filter((p) => p.number !== number)
    alias.phones.push({
      id: newBotCodesId('ph'),
      number,
      name: req.body.name,
      accessDays: days,
      createdAt,
      expiresAt: createdAt + days * 86400000,
    })
    db.data.botCodes = normalizeBotCodes(cfg)
    await safeDbWrite(db)
    res.redirect('/bot-codigos?tab=alias&ok=1')
  } catch (e) {
    res.redirect('/bot-codigos?tab=alias&err=' + encodeURIComponent(e.message))
  }
})

app.post('/bot-codigos/delete-phone', async (req, res) => {
  try {
    const cfg = ensureBotCodes(db)
    const aliasId = String(req.body.aliasId || '')
    const phoneId = String(req.body.phoneId || '')
    const alias = (cfg.aliases || []).find((a) => a.id === aliasId)
    if (!alias) {
      return res.redirect('/bot-codigos?tab=alias&err=' + encodeURIComponent('Alias no encontrado'))
    }
    alias.phones = (alias.phones || []).filter((p) => p.id !== phoneId)
    db.data.botCodes = normalizeBotCodes(cfg)
    await safeDbWrite(db)
    res.redirect('/bot-codigos?tab=alias&ok=1')
  } catch (e) {
    res.redirect('/bot-codigos?tab=alias&err=' + encodeURIComponent(e.message))
  }
})

app.post('/bot-codigos/delete-alias', async (req, res) => {
  try {
    const cfg = ensureBotCodes(db)
    const id = String(req.body.id || '')
    cfg.aliases = (cfg.aliases || []).filter((a) => a.id !== id)
    db.data.botCodes = normalizeBotCodes(cfg)
    await safeDbWrite(db)
    res.redirect('/bot-codigos?tab=alias&ok=1')
  } catch (e) {
    res.redirect('/bot-codigos?tab=alias&err=' + encodeURIComponent(e.message))
  }
})

/** API lookup OTP (panel auth / uso interno del plugin). */
async function handleBotCodesLookup(req, res) {
  try {
    const cfg = ensureBotCodes(db)
    const src = req.method === 'GET' ? req.query : req.body || {}
    const result = await lookupCodeForRequest(cfg, {
      phone: src.phone || src.number,
      email: src.email || src.correo,
      platform: src.platform || src.plataforma || src.service,
    })
    const status = result.silent ? 403 : result.ok ? 200 : 400
    res.status(status).json(result)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) })
  }
}

app.get('/api/bot-codigos/lookup', handleBotCodesLookup)
app.post('/api/bot-codigos/lookup', handleBotCodesLookup)

async function withTimeout(promise, ms = 8000, fallback = null) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function buildGroupMembershipMap(conn, links = []) {
  const map = {}
  for (const l of links) map[l.code] = { inGroup: false, pendingApproval: false }
  if (!isSubBot || !subBotNumber) return map

  const localState = readSubbotLinksState(subBotNumber)
  for (const l of links) {
    const st = localState.byCode?.[l.code]
    if (st?.pendingApproval) map[l.code].pendingApproval = true
  }

  if (!conn?.user || typeof conn.groupFetchAllParticipating !== 'function') return map

  let participating = {}
  try {
    const fetched = await withTimeout(conn.groupFetchAllParticipating(), 8000, null)
    if (!fetched || typeof fetched !== 'object') return map
    participating = fetched
  } catch {
    return map
  }

  const byJid = participating || {}
  for (const l of links) {
    const st = localState.byCode?.[l.code] || {}
    const jidHint = l.groupJid || st.joinedJid || null
    let inGroup = !!(jidHint && byJid[jidHint])
    if (!inGroup && l.subject) {
      for (const meta of Object.values(byJid)) {
        if (meta?.subject && String(meta.subject) === String(l.subject)) {
          inGroup = true
          break
        }
      }
    }
    map[l.code] = {
      inGroup,
      pendingApproval: inGroup ? false : !!st.pendingApproval,
    }
  }
  return map
}

async function renderGroupLinksRoute(res, toast = '') {
  const brandingCfg = getText3dConfig()
  const { links } = readGroupLinks(null)
  const ownLinks = isSubBot && subBotNumber ? readGroupLinks(subBotNumber).links : []
  const conn = global.conn
  const verifyInfo = canVerifyGroupLinks()
  const connReady = isSubBot
    ? !!(conn?.user && typeof conn.groupGetInviteInfo === 'function')
    : !!verifyInfo.ok
  const mode = isSubBot ? 'subbot' : 'master'
  const allForMembership = isSubBot ? [...links, ...ownLinks] : links
  const membership = isSubBot ? await buildGroupMembershipMap(conn, allForMembership) : {}
  const html = renderGroupLinksPage({
    mode,
    links,
    ownLinks,
    membership,
    brand: brandingCfg.brand,
    version: brandingCfg.version,
    homeLink: isSubBot ? '/panel-master' : '/',
    loaderBlock: renderLoaderBlock(),
    toast,
    connReady,
    verifyVia: verifyInfo.via,
    verifyViaNumber: verifyInfo.number || null,
    verifyCount: verifyInfo.count || 0,
    verifyNumbers: verifyInfo.numbers || [],
  })
  res.send(html)
}

function resolveLinksScope(req) {
  const scope = String(req.body?.scope || req.query?.scope || 'shared').toLowerCase()
  if (scope === 'own') {
    if (!isSubBot || !subBotNumber) {
      return { ok: false, error: 'Solo los sub-bots tienen links propios', owner: null, scope: 'shared' }
    }
    return { ok: true, owner: subBotNumber, scope: 'own' }
  }
  return { ok: true, owner: null, scope: 'shared' }
}

app.get('/links-grupos', async (req, res) => {
  try {
    await renderGroupLinksRoute(res, req.query.ok ? 'Listo.' : (req.query.msg ? String(req.query.msg) : ''))
  } catch (e) {
    res.status(500).send('Error: ' + e.message)
  }
})

app.get('/links-grupos/avatar/:code', (req, res) => {
  try {
    const scope = String(req.query.scope || 'shared')
    const owner = scope === 'own' && isSubBot && subBotNumber ? subBotNumber : null
    const file = avatarPathForCode(req.params.code, owner)
    if (!file || !existsSync(file)) return res.status(404).end()
    res.setHeader('Cache-Control', 'public, max-age=3600')
    if (file.endsWith('.png')) res.type('image/png')
    else if (file.endsWith('.webp')) res.type('image/webp')
    else res.type('image/jpeg')
    res.sendFile(path.resolve(file))
  } catch {
    res.status(404).end()
  }
})

app.post('/links-grupos/add', async (req, res) => {
  try {
    const scoped = resolveLinksScope(req)
    if (!scoped.ok) return res.status(403).send(scoped.error)
    // Maestro solo shared; sub-bot solo own
    if (isSubBot && scoped.scope !== 'own') {
      return res.status(403).send('Los sub-bots solo pueden agregar links propios.')
    }
    if (!isSubBot && scoped.scope === 'own') {
      return res.status(403).send('El maestro usa la lista compartida.')
    }
    const codes = parseLinksInput(req.body.links)
    if (!codes.length) {
      return res.send('<script>alert("No se detectó ningún link válido."); history.back();</script>')
    }
    const result = addGroupLinks(codes, scoped.owner)
    let msg = `Agregados: ${result.added.length}. Total: ${result.total}/${result.max}`
    if (scoped.owner) {
      // Verificar con el WA del propio sub-bot
      if (!global.conn?.user) {
        msg += ' · Conecta WhatsApp para verificar'
      } else {
        for (const row of result.added) {
          const probe = await probeInviteWithConn(global.conn, row.code, { owner: scoped.owner })
          updateGroupLink(row.id, {
            status: probe.status,
            error: probe.error,
            subject: probe.subject || '',
            size: probe.size || 0,
            joinApprovalMode: !!probe.joinApprovalMode,
            groupJid: probe.groupJid || null,
            hasAvatar: !!probe.hasAvatar,
            checkedAt: probe.checkedAt || Date.now(),
          }, scoped.owner)
          await new Promise((r) => setTimeout(r, 350))
        }
        msg += ' · Verificados con tu bot'
      }
    } else {
      const distributed = await refreshLinksDistributed(result.added)
      for (const item of distributed.results) {
        const probe = item.probe
        updateGroupLink(item.id, {
          status: probe.status,
          error: probe.error,
          subject: probe.subject || '',
          size: probe.size || 0,
          joinApprovalMode: !!probe.joinApprovalMode,
          groupJid: probe.groupJid || null,
          hasAvatar: !!probe.hasAvatar,
          checkedAt: probe.checkedAt || Date.now(),
        }, null)
      }
      if (distributed.viaLabel) msg += ` · ${distributed.viaLabel}`
    }
    res.redirect('/links-grupos?msg=' + encodeURIComponent(msg))
  } catch (e) {
    res.status(500).send('Error agregando links: ' + e.message)
  }
})

app.post('/links-grupos/delete', async (req, res) => {
  try {
    const scoped = resolveLinksScope(req)
    if (!scoped.ok) return res.status(403).send(scoped.error)
    if (isSubBot && scoped.scope !== 'own') {
      return res.status(403).send('No puedes eliminar links del administrador.')
    }
    if (!isSubBot && scoped.scope === 'own') {
      return res.status(403).send('Solo sub-bots gestionan links propios.')
    }
    removeGroupLink(String(req.body.id || ''), scoped.owner)
    res.redirect('/links-grupos?ok=1')
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.post('/links-grupos/toggle', async (req, res) => {
  try {
    const scoped = resolveLinksScope(req)
    if (!scoped.ok) return res.status(403).send(scoped.error)
    if (isSubBot && scoped.scope !== 'own') {
      return res.status(403).send('No puedes pausar links del administrador.')
    }
    setGroupLinkEnabled(String(req.body.id || ''), req.body.enabled === '1', scoped.owner)
    res.redirect('/links-grupos?ok=1')
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.post('/links-grupos/refresh', async (req, res) => {
  try {
    const scoped = resolveLinksScope(req)
    if (!scoped.ok) return res.status(403).send(scoped.error)
    if (scoped.owner) {
      if (!global.conn?.user) {
        return res.send('<script>alert("Conecta WhatsApp para verificar tus links."); history.back();</script>')
      }
      const result = await refreshAllGroupLinks(global.conn, { owner: scoped.owner })
      res.redirect('/links-grupos?msg=' + encodeURIComponent(`Verificados: ${result.updated} · tus links`))
      return
    }
    if (isSubBot) {
      // Sub-bot puede re-verificar lista compartida con su WA (no escribe? actually should update shared store)
      if (!global.conn?.user) {
        return res.send('<script>alert("Conecta WhatsApp primero."); history.back();</script>')
      }
      const result = await refreshAllGroupLinks(global.conn, {
        probeFn: (code) => probeInviteWithConn(global.conn, code, { owner: null }),
      })
      res.redirect('/links-grupos?msg=' + encodeURIComponent(`Verificados: ${result.updated}`))
      return
    }
    const verify = canVerifyGroupLinks()
    if (!verify.ok) {
      return res.send('<script>alert("No hay WhatsApp disponible. Vincula el maestro o ten un sub-bot online."); history.back();</script>')
    }
    const result = await refreshAllGroupLinks(global.conn)
    let msg = `Verificados: ${result.updated}`
    if (result.via) msg += ` · ${result.via}`
    res.redirect('/links-grupos?msg=' + encodeURIComponent(msg))
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.post('/links-grupos/refresh-one', async (req, res) => {
  try {
    const scoped = resolveLinksScope(req)
    if (!scoped.ok) return res.status(403).send(scoped.error)
    if (isSubBot && scoped.scope === 'shared') {
      // permitir verificar uno compartido con su WA
    } else if (isSubBot && scoped.scope !== 'own') {
      return res.status(403).send('Scope inválido')
    }
    const id = String(req.body.id || '')
    const { links } = readGroupLinks(scoped.owner)
    const row = links.find((l) => l.id === id)
    if (!row) return res.redirect('/links-grupos')
    const probe = scoped.owner
      ? await probeInviteWithConn(global.conn, row.code, { owner: scoped.owner })
      : (isSubBot
          ? await probeInviteWithConn(global.conn, row.code, { owner: null })
          : await probeInviteSmart(row.code))
    updateGroupLink(id, {
      status: probe.status,
      error: probe.error,
      subject: probe.subject || row.subject,
      size: probe.size || row.size,
      joinApprovalMode: !!probe.joinApprovalMode,
      groupJid: probe.groupJid || row.groupJid,
      hasAvatar: !!probe.hasAvatar || hasCachedAvatar(row.code, scoped.owner),
      checkedAt: probe.checkedAt || Date.now(),
    }, scoped.owner)
    let msg = 'Link verificado'
    if (probe.via === 'subbot' && probe.viaNumber) msg += ` (sub-bot ${probe.viaNumber})`
    else if (scoped.owner) msg += ' (tus links)'
    res.redirect('/links-grupos?msg=' + encodeURIComponent(msg))
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.post('/links-grupos/join', async (req, res) => {
  try {
    if (!isSubBot) return res.status(403).send('Solo sub-bots pueden unirse desde aquí.')
    const scoped = resolveLinksScope(req)
    if (!scoped.ok) return res.status(403).send(scoped.error)
    const id = String(req.body.id || '')
    const { links } = readGroupLinks(scoped.owner)
    const row = links.find((l) => l.id === id && l.enabled !== false)
    if (!row) return res.redirect('/links-grupos?msg=' + encodeURIComponent('Link no encontrado'))
    if (row.status === 'dead') {
      return res.redirect('/links-grupos?msg=' + encodeURIComponent('Ese link está muerto'))
    }
    const result = await joinInviteWithConn(global.conn, row.code)
    markSubbotJoinResult(subBotNumber, row.code, result)
    if (result.ok && result.jid) {
      updateGroupLink(row.id, { groupJid: result.jid, status: 'alive' }, scoped.owner)
    }
    let msg = 'Listo'
    if (!result.ok) msg = 'No se pudo unir: ' + (result.error || 'error')
    else if (result.already) msg = 'Ya estabas en el grupo'
    else if (result.pendingApproval) msg = 'Solicitud enviada (pide aprobación)'
    else msg = 'Te uniste a ' + (row.subject || 'el grupo')
    res.redirect('/links-grupos?msg=' + encodeURIComponent(msg))
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.post('/links-grupos/join-all', async (req, res) => {
  try {
    if (!isSubBot) return res.status(403).send('Solo sub-bots.')
    const scoped = resolveLinksScope(req)
    if (!scoped.ok) return res.status(403).send(scoped.error)
    const conn = global.conn
    if (!conn?.user) {
      return res.send('<script>alert("Conecta WhatsApp primero."); history.back();</script>')
    }
    const { links } = readGroupLinks(scoped.owner)
    const membership = await buildGroupMembershipMap(conn, links)
    let joined = 0
    let pending = 0
    let skipped = 0
    let failed = 0
    for (const row of links) {
      if (!row.enabled || row.status === 'dead') { skipped++; continue }
      if (membership[row.code]?.inGroup) { skipped++; continue }
      const result = await joinInviteWithConn(conn, row.code)
      markSubbotJoinResult(subBotNumber, row.code, result)
      if (result.ok && result.jid) {
        updateGroupLink(row.id, { groupJid: result.jid, status: 'alive' }, scoped.owner)
      }
      if (!result.ok) failed++
      else if (result.pendingApproval) pending++
      else if (result.already) skipped++
      else joined++
      await new Promise((r) => setTimeout(r, 1200))
    }
    const label = scoped.scope === 'own' ? 'mis links' : 'admin'
    const msg = `[${label}] Unidos: ${joined} · Pendientes: ${pending} · Omitidos: ${skipped} · Fallidos: ${failed}`
    res.redirect('/links-grupos?msg=' + encodeURIComponent(msg))
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.post('/links-grupos/refresh-membership', async (req, res) => {
  try {
    if (!isSubBot) return res.redirect('/links-grupos')
    res.redirect('/links-grupos?msg=' + encodeURIComponent('Estado actualizado'))
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.get('/pubs', async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const order = req.query.order || 'recientes'
  const limit = 20 
  const activeCampaignName = db.data.activeCampaign || "Principal"
  const campaign = db.data.campaigns[activeCampaignName] || { groups: [] }
  const campaignGroups = campaign.groups || []
const groupMap = new Map((gruposDB.data.groups || []).map(g => [g.id, g.name]))
  
  let allPubs = []

  for (const groupId of campaignGroups) {
    const cfg = db.data.publicaciones[groupId]
    if (cfg && cfg.publications) {
      cfg.publications.forEach((pub, index) => {
        if (pub.campaign === activeCampaignName) {
            let displayImage = pub.image;
            if (isSubBot && subBotNumber && pub.image) {
               const filename = path.basename(pub.image)
               displayImage = path.join(process.cwd(), 'usuarios', subBotNumber, 'images', filename)
            }
            allPubs.push({ 
                groupId, 
                index, 
                pub, 
                displayImage,
                groupName: groupMap.get(groupId) || 'Sin nombre',
                timestamp: pub.timestamp || 0 
            })
        }
      })
    }
  }

  
  if (order === 'grupos') {
    allPubs.sort((a, b) => {
        if (a.groupName.toLowerCase() < b.groupName.toLowerCase()) return -1;
        if (a.groupName.toLowerCase() > b.groupName.toLowerCase()) return 1;
        return b.timestamp - a.timestamp; 
    });
  } else {
    
    allPubs.sort((a, b) => b.timestamp - a.timestamp);
  }

  const total = allPubs.length
  const start = (page - 1) * limit
  const pubs = allPubs.slice(start, start + limit)
  const homeLink = isSubBot ? '/panel-master' : '/'
  const homeLabel = isSubBot ? 'Panel' : 'Inicio'
  let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Publicaciones - ${db.data.activeCampaign}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-body: #0c0d0f;
            --bg-card: #14161a;
            --bg-input: #0f1114;
            --primary: #c4a574;
            --primary-dim: rgba(196, 165, 116, 0.16);
            --secondary: #d4b896;
            --accent: #6b7280;
            --danger: #d97a7a;
            --text-main: #e8eaed;
            --text-dim: #8b929e;
            --border: #2a2e36;
            --radius-lg: 10px;
            --radius-md: 8px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: var(--bg-body);
            color: var(--text-main);
            min-height: 100vh;
            padding: 20px 16px 40px;
            overflow-x: hidden;
            background-image:
                radial-gradient(circle at 15% 10%, rgba(13, 148, 136, 0.06), transparent 35%),
                radial-gradient(circle at 85% 90%, rgba(14, 165, 233, 0.05), transparent 30%);
        }
        .container { max-width: 1100px; margin: 0 auto; width: 100%; overflow-x: hidden; }
        .page-header {
            text-align: center;
            padding: 28px 20px 24px;
            margin-bottom: 24px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
        }
        .page-header h1 {
            font-family: 'Space Grotesk', sans-serif;
            font-size: clamp(1.4rem, 4vw, 2rem);
            font-weight: 700;
            color: var(--text-main);
            margin-bottom: 8px;
        }
        .page-header p {
            color: var(--text-dim);
            font-size: 0.92rem;
        }
        .page-header .count-badge {
            display: inline-block;
            margin-top: 12px;
            padding: 6px 14px;
            border-radius: 99px;
            background: var(--primary-dim);
            border: 1px solid rgba(13, 148, 136, 0.25);
            color: var(--primary);
            font-size: 0.8rem;
            font-weight: 600;
        }
        .top-nav {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .nav-link-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            background: var(--bg-card);
            color: var(--text-dim);
            text-decoration: none;
            font-size: 0.875rem;
            font-weight: 500;
            transition: 0.2s;
        }
        .nav-link-btn:hover {
            border-color: rgba(13, 148, 136, 0.35);
            color: var(--primary);
        }
        .nav-btn-autoreply {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 10px 16px 10px 14px;
            border-radius: var(--radius-md);
            text-decoration: none;
            font-weight: 700;
            font-size: 0.875rem;
            color: #ecfdf5;
            background: linear-gradient(135deg, #14b8a6 0%, #0d9488 48%, #0f766e 100%);
            border: 1px solid rgba(94, 234, 212, 0.45);
            box-shadow: 0 4px 18px rgba(13, 148, 136, 0.38);
            transition: all 0.25s ease;
        }
        .nav-btn-autoreply:hover {
            transform: translateY(-2px);
            color: #fff;
            box-shadow: 0 8px 26px rgba(13, 148, 136, 0.5);
            filter: brightness(1.05);
        }
        .nav-btn-autoreply .nav-ar-badge {
            font-size: 0.62rem;
            font-weight: 800;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            padding: 3px 7px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.2);
            color: #ccfbf1;
            border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .action-bar-wrap {
            position: sticky;
            top: 12px;
            z-index: 100;
            margin-bottom: 20px;
        }
        .action-bar {
            background: var(--bg-card);
            backdrop-filter: blur(10px);
            padding: 16px;
            border-radius: var(--radius-lg) var(--radius-lg) 0 0;
            border: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }
        .action-bar-left {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            background: var(--bg-input);
            color: var(--text-main);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 600;
            text-decoration: none;
            transition: 0.2s;
        }
        .btn:hover { border-color: rgba(255,255,255,0.18); transform: translateY(-1px); }
        .btn-primary { background: #0f766e; color: #ecfdf5; border-color: rgba(45, 212, 191, 0.25); }
        .btn-primary:hover { background: #0d9488; box-shadow: 0 6px 16px rgba(15,118,110,0.25); }
        .btn-danger { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.35); }
        .btn-danger:hover { background: rgba(239,68,68,0.25); }
        .btn-ghost { background: transparent; color: var(--text-dim); }
        .btn-delete-selected {
            background: rgba(239,68,68,0.2);
            color: #fff;
            border-color: rgba(239,68,68,0.4);
        }
        .btn-delete-selected:disabled {
            opacity: 0.45;
            cursor: not-allowed;
            transform: none;
        }
        .order-tabs {
            display: inline-flex;
            background: var(--bg-input);
            border-radius: var(--radius-md);
            padding: 3px;
            border: 1px solid var(--border);
        }
        .btn-order {
            padding: 8px 14px;
            border-radius: 8px;
            text-decoration: none;
            color: var(--text-dim);
            font-size: 0.82rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: 0.2s;
        }
        .btn-order.active {
            background: #0f766e;
            color: #ecfdf5;
        }
        .btn-order:not(.active):hover { color: var(--text-main); }
        .pagination-bar {
            background: var(--bg-card);
            padding: 12px;
            border-radius: 0 0 var(--radius-lg) var(--radius-lg);
            border: 1px solid var(--border);
            border-top: none;
            display: flex;
            justify-content: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .page-link {
            padding: 6px 12px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.85rem;
            border: 1px solid var(--border);
            background: var(--bg-input);
            color: var(--text-dim);
            transition: 0.2s;
        }
        .page-link.active, .page-link:hover {
            background: #0f766e;
            color: #ecfdf5;
            border-color: rgba(45, 212, 191, 0.25);
        }
        .pub {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            padding: 20px;
            margin-bottom: 16px;
            border: 1px solid var(--border);
            transition: 0.2s;
            max-width: 100%;
            overflow: hidden;
        }
        .pub:hover { border-color: rgba(13, 148, 136, 0.2); }
        .pub-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 14px;
            border-bottom: 1px solid var(--border);
            gap: 12px;
        }
        .pub-header label {
            display: flex;
            align-items: flex-start;
            cursor: pointer;
            flex: 1;
            min-width: 0;
            gap: 12px;
        }
        .pub-group-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .pub-checkbox {
            width: 18px;
            height: 18px;
            accent-color: var(--primary);
            cursor: pointer;
            flex-shrink: 0;
        }
        .pub-group-name {
            font-weight: 600;
            color: var(--primary);
            font-size: 0.95rem;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .pub-group-id {
            font-size: 0.75rem;
            color: var(--text-dim);
            overflow-wrap: anywhere;
            word-break: break-all;
        }
        .trash-icon {
            flex-shrink: 0;
            background: rgba(239,68,68,0.1);
            border: 1px solid rgba(239,68,68,0.25);
            color: #fca5a5;
            cursor: pointer;
            font-size: 1rem;
            padding: 8px 12px;
            border-radius: var(--radius-md);
            transition: 0.2s;
        }
        .trash-icon:hover { background: rgba(239,68,68,0.2); }
        .pub-content-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            gap: 10px;
            flex-wrap: wrap;
        }
        .pub-content-label span {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        .edit-icon {
            background: var(--primary-dim);
            border: 1px solid rgba(13, 148, 136, 0.25);
            color: var(--primary);
            cursor: pointer;
            font-size: 0.82rem;
            font-weight: 600;
            padding: 8px 14px;
            border-radius: var(--radius-md);
            transition: 0.2s;
            font-family: inherit;
        }
        .edit-icon:hover { background: rgba(13, 148, 136, 0.2); }
        .pub-text-box {
            background: var(--bg-input);
            padding: 16px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            margin-bottom: 14px;
            max-width: 100%;
            overflow: hidden;
        }
        .pub-text-box div {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
            color: var(--text-main);
            font-size: 0.95rem;
            line-height: 1.55;
            max-width: 100%;
        }
        .pub-media {
            max-width: 100%;
            overflow: hidden;
        }
        .pub-media img, .pub-media video {
            max-width: 100%;
            width: min(320px, 100%);
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            margin-bottom: 14px;
        }
        .pub-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
        .btn-pub-active { background: rgba(13,148,136,0.15); color: var(--primary); border-color: rgba(13,148,136,0.3); }
        .btn-pub-paused { background: rgba(148,163,184,0.1); color: var(--text-dim); border-color: var(--border); }
        .empty-state {
            text-align: center;
            padding: 48px 24px;
            color: var(--text-dim);
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            border: 1px dashed var(--border);
        }
        .modal {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 1000;
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(6px);
            overflow-y: auto;
            padding: 16px;
        }
        .modal-content {
            background: var(--bg-card);
            margin: 40px auto;
            padding: 24px;
            border: 1px solid var(--border);
            width: 100%;
            max-width: 560px;
            border-radius: var(--radius-lg);
            max-height: calc(100dvh - 80px);
            overflow-y: auto;
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 14px;
            border-bottom: 1px solid var(--border);
        }
        .modal-header h2 {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 1.2rem;
            color: var(--primary);
        }
        .modal-close {
            background: none;
            border: none;
            color: var(--text-dim);
            font-size: 1.5rem;
            cursor: pointer;
            line-height: 1;
        }
        textarea {
            width: 100%;
            padding: 14px;
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            background: var(--bg-input);
            color: var(--text-main);
            font-family: inherit;
            font-size: 0.95rem;
            line-height: 1.5;
            resize: vertical;
            min-height: 160px;
        }
        textarea:focus { outline: none; border-color: rgba(13,148,136,0.4); }
        .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 16px;
        }
        @media (max-width: 768px) {
            .action-bar { flex-direction: column; align-items: stretch; }
            .action-bar-left { flex-direction: column; align-items: stretch; }
            .order-tabs { width: 100%; }
            .btn-order { flex: 1; justify-content: center; }
            .btn { justify-content: center; width: 100%; }
        }
    </style>
</head>
<body>
    ${renderLoaderBlock()}
    <div class="container">
        <div class="top-nav">
            <a href="${homeLink}" class="nav-link-btn"><i class="fas fa-arrow-left"></i> ${homeLabel}</a>
            <a href="/auto-respuestas" class="nav-btn-autoreply">
                <i class="fas fa-reply-all"></i>
                Respuestas automáticas
                <span class="nav-ar-badge">Privados</span>
            </a>
            <a href="/links-grupos" class="nav-link-btn" style="border-color:rgba(37,211,102,0.35); color:#86efac;">
                <i class="fas fa-link"></i> Links de grupos
            </a>
            <a href="/activity" class="nav-link-btn"><i class="fas fa-chart-line"></i> Actividad</a>
        </div>
        <div class="page-header">
            <h1><i class="fas fa-images" style="color:var(--primary); margin-right:8px;"></i> Publicaciones</h1>
            <p>Campaña: <strong style="color:var(--text-main);">${db.data.activeCampaign}</strong></p>
            <span class="count-badge">${total} publicación${total !== 1 ? 'es' : ''}</span>
        </div>
        <form id="deleteForm" action="/delete-multiple-pubs" method="post">
        <div class="action-bar-wrap">
            <div class="action-bar">
                <div class="action-bar-left">
                    <button type="button" class="btn btn-ghost" onclick="selectAll()"><i class="fas fa-check-square"></i> Seleccionar</button>
                    <button type="button" class="btn btn-danger" onclick="deleteAllPubs()"><i class="fas fa-trash-alt"></i> Borrar todo</button>
                    <div class="order-tabs">
                        <a href="/pubs?order=recientes" class="btn-order ${order === 'recientes' ? 'active' : ''}"><i class="fas fa-clock"></i> Recientes</a>
                        <a href="/pubs?order=grupos" class="btn-order ${order === 'grupos' ? 'active' : ''}"><i class="fas fa-layer-group"></i> Grupos</a>
                    </div>
                </div>
                <button type="submit" class="btn btn-delete-selected" id="deleteBtn" disabled>
                    <i class="fas fa-trash"></i> Eliminar (<span id="count">0</span>)
                </button>
            </div>
            <div class="pagination-bar">`
  
  const totalPages = Math.ceil(total / limit)
  for (let p = 1; p <= totalPages; p++) {
    html += `<a href="/pubs?page=${p}&order=${order}" class="page-link${p === page ? ' active' : ''}">${p}</a>`
  }

  html += `</div>
        </div>`

  if (pubs.length === 0) {
    html += `<div class="empty-state"><i class="fas fa-inbox" style="font-size:2rem; margin-bottom:12px; opacity:0.5;"></i><p>No hay publicaciones en esta campaña.</p></div>`
  }

  for (const item of pubs) {
    const groupName = groupMap.get(item.groupId) || 'Desconocido'
    const pubEnabled = item.pub.enabled !== false
    html += `<div class="pub">
      <div class="pub-header">
        <label>
            <input type="checkbox" form="deleteForm" name="pubKeys" value="${item.groupId}:${item.index}" class="pub-checkbox" onchange="updateCount()">
            <span class="pub-group-info">
                <span class="pub-group-name">${groupName}</span>
                <span class="pub-group-id">${item.groupId}</span>
            </span>
        </label>
        <button type="button" onclick="deleteSingle('${item.groupId}', ${item.index})" class="trash-icon" title="Eliminar">
            <i class="fas fa-trash-alt"></i>
        </button>
      </div>
      <div class="pub-content-label">
        <span>Contenido del mensaje</span>
        <button type="button" onclick="openEditModal('${item.groupId}', ${item.index}, ${pubEnabled ? 'true' : 'false'})" class="edit-icon">
            <i class="fas fa-edit"></i> Editar
        </button>
      </div>
      <div class="pub-text-box">
        <div id="text-${item.groupId}-${item.index}">${item.pub.text || ''}</div>
      </div>`
    if (item.displayImage) {
      const filename = path.basename(item.displayImage)
      html += `<div class="pub-media">`
      if (item.pub.imageType === 'video') {
        html += `<video controls><source src="/images/${filename}"></video>`
      } else {
        html += `<img src="/images/${filename}" alt="Publicación">`
      }
      html += `</div>`
    }
    html += `<div class="pub-actions">
    <form action="/toggle-pub" method="post">
      <input type="hidden" name="groupId" value="${item.groupId}">
      <input type="hidden" name="index" value="${item.index}">
      <button type="submit" class="btn ${pubEnabled ? 'btn-pub-active' : 'btn-pub-paused'}">${pubEnabled ? '<i class="fas fa-eye"></i> Publicando' : '<i class="fas fa-eye-slash"></i> Pausado'}</button>
    </form>
    </div>
    </div>`
  }
  
  html += `</form>
  <script>
    function updateCount() {
        const checked = document.querySelectorAll('.pub-checkbox:checked').length;
        document.getElementById('count').innerText = checked;
        document.getElementById('deleteBtn').disabled = checked === 0;
    }
    function selectAll() {
        const checkboxes = document.querySelectorAll('.pub-checkbox');
        const allChecked = Array.from(checkboxes).every(c => c.checked);
        checkboxes.forEach(c => c.checked = !allChecked);
        updateCount();
    }
    function deleteAllPubs() {
        if(confirm('¿ESTÁ SEGURO? Se borrarán TODAS las publicaciones de esta campaña (incluyendo imágenes). Esta acción no se puede deshacer.')) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/delete-all-pubs';
            document.body.appendChild(form);
            form.submit();
        }
    }
    function deleteSingle(groupId, index) {
        if(confirm('¿Eliminar esta publicación?')) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/delete-pub';
            const inputG = document.createElement('input');
            inputG.type = 'hidden';
            inputG.name = 'groupId'; inputG.value = groupId;
            const inputI = document.createElement('input');
            inputI.type = 'hidden';
            inputI.name = 'index'; inputI.value = index;
            form.appendChild(inputG); form.appendChild(inputI);
            document.body.appendChild(form);
            form.submit();
        }
    }
    document.getElementById('deleteForm').onsubmit = function() {
        return confirm('¿Eliminar las publicaciones seleccionadas?');
    }

    
    let editPubEnabled = true;
    let editIdenticalCount = 1;

    function refreshPauseUi() {
        const statusEl = document.getElementById('editPauseStatus');
        const oneBtn = document.getElementById('pauseOneBtn');
        const allBtn = document.getElementById('pauseAllBtn');
        if (!statusEl || !oneBtn || !allBtn) return;

        if (editPubEnabled) {
            statusEl.innerHTML = '<i class="fas fa-eye"></i> Publicando';
            statusEl.className = 'btn btn-pub-active';
            oneBtn.innerHTML = '<i class="fas fa-pause"></i> Pausar esta';
            allBtn.innerHTML = '<i class="fas fa-pause"></i> Pausar ' + editIdenticalCount + ' iguales';
        } else {
            statusEl.innerHTML = '<i class="fas fa-eye-slash"></i> Pausado';
            statusEl.className = 'btn btn-pub-paused';
            oneBtn.innerHTML = '<i class="fas fa-play"></i> Reanudar esta';
            allBtn.innerHTML = '<i class="fas fa-play"></i> Reanudar ' + editIdenticalCount + ' iguales';
        }
        allBtn.style.display = editIdenticalCount > 1 ? 'inline-flex' : 'none';
    }

    async function openEditModal(groupId, index, enabled) {
        const textElement = document.getElementById('text-' + groupId + '-' + index);
        const currentText = textElement ? textElement.innerText : '';
        document.getElementById('editGroupId').value = groupId;
        document.getElementById('editIndex').value = index;
        document.getElementById('editText').value = currentText;
        document.getElementById('editMedia').value = '';
        document.getElementById('editModal').style.display = 'block';

        editPubEnabled = enabled !== false && enabled !== 'false';
        editIdenticalCount = 1;
        refreshPauseUi();

        // Consulta cuántas publicaciones tienen el mismo texto.
        const box = document.getElementById('identicalBox');
        const delBtn = document.getElementById('deleteIdentBtn');
        box.style.display = 'none';
        if (delBtn) delBtn.innerHTML = '<i class="fas fa-trash-can"></i> Eliminar';
        try {
            const r = await fetch('/count-identical-pubs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId, index: parseInt(index) })
            });
            if (r.ok) {
                const data = await r.json();
                if (data.count > 1) {
                    editIdenticalCount = data.count;
                    document.getElementById('identicalCount').innerText = data.count;
                    document.getElementById('applyAllCheck').checked = true;
                    box.style.display = 'block';
                    if (delBtn) delBtn.innerHTML = '<i class="fas fa-trash-can"></i> Eliminar ' + data.count + ' iguales';
                    refreshPauseUi();
                }
            }
        } catch (e) { /* si falla, edición simple */ }
    }

    async function setPubPause(applyAll) {
        const groupId = document.getElementById('editGroupId').value;
        const index = document.getElementById('editIndex').value;
        const nextEnabled = !editPubEnabled;
        const n = applyAll ? editIdenticalCount : 1;
        const action = nextEnabled ? 'reanudar' : 'pausar';
        const msg = applyAll && n > 1
            ? ('¿' + (nextEnabled ? 'Reanudar' : 'Pausar') + ' las ' + n + ' publicaciones con el mismo texto?')
            : ('¿' + (nextEnabled ? 'Reanudar' : 'Pausar') + ' esta publicación?');
        if (!confirm(msg)) return;

        const oneBtn = document.getElementById('pauseOneBtn');
        const allBtn = document.getElementById('pauseAllBtn');
        if (oneBtn) oneBtn.disabled = true;
        if (allBtn) allBtn.disabled = true;

        try {
            const response = await fetch('/set-identical-pubs-enabled', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    groupId,
                    index: parseInt(index, 10),
                    enabled: nextEnabled,
                    applyAll: applyAll ? '1' : '0'
                })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                closeEditModal();
                alert((nextEnabled ? 'Reanudadas' : 'Pausadas') + ' ' + (data.updated || n) + ' publicación(es).');
                location.reload();
            } else {
                alert(data.error || ('Error al ' + action + '.'));
            }
        } catch (e) {
            console.error(e);
            alert('Error al conectar con el servidor.');
        } finally {
            if (oneBtn) oneBtn.disabled = false;
            if (allBtn) allBtn.disabled = false;
        }
    }

    function closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
    }

    async function saveEditedText() {
        const groupId = document.getElementById('editGroupId').value;
        const index = document.getElementById('editIndex').value;
        const text = document.getElementById('editText').value;
        const mediaInput = document.getElementById('editMedia');
        const box = document.getElementById('identicalBox');
        const applyAll = (box.style.display !== 'none') && document.getElementById('applyAllCheck').checked;
        const saveBtn = document.getElementById('saveEditBtn');

        saveBtn.disabled = true;
        saveBtn.innerText = 'Guardando...';

        try {
            const fd = new FormData();
            fd.append('groupId', groupId);
            fd.append('index', index);
            fd.append('text', text);
            fd.append('applyAll', applyAll ? '1' : '0');
            if (mediaInput.files && mediaInput.files[0]) {
                fd.append('media', mediaInput.files[0]);
            }

            const response = await fetch('/edit-pub-bulk', { method: 'POST', body: fd });

            if (response.ok) {
                const data = await response.json();
                closeEditModal();
                let msg = '¡Listo! Texto actualizado en ' + data.updatedText + ' publicación(es)';
                if (data.updatedImage > 0) msg += ' y la imagen en ' + data.updatedImage;
                msg += '.';
                alert(msg);
                location.reload();
            } else {
                alert('Error al guardar los cambios.');
            }
        } catch (e) {
            console.error('Error:', e);
            alert('Error al conectar con el servidor.');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerText = 'Guardar cambios';
        }
    }

    async function deleteIdenticalPubs() {
        const groupId = document.getElementById('editGroupId').value;
        const index = document.getElementById('editIndex').value;
        const box = document.getElementById('identicalBox');
        const applyAll = (box.style.display !== 'none') && document.getElementById('applyAllCheck').checked;
        const countEl = document.getElementById('identicalCount');
        const count = parseInt(countEl?.innerText || '1', 10) || 1;
        const n = applyAll ? count : 1;
        const msg = applyAll && n > 1
            ? ('¿Eliminar las ' + n + ' publicaciones con el mismo texto? Se borrarán también sus imágenes/videos. No se puede deshacer.')
            : '¿Eliminar esta publicación? No se puede deshacer.';
        if (!confirm(msg)) return;

        const btn = document.getElementById('deleteIdentBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...'; }

        try {
            const response = await fetch('/delete-identical-pubs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    groupId,
                    index: parseInt(index, 10),
                    applyAll: applyAll ? '1' : '0'
                })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                closeEditModal();
                alert('Eliminadas ' + (data.deleted || n) + ' publicación(es).');
                location.reload();
            } else {
                alert(data.error || 'Error al eliminar.');
            }
        } catch (e) {
            console.error(e);
            alert('Error al conectar con el servidor.');
        } finally {
            if (btn) {
                btn.disabled = false;
                const n = parseInt(document.getElementById('identicalCount')?.innerText || '1', 10) || 1;
                const boxOn = document.getElementById('identicalBox')?.style.display !== 'none';
                btn.innerHTML = boxOn && n > 1
                    ? ('<i class="fas fa-trash-can"></i> Eliminar ' + n + ' iguales')
                    : '<i class="fas fa-trash-can"></i> Eliminar';
            }
        }
    }

    
    window.onclick = function(event) {
        const modal = document.getElementById('editModal');
        if (event.target == modal) {
            closeEditModal();
        }
    }
  </script>
  
  <!-- Modal de Edición -->
  <div id="editModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><i class="fas fa-edit"></i> Editar publicación</h2>
            <button type="button" class="modal-close" onclick="closeEditModal()">&times;</button>
        </div>
        <input type="hidden" id="editGroupId">
        <input type="hidden" id="editIndex">

        <label style="display:block; font-size:0.82rem; color:var(--text-dim); margin-bottom:6px;">Texto de la publicación</label>
        <textarea id="editText" rows="8"></textarea>

        <!-- Aviso de publicaciones idénticas -->
        <div id="identicalBox" style="display:none; margin-top:14px; padding:12px 14px; border-radius:12px; background:rgba(13,148,136,0.08); border:1px solid rgba(13,148,136,0.25);">
            <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; margin:0;">
                <input type="checkbox" id="applyAllCheck" checked style="margin-top:3px; width:18px; height:18px; flex-shrink:0;">
                <span style="font-size:0.86rem; line-height:1.5; color:var(--text-main);">
                    <strong id="identicalCount" style="color:var(--primary);">0</strong> publicaciones tienen este <strong>mismo texto</strong> (misma pub en varios grupos).<br>
                    <span style="color:var(--text-dim);">Aplicar cambios o eliminación a <strong>todas</strong> ellas a la vez.</span>
                </span>
            </label>
        </div>

        <!-- Pausar / Reanudar (esta o todas las iguales) -->
        <div style="margin-top:14px; padding:12px 14px; border-radius:12px; background:rgba(255,255,255,0.03); border:1px solid var(--border);">
            <div style="font-size:0.78rem; color:var(--text-dim); margin-bottom:10px; text-transform:uppercase; letter-spacing:0.06em; font-weight:700;">Estado de envío</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                <span id="editPauseStatus" class="btn btn-pub-active" style="pointer-events:none; cursor:default;"><i class="fas fa-eye"></i> Publicando</span>
                <button type="button" class="btn btn-ghost" id="pauseOneBtn" onclick="setPubPause(false)"><i class="fas fa-pause"></i> Pausar esta</button>
                <button type="button" class="btn btn-secondary" id="pauseAllBtn" onclick="setPubPause(true)" style="display:none;"><i class="fas fa-pause"></i> Pausar iguales</button>
            </div>
            <p style="font-size:0.72rem; color:var(--text-dim); margin:10px 0 0;">Misma lógica que el botón Publicando/Pausado de cada tarjeta. Si hay iguales, puedes pausar solo esta o todas a la vez.</p>
        </div>

        <!-- Cambiar imagen/video (opcional) -->
        <div style="margin-top:14px;">
            <label style="display:block; font-size:0.82rem; color:var(--text-dim); margin-bottom:6px;"><i class="fas fa-image"></i> Cambiar imagen / video <span style="opacity:0.7;">(opcional)</span></label>
            <input type="file" id="editMedia" accept="image/*,video/*" style="width:100%; font-size:0.82rem; background:#111; padding:8px; border-radius:8px; border:1px solid #333; color:#aaa;">
            <p style="font-size:0.75rem; color:var(--text-dim); margin:6px 0 0;">Si subes un archivo, reemplazará la imagen en todas las publicaciones seleccionadas. Si lo dejas vacío, solo se cambia el texto.</p>
        </div>

        <div class="modal-footer" style="flex-wrap:wrap; gap:8px;">
            <button type="button" class="btn btn-ghost" onclick="closeEditModal()">Cancelar</button>
            <button type="button" class="btn btn-danger" id="deleteIdentBtn" onclick="deleteIdenticalPubs()" style="margin-right:auto;">
                <i class="fas fa-trash-can"></i> Eliminar
            </button>
            <button type="button" class="btn btn-primary" id="saveEditBtn" onclick="saveEditedText()">Guardar cambios</button>
        </div>
    </div>
  </div>`;
  html += '</div></body></html>';
  res.send(html);
});

app.post('/edit-pub-text', async (req, res) => {
  try {
    const { groupId, index, text } = req.body
    
    global.db.READ = true
    
    if (db.data.publicaciones[groupId] && db.data.publicaciones[groupId].publications) {
      const idx = parseInt(index)
      if (idx >= 0 && idx < db.data.publicaciones[groupId].publications.length) {
        db.data.publicaciones[groupId].publications[idx].text = text
        await safeDbWrite(db)
        global.db.READ = null
        return res.sendStatus(200)
      }
    }
    global.db.READ = null
    res.status(404).send('Publicación no encontrada')
  } catch (e) {
    global.db.READ = null
    res.status(500).send(e.message)
  }
})

// Normaliza texto para comparar publicaciones "iguales" (mismo contenido).
const normalizePubText = (t) => (t || '').trim()

// Busca todas las publicaciones de la campaña activa con el MISMO texto que la de referencia.
function findIdenticalPubs(referenceGroupId, referenceIndex) {
  const activeCampaign = db.data.activeCampaign || 'Principal'
  const refPub = db.data.publicaciones?.[referenceGroupId]?.publications?.[referenceIndex]
  if (!refPub) return { refText: null, matches: [] }
  const refText = normalizePubText(refPub.text)

  const campaign = db.data.campaigns?.[activeCampaign]
  const groups = campaign?.groups || Object.keys(db.data.publicaciones || {})
  const matches = []
  for (const gId of groups) {
    const pubs = db.data.publicaciones?.[gId]?.publications || []
    for (let i = 0; i < pubs.length; i++) {
      const pub = pubs[i]
      if (pub.campaign && pub.campaign !== activeCampaign) continue
      if (normalizePubText(pub.text) === refText) {
        matches.push({ groupId: gId, index: i })
      }
    }
  }
  return { refText, matches }
}

// Devuelve cuántas publicaciones comparten el mismo texto que la indicada.
app.post('/count-identical-pubs', async (req, res) => {
  try {
    const { groupId, index } = req.body
    const { refText, matches } = findIdenticalPubs(groupId, parseInt(index))
    if (refText === null) return res.status(404).json({ error: 'Publicación no encontrada' })
    res.json({ count: matches.length, matches })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Pausar / reanudar: esta publicación o TODAS las idénticas (mismo texto).
app.post('/set-identical-pubs-enabled', async (req, res) => {
  try {
    const groupId = req.body.groupId
    const index = parseInt(req.body.index, 10)
    const applyAll = req.body.applyAll === '1' || req.body.applyAll === true || req.body.applyAll === 'true'
    const enabled = req.body.enabled === true || req.body.enabled === 'true' || req.body.enabled === 1 || req.body.enabled === '1'

    if (!groupId || Number.isNaN(index)) {
      return res.status(400).json({ error: 'Datos inválidos' })
    }

    global.db.READ = true

    const refPub = db.data.publicaciones?.[groupId]?.publications?.[index]
    if (!refPub) {
      global.db.READ = null
      return res.status(404).json({ error: 'Publicación no encontrada' })
    }

    let targets
    if (applyAll) {
      targets = findIdenticalPubs(groupId, index).matches
    } else {
      targets = [{ groupId, index }]
    }

    let updated = 0
    for (const t of targets) {
      const pub = db.data.publicaciones?.[t.groupId]?.publications?.[t.index]
      if (!pub) continue
      pub.enabled = enabled
      updated++
    }

    await safeDbWrite(db)
    global.db.READ = null
    res.json({ success: true, updated, enabled })
  } catch (e) {
    global.db.READ = null
    console.error('Error in set-identical-pubs-enabled:', e)
    res.status(500).json({ error: e.message })
  }
})

// Eliminación masiva: borra la pub actual o TODAS las idénticas (mismo texto).
app.post('/delete-identical-pubs', async (req, res) => {
  try {
    const groupId = req.body.groupId
    const index = parseInt(req.body.index, 10)
    const applyAll = req.body.applyAll === '1' || req.body.applyAll === true || req.body.applyAll === 'true'

    if (!groupId || Number.isNaN(index)) {
      return res.status(400).json({ error: 'Datos inválidos' })
    }

    global.db.READ = true

    const refPub = db.data.publicaciones?.[groupId]?.publications?.[index]
    if (!refPub) {
      global.db.READ = null
      return res.status(404).json({ error: 'Publicación no encontrada' })
    }

    let targets
    if (applyAll) {
      targets = findIdenticalPubs(groupId, index).matches
    } else {
      targets = [{ groupId, index }]
    }

    // Agrupar por grupo y borrar de mayor índice a menor (evita desfase de índices).
    const byGroup = {}
    for (const t of targets) {
      if (!byGroup[t.groupId]) byGroup[t.groupId] = []
      byGroup[t.groupId].push(t.index)
    }

    let deleted = 0
    for (const gId of Object.keys(byGroup)) {
      const pubs = db.data.publicaciones?.[gId]?.publications
      if (!pubs) continue
      const indices = [...new Set(byGroup[gId])].sort((a, b) => b - a)
      for (const idx of indices) {
        const pub = pubs[idx]
        if (!pub) continue
        if (pub.image) await deletePubImage(pub.image)
        pubs.splice(idx, 1)
        deleted++
      }
      if (pubs.length === 0 && db.data.publicaciones[gId]) {
        db.data.publicaciones[gId].enabled = false
      }
    }

    await safeDbWrite(db)
    global.db.READ = null
    res.json({ success: true, deleted })
  } catch (e) {
    global.db.READ = null
    console.error('Error in delete-identical-pubs:', e)
    res.status(500).json({ error: e.message })
  }
})

// Edición masiva: aplica texto (y opcionalmente imagen) a TODAS las publicaciones idénticas.
app.post('/edit-pub-bulk', upload.single('media'), async (req, res) => {
  try {
    const groupId = req.body.groupId
    const index = parseInt(req.body.index)
    const newText = req.body.text || ''
    const applyAll = req.body.applyAll === '1' || req.body.applyAll === 'true'

    global.db.READ = true

    const refPub = db.data.publicaciones?.[groupId]?.publications?.[index]
    if (!refPub) {
      global.db.READ = null
      return res.status(404).json({ error: 'Publicación no encontrada' })
    }

    // Determina los objetivos: solo la actual, o todas las idénticas.
    let targets
    if (applyAll) {
      targets = findIdenticalPubs(groupId, index).matches
    } else {
      targets = [{ groupId, index }]
    }

    const mediaFile = req.file
    const isVideo = mediaFile ? mediaFile.mimetype.startsWith('video') : false
    const extension = mediaFile ? path.extname(mediaFile.originalname) : ''

    let updatedText = 0
    let updatedImage = 0

    for (const t of targets) {
      const pub = db.data.publicaciones?.[t.groupId]?.publications?.[t.index]
      if (!pub) continue

      pub.text = newText
      updatedText++

      if (mediaFile) {
        // Copia la nueva imagen/video con un archivo propio por grupo.
        if (pub.image) await deletePubImage(pub.image)
        const filename = `${Date.now()}_edit_${t.index}_${t.groupId.split('@')[0]}${extension}`
        const filepath = path.join(imagesPath, filename)
        await fs.mkdir(path.dirname(filepath), { recursive: true })
        await fs.writeFile(filepath, mediaFile.buffer)
        pub.image = filename
        pub.imageType = isVideo ? 'video' : 'image'
        updatedImage++
      }
    }

    await safeDbWrite(db)
    global.db.READ = null
    res.json({ success: true, updatedText, updatedImage })
  } catch (e) {
    global.db.READ = null
    console.error('Error in edit-pub-bulk:', e)
    res.status(500).json({ error: e.message })
  }
})

app.post('/delete-multiple-pubs', async (req, res) => {
  try {
    const { pubKeys } = req.body
    if (!pubKeys) return res.redirect('/pubs')
    
    const keys = Array.isArray(pubKeys) ? pubKeys : [pubKeys]
    
    
    global.db.READ = true
    
    const toDelete = {} 
    
    for (const key of keys) {
      const parts = key.split(':')
      if (parts.length < 2) continue
      const groupId = parts[0]
      const index = parseInt(parts[1])
      if (!toDelete[groupId]) toDelete[groupId] = []
      toDelete[groupId].push(index)
    }
    
    for (const groupId in toDelete) {
      if (db.data.publicaciones[groupId] && db.data.publicaciones[groupId].publications) {
        
        const indices = toDelete[groupId].sort((a, b) => b - a)
        for (const idx of indices) {
          const pub = db.data.publicaciones[groupId].publications[idx]
          if (pub) {
            if (pub.image) await deletePubImage(pub.image)
            db.data.publicaciones[groupId].publications.splice(idx, 1)
          }
        }
      }
    }
    
    await safeDbWrite(db);
    global.db.READ = null
    res.redirect('/pubs');
  } catch (e) {
    global.db.READ = null
    console.error('Error in delete-multiple-pubs:', e)
    res.send('Error eliminando publicaciones: ' + e.message);
  }
});

app.post('/delete-all-pubs', async (req, res) => {
  try {
    global.db.READ = true
    
    const activeCampaignName = db.data.activeCampaign || "Principal"
    const campaign = db.data.campaigns?.[activeCampaignName]
    if (!campaign) {
        global.db.READ = null
        return res.redirect('/pubs')
    }
    
    const campaignGroups = campaign.groups || []
    
    for (const groupId of campaignGroups) {
      if (db.data.publicaciones[groupId] && db.data.publicaciones[groupId].publications) {
        
        const remainingPubs = []
        for (const pub of db.data.publicaciones[groupId].publications) {
          if (pub.campaign === activeCampaignName) {
            if (pub.image) await deletePubImage(pub.image)
          } else {
            remainingPubs.push(pub)
          }
        }
        db.data.publicaciones[groupId].publications = remainingPubs
      }
    }
    
    
    if (campaign.publications) {
        campaign.publications = []
    }
    
    await safeDbWrite(db, { destructive: true });
    res.redirect('/pubs');
  } catch (e) {
    global.db.READ = null
    console.error('Error in delete-all-pubs:', e)
    res.send('Error eliminando todas las publicaciones: ' + e.message);
  }
});

app.post('/toggle-pub', async (req, res) => {
  try {
    const { groupId, index } = req.body
    global.db.READ = true
    if (db.data.publicaciones[groupId] && db.data.publicaciones[groupId].publications) {
      const idx = parseInt(index)
      if (idx >= 0 && idx < db.data.publicaciones[groupId].publications.length) {
        const pub = db.data.publicaciones[groupId].publications[idx]
        pub.enabled = !(pub.enabled !== false)
      }
    }
    await safeDbWrite(db);
    global.db.READ = null
    res.redirect('/pubs');
  } catch (e) {
    global.db.READ = null
    console.error('Error in toggle-pub:', e)
    res.redirect('/pubs');
  }
});

app.post('/delete-pub', async (req, res) => {
  try {
    const { groupId, index } = req.body
    global.db.READ = true
    if (db.data.publicaciones[groupId] && db.data.publicaciones[groupId].publications) {
      const idx = parseInt(index)
      if (idx >= 0 && idx < db.data.publicaciones[groupId].publications.length) {
        const pub = db.data.publicaciones[groupId].publications[idx]
        if (pub.image) await deletePubImage(pub.image)
        db.data.publicaciones[groupId].publications.splice(idx, 1)
      }
    }
    await safeDbWrite(db)
    global.db.READ = null
    res.redirect('/pubs')
  } catch (e) {
    global.db.READ = null
    console.error('Error in delete-pub:', e)
    res.redirect('/pubs')
  }
})

app.post('/create-campaign', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.redirect('/panel-master')
    global.db.READ = true
    if (!db.data.campaigns) db.data.campaigns = {}
    if (!db.data.campaigns[name]) {
      db.data.campaigns[name] = { groups: [], publications: [], interval: 600000, enabled: true, ...DEFAULT_CAMPAIGN_SCHEDULE }
      db.data.activeCampaign = name
      await safeDbWrite(db)
    }
    global.db.READ = null
    res.redirect('/panel-master')
  } catch (e) {
    global.db.READ = null
    console.error('Error in create-campaign:', e)
    res.redirect('/panel-master')
  }
})

app.post('/change-campaign', async (req, res) => {
  try {
    const { campaignName } = req.body
    if (!campaignName) return res.redirect('/panel-master')
    global.db.READ = true
    if (db.data.campaigns && db.data.campaigns[campaignName]) {
      db.data.activeCampaign = campaignName
      await safeDbWrite(db)
    }
    global.db.READ = null
    res.redirect('/panel-master')
  } catch (e) {
    global.db.READ = null
    console.error('Error in change-campaign:', e)
    res.redirect('/panel-master')
  }
})

app.post('/delete-campaign', async (req, res) => {
  try {
    global.db.READ = true
    const name = db.data.activeCampaign
    if (name === 'Principal') {
      global.db.READ = null
      return res.send('No se puede eliminar la carpeta Principal')
    }
    
    if (db.data.campaigns) {
      delete db.data.campaigns[name]
    }
    db.data.activeCampaign = 'Principal'
    await safeDbWrite(db)
    global.db.READ = null
    res.redirect('/panel-master')
  } catch (e) {
    global.db.READ = null
    console.error('Error in delete-campaign:', e)
    res.redirect('/panel-master')
  }
})

app.post('/toggle-group-highlight', async (req, res) => {
  try {
    const groupId = req.body?.groupId
    if (!groupId || typeof groupId !== 'string' || !groupId.endsWith('@g.us')) {
      return res.status(400).json({ ok: false, error: 'Grupo inválido' })
    }
    gruposDB.data.highlightedGroups = toggleHighlightInList(
      gruposDB.data.highlightedGroups || [],
      groupId
    )
    await safeGruposWrite(gruposDB)
    const highlighted = gruposDB.data.highlightedGroups.includes(groupId)
    res.json({
      ok: true,
      highlighted,
      count: gruposDB.data.highlightedGroups.length,
    })
  } catch (e) {
    console.error('Error al destacar grupo:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/select-groups', async (req, res) => {
  try {
    let { selectedGroups } = req.body
    
    
    if (selectedGroups && typeof selectedGroups === 'object' && !Array.isArray(selectedGroups)) {
       selectedGroups = Object.values(selectedGroups);
    }
    
    let groups = Array.isArray(selectedGroups) ? selectedGroups : selectedGroups ? [selectedGroups] : []
    
    // Limpieza de datos corruptos ([object Object] o valores no string)- NO QUITAR ESTO O NO PODRAS SELECCIONAR MAS DE 100 GRUPOS POR ESTE ERROR
    groups = groups.filter(id => typeof id === 'string' && id.endsWith('@g.us'));
    groups = sortGroupIdsByHighlight(groups, gruposDB.data.highlightedGroups || [])

    global.db.READ = true
    
    const active = db.data.activeCampaign || 'Principal'
    if (!db.data.campaigns) db.data.campaigns = {}
    if (!db.data.campaigns[active]) {
        db.data.campaigns[active] = { groups: [], publications: [], interval: 600000, enabled: true };
    }

    const previousGroups = db.data.campaigns[active].groups || []
    db.data.campaigns[active].groups = groups
    gruposDB.data.selectedGroups = groups

    const addedGroups = groups.filter(id => !previousGroups.includes(id))
    const syncResult = await syncPublicationsToNewGroups(db, active, addedGroups, {
      imagesPath,
      isSubBot,
      subBotNumber,
    })
    if (syncResult.syncedGroups > 0) {
      console.log(`\x1b[36m[SYNC]\x1b[0m ${syncResult.copiedPublications} publicación(es) copiada(s) a ${syncResult.syncedGroups} grupo(s) nuevo(s) en "${active}"`)
    }

    await safeDbWrite(db)
    await safeGruposWrite(gruposDB)
    global.db.READ = null
    console.log(`\x1b[32m[WEB PANEL]\x1b[0m Guardados ${groups.length} grupos en campaña "${active}"`)
    res.redirect('/panel-master')
  } catch (e) {
    global.db.READ = null
    console.error('Error al guardar grupos:', e);
    res.send('Error: ' + e.message)
  }
})

app.post('/refresh-groups', async (req, res) => {
  try {
    // Si la conexión no está lista o no tiene usuario, intentamos reasignar si main.js ya la abrió
    const connectionReady = global.conn && global.conn.user;

    if (connectionReady && typeof global.listGroups === 'function') {
      console.log(`\x1b[33m[WEB PANEL]\x1b[0m Actualizando grupos manualmente...`)
      
      const updatedGroups = await global.listGroups(global.conn)
      
    global.db.READ = true
      if (updatedGroups.length > 0) {
        gruposDB.data.groups = updatedGroups
        await safeGruposWrite(gruposDB)
        console.log(`\x1b[32m[WEB PANEL]\x1b[0m ${updatedGroups.length} grupos actualizados con éxito.`)
      }
      global.db.READ = null
    } else {
      console.log(`\x1b[31m[WEB PANEL]\x1b[0m No se puede actualizar grupos: Bot aún no autenticado o instancia no lista.`)
      
      if (global.conn && !global.conn.user) {
         return res.send('<script>alert("El bot está conectado pero WhatsApp aún está sincronizando los datos de usuario. Espera 10 segundos y vuelve a intentar."); window.location.href="/panel-master";</script>');
      }
    }
    res.redirect('/panel-master')
  } catch (e) {
    global.db.READ = null
    console.error('Error al refrescar grupos:', e)
    res.redirect('/panel-master')
  }
})

app.post('/add-pub', upload.any(), async (req, res) => {
  try {
    const bodies = req.body;
    const files = req.files || [];

    global.db.READ = true
    const active = db.data.activeCampaign || 'Principal'
    if (!db.data.campaigns) db.data.campaigns = {}
    if (!db.data.campaigns[active]) db.data.campaigns[active] = { groups: [], publications: [], interval: 600000, enabled: true }

    const campaign = db.data.campaigns[active]

    if (!campaign.groups || campaign.groups.length === 0) {
        global.db.READ = null
        return res.status(400).send('Selecciona grupos para esta carpeta antes de agregar publicaciones.')
    }

    const slots = []
    for (let i = 0; i < 5; i++) {
      const text = bodies[`text_${i}`]
      const mediaFile = files.find(f => f.fieldname === `media_${i}`)
      if (text || mediaFile) slots.push({ index: i, text: text || '', mediaFile })
    }

    if (slots.length === 0) {
      global.db.READ = null
      return res.status(400).send('Debes completar al menos una ranura con texto o multimedia.')
    }

    const totalItems = slots.length * campaign.groups.length
    let processedItems = 0

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    const sendProgress = (payload) => {
      res.write(`${JSON.stringify(payload)}\n`)
    }

    const groupNames = new Map((gruposDB.data.groups || []).map(g => [g.id, g.name]))

    for (const slot of slots) {
      const extension = slot.mediaFile ? path.extname(slot.mediaFile.originalname) : ''
      const isVideo = slot.mediaFile ? slot.mediaFile.mimetype.startsWith('video') : false
      const campaignPub = {
        text: slot.text,
        image: '',
        imageType: isVideo ? 'video' : 'image',
        enabled: true,
        timestamp: Date.now() + slot.index
      }

      let lastFilepath = ''
      for (let groupIndex = 0; groupIndex < campaign.groups.length; groupIndex++) {
        const groupId = campaign.groups[groupIndex]
        const groupName = groupNames.get(groupId) || groupId

        if (!db.data.publicaciones[groupId]) {
          db.data.publicaciones[groupId] = {
            publications: [],
            interval: campaign.interval || 600000,
            enabled: true
          }
        }

        let dbFilepath = ''
        if (slot.mediaFile) {
          const filename = `${Date.now()}_${slot.index}_${groupId.split('@')[0]}${extension}`
          const filepath = path.join(imagesPath, filename)
          dbFilepath = filename
          lastFilepath = dbFilepath
          await fs.mkdir(path.dirname(filepath), { recursive: true })
          await fs.writeFile(filepath, slot.mediaFile.buffer)
        }

        const groupPub = {
          ...campaignPub,
          image: dbFilepath,
          campaign: active
        }
        db.data.publicaciones[groupId].publications.push(groupPub)

        processedItems++
        const percent = Math.max(1, Math.min(100, Math.round((processedItems / totalItems) * 100)))
        sendProgress({
          type: 'progress',
          percent,
          processedItems,
          totalItems,
          groupId,
          groupName,
          slot: slot.index + 1,
          slotCount: slots.length
        })
      }
      campaign.publications.push({ ...campaignPub, image: lastFilepath, campaign: active })
    }

    await safeDbWrite(db)
    global.db.READ = null

    sendProgress({ type: 'done', success: true, message: '¡Guardado completado exitosamente!' })
    return res.end()
  } catch (e) {
    global.db.READ = null
    console.error('Error in add-pub:', e)
    if (!res.headersSent) res.status(500)
    res.write(JSON.stringify({ type: 'error', message: 'Error: ' + e.message }) + '\n')
    return res.end()
  }
})

app.post('/save-spam-schedule', async (req, res) => {
  try {
    global.db.READ = true
    const active = db.data.activeCampaign || 'Principal'
    db.data.campaigns ||= {}

    if (!db.data.campaigns[active]) {
      db.data.campaigns[active] = { groups: [], publications: [], interval: 600000, enabled: true, ...DEFAULT_CAMPAIGN_SCHEDULE }
    }

    const campaign = db.data.campaigns[active]
    const mode = req.body.spamMode === 'weekly' ? 'weekly' : 'auto'
    campaign.spamMode = mode

    if (mode === 'weekly') {
      campaign.scheduleEnabled = false
      campaign.weeklySlots = parseWeeklySlotsFromBody(req.body)
      normalizeScheduleFields(campaign)
      console.log(`\x1b[35m[WEB PANEL]\x1b[0m Spam PROGRAMADO (semanal) para "${active}": ${countWeeklySlots(campaign)} slot(s)/semana`)
    } else {
      campaign.scheduleEnabled = req.body.scheduleEnabled === '1'
      if (req.body.scheduleStart) campaign.scheduleStart = req.body.scheduleStart
      if (req.body.scheduleStop) campaign.scheduleStop = req.body.scheduleStop
      normalizeScheduleFields(campaign)
      if (campaign.scheduleEnabled) {
        syncCampaignSchedule(db, active)
        console.log(`\x1b[35m[WEB PANEL]\x1b[0m Programación diaria activada para "${active}": ${campaign.scheduleStart} → ${campaign.scheduleStop}`)
      } else {
        console.log(`\x1b[35m[WEB PANEL]\x1b[0m Modo automático sin ventana diaria para "${active}"`)
      }
    }

    await safeDbWrite(db)
    global.db.READ = null
    res.redirect('/panel-master#form-schedule')
  } catch (e) {
    global.db.READ = null
    console.error('Error in save-spam-schedule:', e)
    res.redirect('/panel-master')
  }
})

app.post('/set-time', async (req, res) => {
  try {
    const { minutes } = req.body
    const ms = parseInt(minutes || 1) * 60000
    
    global.db.READ = true
    
    db.data.campaigns ||= {}
    db.data.publicaciones ||= {}
    
    const active = db.data.activeCampaign || 'Principal'
    if (!db.data.campaigns[active]) db.data.campaigns[active] = { groups: [], interval: ms, enabled: true, ...DEFAULT_CAMPAIGN_SCHEDULE }
    
    db.data.campaigns[active].interval = ms
    
    console.log(`\x1b[36m[WEB PANEL]\x1b[0m Cambiando intervalo de campaña \x1b[33m${active}\x1b[0m a \x1b[32m${minutes} min\x1b[0m`)
    
    const targetGroups = db.data.campaigns[active].groups || []
    for (const groupId of targetGroups) {
        if (!db.data.publicaciones[groupId]) {
            db.data.publicaciones[groupId] = { publications: [], interval: ms, enabled: true }
        }
        db.data.publicaciones[groupId].interval = ms
    }
    
    await safeDbWrite(db)
    global.db.READ = null
    
    // RECARGA EL PLUGIN
    if (global.reloadHandler) {
        console.log(`\x1b[35m[SISTEMA]\x1b[0m Aplicando nuevo tiempo de ${minutes} min...`);
    }
    res.redirect('/panel-master')
  } catch (e) {
    global.db.READ = null
    console.error('Error in set-time:', e)
    res.redirect('/panel-master')
  }
})


app.get('/export-campaign-json', async (req, res) => {
    try {
        const active = db.data.activeCampaign || 'Principal'
        const exportData = await buildCampaignBackup(db, gruposDB, active, {
            isSubBot,
            subBotNumber,
        })

        const safeName = String(active).replace(/[^\w.-]+/g, '_')
        res.setHeader('Content-disposition', `attachment; filename=config_${safeName}.json`)
        res.setHeader('Content-type', 'application/json; charset=utf-8')
        res.write(JSON.stringify(exportData, null, 2))
        res.end()
        console.log(
            `\x1b[36m[RESPALDO]\x1b[0m Export completo "${active}": ${exportData.meta?.publicationsCount || 0} pub(s), ` +
            `${exportData.meta?.imagesEmbedded || 0} img pub, ` +
            `${exportData.meta?.autoReplyRules || 0} auto-resp, ` +
            `${exportData.meta?.accountClients || 0} cliente(s) gestor` +
            (exportData.meta?.videosAsTextOnly ? `, ${exportData.meta.videosAsTextOnly} video(s) solo texto` : '')
        )
    } catch (e) {
        console.error('Error export-campaign-json:', e)
        res.status(500).send('Error al exportar: ' + e.message)
    }
})


app.post('/import-campaign-json', upload.single('config_file'), async (req, res) => {
    try {
        if (!req.file) return res.send('<script>alert("No subiste ningún archivo"); window.location.href="/panel-master";</script>')
        
        const importedData = JSON.parse(req.file.buffer.toString('utf8'))
        const active = db.data.activeCampaign || 'Principal'

        // Destacados con la lógica existente del proyecto
        if (importedData.highlightedGroups && Array.isArray(importedData.highlightedGroups)) {
            gruposDB.data.highlightedGroups = mergeHighlightedGroups(
                gruposDB.data.highlightedGroups || [],
                importedData.highlightedGroups
            )
            await safeGruposWrite(gruposDB)
        }

        // No re-aplicar highlighted dentro de apply (ya mergeamos)
        const result = await applyCampaignBackup(db, gruposDB, active, importedData, {
            imagesPath,
            isSubBot,
            subBotNumber,
            mergeHighlighted: false,
        })

        // Ordenar grupos por destacados tras merge
        const highlighted = gruposDB.data.highlightedGroups || []
        if (db.data.campaigns[active]) {
            db.data.campaigns[active].groups = sortGroupIdsByHighlight(
                db.data.campaigns[active].groups || [],
                highlighted
            )
        }

        // Si el JSON es v1 (sin pubs), copiar pubs existentes a grupos nuevos
        let syncResult = { syncedGroups: 0, copiedPublications: 0 }
        if (!(Array.isArray(importedData.publications) && importedData.publications.length > 0)
            && result.addedGroups?.length) {
            syncResult = await syncPublicationsToNewGroups(db, active, result.addedGroups, {
                imagesPath,
                isSubBot,
                subBotNumber,
            })
            if (syncResult.syncedGroups > 0) {
                console.log(`\x1b[36m[SYNC]\x1b[0m ${syncResult.copiedPublications} publicación(es) copiada(s) a ${syncResult.syncedGroups} grupo(s) importado(s) en "${active}"`)
            }
        }

        await safeDbWrite(db)

        const pubsMsg = result.pubsResult?.imported
            ? ` · ${result.pubsResult.imported} publicación(es) restaurada(s)` +
              (result.pubsResult.imagesWritten ? ` (${result.pubsResult.imagesWritten} archivo(s) de imagen)` : '')
            : ''
        const arMsg = result.autoReplyResult?.ok
            ? ` · auto-respuestas (${result.autoReplyResult.rules || 0} regla(s)` +
              (result.autoReplyResult.imagesWritten ? `, ${result.autoReplyResult.imagesWritten} img` : '') +
              `)`
            : ''
        const amMsg = result.accountManagerResult?.ok
            ? ` · gestor (${result.accountManagerResult.mothers || 0} cuentas, ${result.accountManagerResult.clients || 0} clientes, ${result.accountManagerResult.rentals || 0} alquileres)`
            : ''
        const bcMsg = result.botCodesResult?.ok
            ? ` · bot códigos (${result.botCodesResult.aliases || 0} alias, ${result.botCodesResult.mailboxes || 0} buzones)`
            : ''
        const highlightMsg = importedData.highlightedGroups?.length
            ? ` · ${importedData.highlightedGroups.length} destacados restaurados`
            : ''
        const syncMsg = syncResult.syncedGroups > 0
            ? ` · ${syncResult.copiedPublications} publicación(es) copiada(s) a los grupos nuevos`
            : ''

        console.log(
            `\x1b[36m[RESPALDO]\x1b[0m Import completo "${active}": +${result.addedGroups?.length || 0} grupo(s)${pubsMsg}${arMsg}${amMsg}${bcMsg}`
        )

        res.send(`
            <script>
                alert('Respaldo completo importado en "${active}": ${importedData.groups.length} grupos${highlightMsg}${pubsMsg}${arMsg}${amMsg}${bcMsg}${syncMsg}.');
                window.location.href = '/panel-master';
            </script>
        `)
    } catch (e) {
        console.error('Error import-campaign-json:', e)
        const msg = String(e.message || e).replace(/'/g, "\\'").replace(/\n/g, ' ')
        res.send(`<script>alert("Error al importar: ${msg}"); window.location.href="/panel-master";</script>`)
    }
})

app.post('/import-selected-groups', async (req, res) => {
    try {
        
        const active = db.data.activeCampaign || 'Principal'
        const selectedGroups = gruposDB.data.selectedGroups || []
        
        if (selectedGroups.length === 0) {
            return res.send(`
                <script>
                    alert('No hay grupos marcados en la lista de grupos para importar.');
                    window.location.href = '/panel-master';
                </script>
            `)
        }

        if (!db.data.campaigns[active]) {
            db.data.campaigns[active] = { groups: [], publications: [], enabled: false, lastSent: 0, interval: 600000 }
        }

        
        const currentGroups = db.data.campaigns[active].groups || []
        const combined = Array.from(new Set([...currentGroups, ...selectedGroups]))
        const highlighted = gruposDB.data.highlightedGroups || []
        const addedGroups = selectedGroups.filter(id => !currentGroups.includes(id))

        db.data.campaigns[active].groups = sortGroupIdsByHighlight(combined, highlighted)

        const syncResult = await syncPublicationsToNewGroups(db, active, addedGroups, {
          imagesPath,
          isSubBot,
          subBotNumber,
        })
        if (syncResult.syncedGroups > 0) {
          console.log(`\x1b[36m[SYNC]\x1b[0m ${syncResult.copiedPublications} publicación(es) copiada(s) a ${syncResult.syncedGroups} grupo(s) nuevo(s) en "${active}"`)
        }

        await safeDbWrite(db)

        const syncMsg = syncResult.syncedGroups > 0
          ? ` · ${syncResult.copiedPublications} publicación(es) copiada(s) a los grupos nuevos`
          : ''

        res.send(`
            <script>
                alert('Se importaron ${selectedGroups.length} grupos marcados a la carpeta "${active}"${syncMsg}.');
                window.location.href = '/panel-master';
            </script>
        `)
    } catch (e) {
        console.error('Error importing groups:', e)
        res.status(500).send('Error: ' + e.message)
    }
})

app.post('/export-selected-groups', async (req, res) => {
    try {
        
        const active = db.data.activeCampaign || 'Principal'
        const campaignGroups = db.data.campaigns[active]?.groups || []
        
        if (campaignGroups.length === 0) {
            return res.send(`
                <script>
                    alert('Esta carpeta no tiene grupos para marcar.');
                    window.location.href = '/panel-master';
                </script>
            `)
        }

        const highlighted = gruposDB.data.highlightedGroups || []
        gruposDB.data.selectedGroups = sortGroupIdsByHighlight(campaignGroups, highlighted)
        await safeGruposWrite(gruposDB)

        res.send(`
            <script>
                alert('Los ${campaignGroups.length} grupos de la carpeta "${active}" han sido marcados en la lista general.');
                window.location.href = '/panel-master';
            </script>
        `)
    } catch (e) {
        console.error('Error exporting groups:', e)
        res.status(500).send('Error: ' + e.message)
    }
})


app.get('/spam-status', (req, res) => {
  const queue = global.sendQueue;
  const sending = queue ? (queue._running || queue.pending > 0) : false;
  const pending = queue ? queue.pending : 0;
  res.json({ sending, pending });
});

app.post('/manual-send', async (req, res) => {
  try {
    global.db.READ = true
    const active = db.data.activeCampaign || 'Principal'
    const campaign = db.data.campaigns?.[active]
    
    if (!campaign || !campaign.groups || campaign.groups.length === 0) {
        global.db.READ = null
        return res.send('Error: La campaña no tiene grupos seleccionados.')
    }
    
    
    if (global.manualSpamTrigger) {
        console.log(`\x1b[35m[WEB PANEL]\x1b[0m Disparo MANUAL de campaña: \x1b[33m${active}\x1b[0m`)
        global.manualSpamTrigger(active);
        global.db.READ = null
        res.redirect('/panel-master?sent=true')
    } else {
        global.db.READ = null
        res.send('Error: El sistema de envío no está inicializado. Intenta de nuevo en unos segundos.')
    }
  } catch (e) {
    global.db.READ = null
    console.error('Error in manual-send:', e)
    res.redirect('/panel-master')
  }
})

app.post('/activate', async (req, res) => {
  try {
    global.db.READ = true
    const active = db.data.activeCampaign || 'Principal'
    db.data.campaigns ||= {}
    if (!db.data.campaigns[active]) db.data.campaigns[active] = { groups: [], interval: 600000, enabled: true, ...DEFAULT_CAMPAIGN_SCHEDULE }

    normalizeScheduleFields(db.data.campaigns[active])
    if (db.data.campaigns[active].scheduleEnabled) {
      db.data.campaigns[active].scheduleEnabled = false
    }
    applyCampaignEnabledState(db, active, true)

    console.log(`\x1b[32m[WEB PANEL]\x1b[0m ACTIVANDO campaña: \x1b[33m${active}\x1b[0m`)
    await safeDbWrite(db)
    global.db.READ = null
    
    if (global.reloadHandler) {
        console.log(`\x1b[32m[SISTEMA]\x1b[0m Campaña "${active}" activada.`);
    }
    res.redirect('/panel-master')
  } catch (e) {
    global.db.READ = null
    console.error('Error in activate:', e)
    res.redirect('/panel-master')
  }
})

app.post('/deactivate', async (req, res) => {
  try {
    global.db.READ = true
    const active = db.data.activeCampaign || 'Principal'
    db.data.campaigns ||= {}
    if (db.data.campaigns[active]) {
        normalizeScheduleFields(db.data.campaigns[active])
        if (db.data.campaigns[active].scheduleEnabled) {
          db.data.campaigns[active].scheduleEnabled = false
        }
        applyCampaignEnabledState(db, active, false)
    }
    await safeDbWrite(db)
    global.db.READ = null
    if (global.reloadHandler) console.log('Campaña desactivada');
    res.redirect('/panel-master')
  } catch (e) {
    global.db.READ = null
    res.redirect('/panel-master')
  }
})

  })();