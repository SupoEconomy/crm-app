/*
NO TOCAR NADA POR FAVOR O EL CODIGO SE ROMPERA POR COMPLETO, ESTO MANEJA EVENTOS DE LOS SUBS BOTS
Y BOT PRINCIPAL POR ESO NO TOQUEN NADA.
*/

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'

import './config.js'
import { createRequire } from 'module'
import path, { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform } from 'process'
import * as ws from 'ws'
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, writeFileSync, watch, mkdirSync } from 'fs'
import fs from 'fs/promises'
import yargs from 'yargs'
import chalk from 'chalk'
import syntaxerror from 'syntax-error'
import { format } from 'util'
import pino from 'pino'
import { Boom } from '@hapi/boom'
import { makeWASocket, protoType, serialize } from './lib/simple.js'
import { Low } from 'lowdb'
import { AtomicJSONFile } from './lib/atomic-json-file.js'
import { mergeDbDefaults } from './lib/db-guard.js'
import { safeDbWrite, safeGruposWrite } from './lib/db-sync.js'
import { isRentalBlocked, readRentalFromLink, mergeSubbotRentalFromLink } from './lib/rental.js'
import { probeInviteWithConn } from './lib/group-links.js'
import lodash from 'lodash' 
import readline from 'readline'
import qrcode from 'qrcode-terminal'
import multer from 'multer'
import { fork } from 'child_process'
import { EventEmitter } from 'events'
import NodeCache from 'node-cache'

const { proto } = (await import('@whiskeysockets/baileys')).default
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
} = await import('@whiskeysockets/baileys')

const PORT = process.env.PORT || process.env.SERVER_PORT || 3000

// --- CONFIGURACIÓN MULTI-USUARIO ---
const isSubBot = process.argv.includes('--subbot')
const subBotNumber = isSubBot ? process.argv[process.argv.indexOf('--number') + 1] : null
const subBotPort = isSubBot ? parseInt(process.argv[process.argv.indexOf('--port') + 1]) : PORT
const sessionPath = isSubBot ? `usuarios/${subBotNumber}/sessions` : 'sessions'
const dbPath = isSubBot ? `usuarios/${subBotNumber}/database.json` : `storage/databases/database.json`
const gruposPath = isSubBot ? `usuarios/${subBotNumber}/grupos.json` : `storage/databases/grupos.json`

if (isSubBot) {
  process.env.PORT = subBotPort
  process.env.SERVER_PORT = subBotPort
  process.env.IS_SUBBOT = 'true'
  process.env.SUBBOT_NUMBER = subBotNumber
  console.log(chalk.blue.bold(`\n[SUB-BOT] Iniciando instancia para: ${subBotNumber} en puerto ${subBotPort}\n`))
}

global.activeSubBots = global.activeSubBots || new Map()

async function spawnSubBot(number, port, name = null) {
  if (global.subBotDeleteGuard?.has(String(number))) {
    console.log(chalk.gray(`[SISTEMA] Spawn cancelado: ${number} se está borrando desde el panel.`))
    return { success: false, reason: 'deleting' }
  }

  if (global.activeSubBots && global.activeSubBots.has(number)) {
    const existing = global.activeSubBots.get(number)
    
    if (existing && existing !== 'initializing') {
        console.log(chalk.yellow(`\n[SISTEMA] El sub-bot ${number} ya está en ejecución (Status: ACTIVO).\n`))
        return { success: true, message: 'Bot ya activo' }
    }
  }
  
  
  if (!global.activeSubBots) global.activeSubBots = new Map()
  global.activeSubBots.set(number, 'initializing')

  const linkPath = join(process.cwd(), 'usuarios', number, 'link.json')
  const linkRental = readRentalFromLink(linkPath)
  if (isRentalBlocked(linkRental)) {
    global.activeSubBots.delete(number)
    console.log(chalk.yellow(`[RENTAL] Sub-bot ${number} bloqueado (vencido/pausado). No se iniciará.`))
    if (global.db?.data?.subbots?.[number]) {
      global.db.data.subbots[number].status = linkRental.rentalStatus === 'paused' ? 'paused' : 'expired'
      safeDbWrite(global.db).catch(() => {})
    }
    return { success: false, reason: 'rental_blocked' }
  }
  
  
  let subBotName = name
  if (!subBotName) {
    try {
      if (global.db && global.db.data && global.db.data.subbots?.[number]) {
        subBotName = global.db.data.subbots[number].name
      }
      if (!subBotName) {
        const linkPath = join(process.cwd(), 'usuarios', number, 'link.json')
        if (existsSync(linkPath)) {
          const linkData = JSON.parse(readFileSync(linkPath, 'utf8'))
          subBotName = linkData.name
        }
      }
    } catch (e) {}
  }

  const botPath = join(process.cwd(), 'usuarios', number)
  if (existsSync(botPath)) {
    try {
      const lockFile = join(botPath, 'session', 'lock.json') 
      if (existsSync(lockFile)) unlinkSync(lockFile)
    } catch (e) {}
  }

  const child = fork(fileURLToPath(import.meta.url), [
    '--subbot',
    '--number', number,
    '--port', port
  ], { 
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    detached: false 
  })

  child.on('message', (msg) => {
    if (msg.type === 'code') {
      console.log(chalk.yellow(`\n[MAESTRO] Código para ${number}: ${msg.code}\n`))
      if (global.db && global.db.data) {
        global.db.data.subbots = global.db.data.subbots || {}
        if (!global.db.data.subbots[number]) {
          global.db.data.subbots[number] = { number, port, status: 'pairing', name: subBotName }
        }
        global.db.data.subbots[number].pairingCode = msg.code
        global.db.data.subbots[number].status = 'pairing'
        if (subBotName) global.db.data.subbots[number].name = subBotName
        safeDbWrite(global.db).catch(() => {}) 
      }
    }
    if (msg.type === 'connected') {
       if (global.db && global.db.data) {
        global.db.data.subbots = global.db.data.subbots || {}
        if (!global.db.data.subbots[number]) global.db.data.subbots[number] = { number, port, name: subBotName }
        global.db.data.subbots[number].status = 'online'
        global.db.data.subbots[number].pairingCode = null
        if (subBotName) global.db.data.subbots[number].name = subBotName
        safeDbWrite(global.db).catch(() => {})
      }
    }
    
    if (msg.type === 'status_update') {
      if (global.db && global.db.data && global.db.data.subbots?.[msg.number]) {
        const oldStatus = global.db.data.subbots[msg.number].status;
        global.db.data.subbots[msg.number].status = msg.status === 'open' ? 'online' : (msg.status === 'connecting' ? 'connecting' : 'offline');
        
      
        if (oldStatus !== global.db.data.subbots[msg.number].status) {
          safeDbWrite(global.db).catch(() => {});
        }
      }
    }
    if (msg.type === 'reseller_db_changed') {
      global.db?.read().catch(() => {})
    }
    if (msg.type === 'reseller_spawn_subbot' && msg.number && msg.port) {
      if (global.spawnSubBot) {
        global.spawnSubBot(msg.number, msg.port, msg.name)
      }
    }
    if (msg.type === 'reseller_kill_subbot' && msg.number) {
      const killNum = String(msg.number)
      const botProc = global.activeSubBots?.get(killNum)
      global.activeSubBots?.delete(killNum)
      if (botProc && typeof botProc.kill === 'function') {
        try { botProc.kill('SIGKILL') } catch { /* ignore */ }
      }
      if (global.db?.data?.subbots?.[killNum]) {
        global.db.data.subbots[killNum].status = 'offline'
        safeDbWrite(global.db).catch(() => {})
      }
    }
  })

  child.on('error', (err) => {
    console.error(`[MAESTRO] Error en proceso de ${number}:`, err)
    global.activeSubBots.delete(number)
  })

  child.on('exit', (code) => {
    console.log(chalk.red(`[MAESTRO] Sub-bot ${number} terminó con código: ${code}`))
    global.activeSubBots.delete(number)

    
    if (global.subBotDeleteGuard?.has(String(number))) {
      console.log(chalk.gray(`[SISTEMA] Sub-bot ${number} cerrado por borrado del panel. Sin auto-reinicio.`))
      return
    }

    if (global.db && global.db.data && global.db.data.subbots?.[number]) {
      global.db.data.subbots[number].status = 'offline'
      safeDbWrite(global.db).catch(() => {})

      if (code === 0) {
        console.log(chalk.gray(`[SISTEMA] Sub-bot ${number} se cerró de forma manual (Código 0). No se reiniciará.`))
        return
      }

      if (code === 7) {
        console.log(chalk.red.bold(`[CRÍTICO] Sub-bot ${number} reportó sesión corrupta o no autorizada. Deteniendo para evitar bucle.`))
        global.db.data.subbots[number].status = 'error_session'
        safeDbWrite(global.db).catch(() => {})
        return
      }

      if (code !== 0) {
        const linkPath = join(process.cwd(), 'usuarios', number, 'link.json')
        const linkRental = readRentalFromLink(linkPath)
        if (isRentalBlocked(linkRental)) {
          console.log(chalk.yellow(`[RENTAL] Sub-bot ${number} no se reiniciará (alquiler vencido/pausado).`))
          return
        }
        console.log(chalk.yellow(`[SISTEMA] Reiniciando sub-bot ${number} automáticamente en 5 seg...`))
        setTimeout(() => {
          if (global.subBotDeleteGuard?.has(String(number))) return
          if (!global.db?.data?.subbots?.[number]) return
          if (global.activeSubBots.has(number)) return
          if (global.spawnSubBot) {
            global.spawnSubBot(number, port, global.db.data.subbots[number].name)
          }
        }, 5000)
      }
    }
  })

  global.activeSubBots.set(number, child)
  return { success: true, port }
}

global.spawnSubBot = spawnSubBot

// --- RECONEXIÓN AUTOMÁTICA ---
// NO TOQUEN NADA AQUI O ROMPERAN EL CODE DE SUS CLIENTES XD
// ------------------------------------

protoType()
serialize()

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString();
};
global.__dirname = function dirname(pathURL) {
  return path.dirname(global.__filename(pathURL, true))
};
global.__require = function require(dir = import.meta.url) {
  return createRequire(dir)
}


const listGroups = async (conn) => {
  global.listGroups = listGroups
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    let groups = [];
    
    const sources = [
      () => {
        if (conn.chats && typeof conn.chats === 'object') {
          return Object.values(conn.chats)
            .filter(chat => chat && (chat.id || '').endsWith('@g.us'))
            .map(chat => ({
              id: chat.id,
              name: chat.subject || chat.name || chat.id,
              subject: chat.subject || chat.name || 'Sin nombre'
            }));
        }
        return [];
      },
      async () => {
        try {
          const groupData = await conn.groupFetchAllParticipating();
          return Object.values(groupData || {})
            .filter(g => g && g.id && g.id.endsWith('@g.us'))
            .map(g => ({
              id: g.id,
              name: g.subject || g.subjectOwner || g.id,
              subject: g.subject || g.subjectOwner || 'Sin nombre'
            }));
        } catch (e) {
          console.error('Error en groupFetchAllParticipating:', e);
          return [];
        }
      },
      async () => {
        try {
          if (typeof conn.fetchAllGroups === 'function') {
            const allGroups = await conn.fetchAllGroups();
            return (allGroups || [])
              .filter(g => g && g.id && g.id.endsWith('@g.us'))
              .map(g => ({
                id: g.id,
                name: g.subject || g.name || g.id,
                subject: g.subject || g.name || 'Sin nombre'
              }));
          }
        } catch (e) {
          console.error('Error en fetchAllGroups:', e);
        }
        return [];
      }
    ];

    for (const source of sources) {
      groups = await source();
      if (groups.length > 0) break;
    }

    return groups;
  } catch (e) {
    console.error('Error listando grupos:', e);
    return [];
  }
}

global.APIs = global.APIs || {}
global.APIKeys = global.APIKeys || {}

global.API = (name, path = '/', query = {}, apikeyqueryname) =>
  (name in global.APIs ? global.APIs[name] : name) +
  path +
  (query || apikeyqueryname
    ? '?' +
      new URLSearchParams(
        Object.entries({
          ...query,
          ...(apikeyqueryname ? { [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name] } : {}),
        })
      )
    : '')

global.timestamp = { start: new Date() }

const __dirname = global.__dirname(import.meta.url)


global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.prefix = new RegExp(
  '^[' +
    (opts['prefix'] || '‎z/#$%.\\-').replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') +
    ']'
)


global.db = new Low(new AtomicJSONFile(dbPath, { kind: 'database' }))
global.gruposDB = new Low(new AtomicJSONFile(gruposPath, { kind: 'grupos' }))

const DB_DEFAULTS = {
  chats: {},
  stats: {},
  settings: {},
  botGroups: {},
  bienvenidas: {},
  publicaciones: {},
  timerState: {},
  subbots: {},
  autoReply: {
    enabled: false,
    minTypingSec: 5,
    maxTypingSec: 12,
    minReadSec: 2,
    maxReadSec: 6,
    folders: [],
    rules: [],
    blacklist: [],
    stats: {},
    riskAccepted: false,
    hours: {
      enabled: false,
      start: '05:00',
      stop: '23:00',
      text: '',
      image: null,
      imageType: null,
      limitMode: 'free',
      maxPerContact: 2,
    },
    antiSpam: {
      enabled: false,
      maxMessages: 4,
      windowSec: 3,
      text: 'Intentaste jugar con las respuestas automáticas. Serás agregado a la lista de ignorados.',
      image: null,
      imageType: null,
    },
  },
  accountManager: {
    enabled: true,
    minTypingSec: 5,
    maxTypingSec: 12,
    minReadSec: 2,
    maxReadSec: 6,
    defaultRemindDays: 1,
    defaultRemindTime: '10:00',
    defaultRemindMsg:
      'Hola {{nombre}} 👋\nTe escribo para recordarte que tu alquiler de *{{perfil}}* ({{cuenta}}) vence el *{{vence}}*.\nSi querés renovar, respondé este mensaje.',
    mothers: [],
    clients: [],
    rentals: [],
  },
  botCodes: {
    domain: 'nexcodea.com',
    catchAll: true,
    settings: {
      enabled: true,
      commandsEnabled: true,
      defaultAccessDays: 30,
    },
    mailboxes: [
      {
        id: 'streaming',
        label: 'Streaming',
        email: 'cuentas-streaming@nexcodea.com',
        password: '',
        imapHost: 'mail.spacemail.com',
        imapPort: 993,
        smtpHost: 'mail.spacemail.com',
        smtpPort: 465,
        notes: 'Configurá la contraseña en cada panel',
        provider: 'spacemail',
      },
    ],
    aliases: [],
  },
}

const GRUPOS_DEFAULTS = {
  groups: [],
  selectedGroups: [],
  highlightedGroups: [],
}

global.DATABASE = global.db
global.loadDatabase = async function loadDatabase() {
  if (global._dbInitialized) return global.db.data

  if (global.db.READ) {
    return new Promise((resolve) =>
      setInterval(async function () {
        if (!global.db.READ) {
          clearInterval(this)
          resolve(global._dbInitialized ? global.db.data : global.loadDatabase())
        }
      }, 1000)
    )
  }

  global.db.READ = true
  const dbData = await global.db.adapter.read().catch(() => null)
  const dbFileExists = existsSync(path.resolve(dbPath))

  if (dbData === null && dbFileExists) {
    console.error(`[ERROR-DB] No se sobrescribirá ${dbPath} porque está corrupto o ilegible.`)
    global.db._corrupt = true
  } else {
    global.db._corrupt = false
  }

  global.db.data = mergeDbDefaults({ ...DB_DEFAULTS, ...(isSubBot ? {} : { subbots: {} }) }, dbData)
  global.db.chain = lodash.chain(global.db.data)

  const gruposData = await global.gruposDB.adapter.read().catch(() => null)
  const gruposFileExists = existsSync(path.resolve(gruposPath))

  if (gruposData === null && gruposFileExists) {
    console.error(`[ERROR-DB] No se sobrescribirá ${gruposPath} porque está corrupto.`)
    global.gruposDB._corrupt = true
    global.gruposDB.data = { ...GRUPOS_DEFAULTS }
  } else {
    global.gruposDB._corrupt = false
    global.gruposDB.data = mergeDbDefaults(GRUPOS_DEFAULTS, gruposData)
  }

  global.db.READ = null
  global._dbInitialized = true
  return global.db.data
}

await global.loadDatabase()

global.authFile = sessionPath
await fs.mkdir(global.authFile, { recursive: true })
const { state, saveCreds } = await useMultiFileAuthState(global.authFile)
global._saveCreds = saveCreds

const { version } = await fetchLatestBaileysVersion()

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (texto) => new Promise((resolver) => rl.question(texto, resolver))

const logger = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
}).child({ class: 'client' })
logger.level = 'fatal'

const msgRetryCache = new NodeCache()

const connectionOptions = {
  version: version,
  logger,
  printQRInTerminal: false,
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, logger),
  },
  msgRetryCounterCache: msgRetryCache,
  browser: Browsers.ubuntu('Chrome'),
  markOnlineOnclientect: true,
  generateHighQualityLinkPreview: true,
  syncFullHistory: false,
  retryRequestDelayMs: 10,
  transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 10 },
  maxMsgRetryCount: 15,
  appStateMacVerification: {
    patch: false,
    snapshot: false,
  },
  getMessage: async (key) => {
    const jid = jidNormalizedUser(key.remoteJid)
    const msg = await store.loadMessage(jid, key.id)
    return msg?.message || ''
  },
}

global.conn = makeWASocket(connectionOptions)
const conn = global.conn

// IPC: el maestro pide verificar invites cuando él no está vinculado
if (isSubBot && process.send) {
  process.on('message', async (msg) => {
    if (!msg || msg.type !== 'probe_invite') return
    try {
      const result = await probeInviteWithConn(global.conn, msg.code)
      if (process.connected) {
        process.send({
          type: 'probe_invite_result',
          reqId: msg.reqId,
          number: subBotNumber,
          result,
        })
      }
    } catch (e) {
      if (process.connected) {
        process.send({
          type: 'probe_invite_result',
          reqId: msg.reqId,
          number: subBotNumber,
          result: {
            ok: false,
            status: 'unknown',
            error: e?.message || String(e),
            checkedAt: Date.now(),
          },
        })
      }
    }
  })
}

global.mainBotJid = null

async function handleLogin() {
  if (conn.authState.creds.registered) {
    if (isSubBot && process.send && process.connected) process.send({ type: 'connected' })
    console.log(chalk.green('Sesión ya está registrada.'))
    return
  }
  
  // --- VERIFICACIÓN FÍSICA DE SESIÓN ---
  // Si no está registrado en memoria, verificamos si existe el archivo creds.json físicamente
  // Esto evita que pregunte "¿Cómo deseas iniciar sesión?" si ya hay una sesión previa en disco.
  const credsPath = join(global.authFile, 'creds.json')
  if (existsSync(credsPath)) {
    try {
      const stats = statSync(credsPath)
      if (stats.size > 100) { // Un creds.json válido suele tener más de 100 bytes
        console.log(chalk.cyan(`[SISTEMA] Detectada sesión física en ${global.authFile}. Esperando sincronización...`))
        // Esperamos un poco más para que Baileys termine de leer el archivo
        await new Promise(resolve => setTimeout(resolve, 3500))
        
        if (conn.authState.creds.registered) {
          if (isSubBot && process.send && process.connected) process.send({ type: 'connected' })
          console.log(chalk.green('Sesión recuperada exitosamente del disco.'))
          return
        }
      }
    } catch (e) {
      console.log(chalk.red(`[Error] Error al verificar creds.json: ${e.message}`))
    }
  }

  if (isSubBot && subBotNumber) {
    global.isLoggingIn = true; // Marcamos que estamos en proceso de vinculación
    console.log(chalk.yellow(`\n[SUB-BOT] Solicitando código de vinculación para: ${subBotNumber}...`))
    
    const tryPairing = async () => {
      try {
        if (!existsSync(join(process.cwd(), 'usuarios', subBotNumber))) {
           console.log(chalk.red(`[SUB-BOT] La carpeta del usuario ${subBotNumber} ya no existe. Deteniendo...`))
           process.exit(0)
           return
        }
        if (conn.ws.readyState === ws.OPEN) {
          let code = await conn.requestPairingCode(subBotNumber.replace(/\D/g, ''))
          code = code?.match(/.{1,4}/g)?.join('-') || code
          if (process.send && process.connected) process.send({ type: 'code', code })
        } else {
          setTimeout(tryPairing, 2000)
        }
      } catch (e) {
        if (e.message?.includes('Connection Closed') || e.output?.statusCode === 428) {
          
        } else {
           console.error('Error al generar código:', e)
        }
        setTimeout(tryPairing, 5000)
      }
    }
    
    setTimeout(tryPairing, 3000)
    return
  }

  // BOT PRINCIPAL: Ya no preguntamos por terminal
  console.log(chalk.cyan(`\n[SISTEMA] Bot Principal esperando vinculación desde PANEL WEB (QR/Código).\n`))
  
  
  global.isLoggingIn = true;
  
}

let handler = await import('./handler.js')

conn.ev.on('creds.update', saveCreds)
conn.ev.on('connection.update', connectionUpdate.bind(conn))
conn.ev.on('messages.upsert', (m) => {
  if (handler && handler.handler) {
    handler.handler.call(conn, m)
  }
})

await handleLogin()

conn.isInit = false
conn.well = false

if (!opts['test']) {
  if (global.db) {
    setInterval(async () => {
      if (global.db.data) {
        
        global.db.data.chats ||= {}
        global.db.data.stats ||= {}
        global.db.data.settings ||= {}
        global.db.data.botGroups ||= {}
        global.db.data.bienvenidas ||= {}
        global.db.data.publicaciones ||= {}
        global.db.data.timerState ||= {}
        global.db.data.subbots ||= {}
        
        if (!global.db.READ && !global.db._corrupt) {
          await safeDbWrite(global.db)
        }
      }
    }, 30 * 1000)
  }
}

async function connectionUpdate(update) {
  const { connection, lastDisconnect, isNewLogin, qr } = update;
  global.stopped = connection
  
  if (isNewLogin) {
    conn.isInit = true;
    if (!isSubBot) {
        if (!global.detectedNewLogin) {
          console.log(chalk.bold.cyan('\n[SISTEMA] ¡NUEVA VINCULACIÓN DETECTADA! (isNewLogin)'));
          global.detectedNewLogin = true; 
        }
    }
  }

  // --- REINICIO TRAS VINCULACIÓN EXITOSA (PRINCIPAL) ---
  if (!isSubBot && connection === 'open') {
     console.log(chalk.green('\n[SISTEMA] Bot Principal conectado exitosamente.'));
     
     if (global.detectedNewLogin || global.isLoggingIn) { 
        console.log(chalk.bold.yellow('[SISTEMA] Vínculo detectado. EJECUTANDO REINICIO MAESTRO...'));
        
        global.isLoggingIn = false;
        global.detectedNewLogin = false;
        
        // Igual que el botón web: solo process.exit(1), el maestro (index.js) lo reinicia solo.
        console.log('\x1b[33m[SISTEMA]\x1b[0m Reiniciando proceso para cargar nueva sesión...');
        global.isRestarting = true;
        setTimeout(() => {
          process.exit(1);
        }, 300);
        return;
     }
  }
  // ---------------------------------------------------
  
  if (qr && !isSubBot) {
     global.principalQR = qr;
  }
  
  const numero = conn?.user?.jid?.split('@')[0] || conn?.user?.id?.split('@')[0] || (isSubBot ? subBotNumber : 'principal')
  const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode
  
  
  if (statusCode === DisconnectReason.connectionReplaced) {
    console.log(chalk.bold.yellow(`[SISTEMA] Conexión reemplazada por otra sesión (${numero}). Reiniciando para reconectar...`))
    
    // Antes de salir, nos aseguramos de que el estado en DB no sea 'online' para evitar confusiones
    if (global.db?.data?.subbots?.[numero]) {
      global.db.data.subbots[numero].status = 'connecting'
      safeDbWrite(global.db).catch(() => {})
    }

    if (isSubBot) {
      process.exit(1)
    } else {
      process.exit(1)
    }
    return
  }

  if (statusCode && statusCode !== DisconnectReason.loggedOut && conn?.ws.sockV2et == null) {
    await global.reloadHandler(true).catch(console.error)
    global.timestamp.connect = new Date()
  }
  if (!global._dbInitialized) await loadDatabase()
  
  
  if (connection === 'close' || connection === 'connecting') {
    global.connState = connection;
    
    // Si estamos en proceso de login (vinculando), no activamos el auto-recovery 
    // para no interrumpir al usuario mientras escribe su número o escanea QR.
    if (global.isLoggingIn) return;

    if (!global._keepaliveInterval) {
      const numero = isSubBot ? subBotNumber : 'principal';
      global._keepaliveInterval = setInterval(async () => {
        const currentState = global.connState || 'offline';
        if (currentState !== 'open') {
          const failCountKey = `fail_count_${numero}`;
          global[failCountKey] = (global[failCountKey] || 0) + 1;
          
          console.log(chalk.yellow(`[AUTO-RECOVERY] ⚠️  ${numero} sigue en estado: ${currentState}. Intento #${global[failCountKey]}`));
          
          if (global[failCountKey] >= 12) { 
            global[failCountKey] = 0;
            console.log(chalk.red.bold(`[SISTEMA] [!] Reintento de conexión agotado para ${numero} tras 60 seg. Forzando REINICIO.`));
            process.exit(1);
          }
        } else {
          clearInterval(global._keepaliveInterval);
          global._keepaliveInterval = null;
        }
      }, 5000);
    }
  }

  if (connection === 'open') {
    if (isSubBot && process.send && process.connected) process.send({ type: 'connected' })
    console.log(chalk.yellow('Conectado correctamente.'))
    // Auto-reply: solo mensajes posteriores a este instante (ignora historial al reconectar)
    global.autoReplyOnlineAt = Date.now()
    global.mainBotJid = conn.user?.jid?.split('@')[0] || conn.user?.id?.split('@')[0]
    if (!conn.startTime) {
      conn.startTime = Date.now()
    }

    // ─── Estado de conexión global 
    global.connState = 'open'
    global.connEvents?.emit('open')

    // Keepalive: evita que WhatsAppp cierre conexion del whatsapp conectado con tus sub bots
    if (global._keepaliveInterval) clearInterval(global._keepaliveInterval)
    global._keepaliveInterval = setInterval(async () => {
      try {
        const numero = global.conn?.user?.jid?.split('@')[0] || global.conn?.user?.id?.split('@')[0] || 'desconocido'
        
        
        if (isSubBot && process.send && process.connected) {
          process.send({ 
            type: 'status_update', 
            number: subBotNumber, 
            status: global.connState || 'offline' 
          });
        }

        if (isSubBot && subBotNumber && numero !== subBotNumber) return;

        if (global.connState === 'open' && global.conn?.user) {
          await global.conn.sendPresenceUpdate('available', 'status@broadcast').catch(() => {})
          
    
          const failCountKey = `fail_count_${numero}`;
          global[failCountKey] = 0;

          
          const now = Date.now();
          if (!global.lastLogTime[numero] || now - global.lastLogTime[numero] > 24000) {
            console.log(chalk.cyan(`[KEEPALIVE] ✅ Sesión activa: ${numero}`))
            global.lastLogTime[numero] = now;
          }
        } else {
        
          console.log(chalk.yellow(`[KEEPALIVE] ⚠️  Sin conexión activa: ${numero} — estado=${global.connState || 'desconocido'}`))
          
          
          const failCountKey = `fail_count_${numero}`;
          global[failCountKey] = (global[failCountKey] || 0) + 1;

          console.log(chalk.gray(`[KEEPALIVE] Intento de reconexión #${global[failCountKey]} para ${numero}...`));

          
          if (global[failCountKey] >= 12) {
            global[failCountKey] = 0; 
            
            if (isSubBot) {
              console.log(chalk.red.bold(`[SISTEMA] 🚨 Sub-bot ${numero} no reconectó tras 60 segundos. Reiniciando instancia...`))
              process.exit(1);
            } else {
              console.log(chalk.red.bold(`[SISTEMA] 🚨 BOT PRINCIPAL no reconectó tras 60 segundos. Reiniciando TODO el sistema...`))
              process.exit(1);
            }
          }
        }
      } catch (e) {
        console.log(chalk.red(`[KEEPALIVE] ❌ Error en ciclo: ${e.message}`))
      }
    }, 5000) 
    // ─────────────────────────────────────────────────────────────────────────

    
    const groups = await listGroups(conn)
    if (!global.gruposDB._corrupt) {
      global.gruposDB.data.groups = groups
      await safeDbWrite(global.gruposDB)
    }

    
    if (global.groupUpdateInterval) clearInterval(global.groupUpdateInterval)
    global.groupUpdateInterval = setInterval(async () => {
      
      if (global.conn && global.conn.user && global.connState === 'open') {
        const updatedGroups = await listGroups(global.conn)
        if (updatedGroups.length > 0 && !global.gruposDB._corrupt) {
          global.gruposDB.data.groups = updatedGroups
          await safeDbWrite(global.gruposDB)
          console.log(chalk.green(`[SISTEMA] Grupos actualizados automáticamente: ${updatedGroups.length} encontrados.`))
        }
      }
    }, 3 * 60 * 1000) 
  }
  const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
  if (reason === 405) {
    if (existsSync('./sessions/creds.json')) unlinkSync('./sessions/creds.json')
    console.log(
      chalk.bold.redBright(
        `Conexión reemplazada, por favor espera un momento. Reiniciando...\nSi aparecen errores, vuelve a iniciar con: npm start`
      )
    )
    process.exit(1)
  }
  if (connection === 'close') {
    // Si la sesión sigue existiendo pero WhatsApp nos desconecta, forzamos reinicio limpio
    if (isSubBot && reason !== DisconnectReason.loggedOut) {
      if (reason === DisconnectReason.badSession || reason === 401) {
        console.log(chalk.red.bold(`[SISTEMA] 🚨 Sesión INVÁLIDA o CORRUPTA para ${numero}. No se reiniciará para evitar bucles de código.`));
        process.exit(7); // Código especial para evitar reinicio
        return;
      }
      console.log(chalk.red(`[SISTEMA] Sub-bot ${numero} perdió conexión (Razón: ${reason}). Forzando REINICIO LIMPIO...`))
      process.exit(1)
      return
    }
    
    // BOT PRINCIPAL: Si se desconecta y no fue logout, forzamos salida para que el Maestro lo reviva LIMPIO
    if (!isSubBot && reason !== DisconnectReason.loggedOut && reason !== DisconnectReason.connectionReplaced) {
       console.log(chalk.yellow(`[SISTEMA] Bot Principal desconectado (Razón: ${reason}). Reiniciando proceso...`));
       setTimeout(() => process.exit(1), 500);
       return;
    }

    switch (reason) {
      case DisconnectReason.badSession:
        conn.logger.error(`Sesión incorrecta, elimina la carpeta ${global.authFile} y escanea nuevamente.`)
        if (isSubBot) {
           console.log(chalk.red.bold(`[CRÍTICO] Deteniendo sub-bot ${numero} permanentemente por sesión corrupta.`));
           process.exit(7);
           return;
        }
        break
      case DisconnectReason.connectionClosed:
      case DisconnectReason.connectionLost:
      case DisconnectReason.timedOut:
        conn.logger.warn(`Conexión perdida o cerrada, reconectando...`)
        global.connState = 'connecting'
        if (global._keepaliveInterval) { clearInterval(global._keepaliveInterval); global._keepaliveInterval = null }
        if (reason !== DisconnectReason.connectionReplaced) {
            await global.reloadHandler(true).catch(console.error)
        }
        break
      case DisconnectReason.connectionReplaced:
        conn.logger.warn(`Conexión reemplazada (${numero}). Reiniciando instancia...`)
        process.exit(1);
        break;
      case DisconnectReason.loggedOut:
        conn.logger.error(`Sesión cerrada, elimina la carpeta ${global.authFile} y escanea nuevamente.`)
        break
      case DisconnectReason.restartRequired:
        conn.logger.info(`Reinicio requerido por WhatsApp (515). Reconectando...`)
        console.log(chalk.yellow(`[SISTEMA] Reinicio requerido (515). Reconectando para mantener estabilidad.`))
        global.connState = 'connecting'
        if (global._keepaliveInterval) { clearInterval(global._keepaliveInterval); global._keepaliveInterval = null }
        await global.reloadHandler(true).catch(console.error)
        break
      default:
        conn.logger.warn(`Desconexión desconocida: ${reason || ''} - Estado: ${connection || ''}`)
        global.connState = 'connecting'
        if (global._keepaliveInterval) { clearInterval(global._keepaliveInterval); global._keepaliveInterval = null }
        await global.reloadHandler(true).catch(console.error)
        break
    }
  }
}


if (!global.connEvents) {
  global.connEvents = new EventEmitter()
  global.connEvents.setMaxListeners(50) 
}


global.lastLogTime = global.lastLogTime || {}

global.connState = global.connState || 'connecting'

process.on('uncaughtException', console.error)


function saveDBsSync() {
  try {
    if (global.db?.adapter?.writeSync && global.db?.data && !global.db._corrupt) {
      global.db.adapter.writeSync(global.db.data)
    }
  } catch (e) { console.error('[SIGINT] Error guardando database.json:', e.message) }
  try {
    if (!global.gruposDB?._corrupt && global.gruposDB?.adapter?.writeSync && global.gruposDB?.data) {
      global.gruposDB.adapter.writeSync(global.gruposDB.data)
    }
  } catch (e) { console.error('[SIGINT] Error guardando grupos.json:', e.message) }
}
process.on('SIGINT', () => { saveDBsSync(); process.exit(0) })
process.on('SIGTERM', () => { saveDBsSync(); process.exit(0) })
process.on('exit', () => { saveDBsSync() })

let isInit = true
global.reloadHandler = async function (restartConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error)
    if (Handler && Object.keys(Handler).length) handler = Handler
  } catch (e) {
    console.error(e)
  }

  if (restartConn) {
    try {
      if (global.conn.ws) global.conn.ws.close()
    } catch {}
    global.conn.ev.removeAllListeners()

    
    if (global._keepaliveInterval) { clearInterval(global._keepaliveInterval); global._keepaliveInterval = null }
    if (global.groupUpdateInterval) { clearInterval(global.groupUpdateInterval); global.groupUpdateInterval = null }
    
    const preservedStartTime = global.conn.startTime

  
  
    try {
      const freshAuth = await useMultiFileAuthState(global.authFile)
      connectionOptions.auth = {
        creds: freshAuth.state.creds,
        keys: makeCacheableSignalKeyStore(freshAuth.state.keys, logger),
      }
      
      global._saveCreds = freshAuth.saveCreds
    } catch (authErr) {
      console.log(chalk.yellow(`[RECONEXIÓN] No se pudo releer auth state: ${authErr.message} — usando estado en memoria`))
    }

    global.conn = makeWASocket(connectionOptions)
    
    if (preservedStartTime) {
      global.conn.startTime = preservedStartTime
    }
    
    isInit = true
  }

  // Si hubo reconexión, el socket nuevo está en global.conn.
  // Los listeners deben ir en global.conn.ev (el socket activo), nunca en conn.ev (el viejo).
  const activeConn = global.conn

  if (!isInit) {
    try { conn.ev.off('messages.upsert', conn.handler) } catch {}
    try { conn.ev.off('connection.update', conn.connectionUpdate) } catch {}
    try { conn.ev.off('creds.update', conn.credsUpdate) } catch {}
  }

  activeConn.handler = handler.handler.bind(activeConn)
  activeConn.connectionUpdate = connectionUpdate.bind(activeConn)
  activeConn.credsUpdate = (global._saveCreds || saveCreds).bind(activeConn, true)

  activeConn.ev.on('messages.upsert', activeConn.handler)
  activeConn.ev.on('connection.update', activeConn.connectionUpdate)
  activeConn.ev.on('creds.update', activeConn.credsUpdate)

  isInit = false
  return true
}

const pluginFilter = (filename) => /\.js$/.test(filename)
const pluginFolders = [
  join(__dirname, './plugins/index'),
  join(__dirname, './plugins'),
].filter((p) => existsSync(p))
global.plugins = {}

async function filesInit() {
  for (const pluginFolder of pluginFolders) {
  for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
    if (global.plugins[filename]) continue
    try {
      const file = global.__filename(join(pluginFolder, filename))
      const module = await import(file)
      
     
      let plugin = module.default || module
      
     
      // Si el default es una función con props (handler.all / .before / .command),
      // hay que copiarlas: si no, se pierden y plugins como auto-reply no corren.
      if (typeof plugin === 'function') {
        plugin = {
          handler: plugin,
          all: plugin.all,
          before: plugin.before,
          command: plugin.command || [],
          tags: plugin.tags || [],
          help: plugin.help || [],
          customPrefix: plugin.customPrefix,
          disabled: !!plugin.disabled,
        }
      }
      
      
      if (plugin.command && typeof plugin.command === 'string') {
        plugin.command = [plugin.command]
      }
      
      global.plugins[filename] = plugin
      
    } catch (e) {
      conn.logger.error(`Error cargando plugin ${filename}:`, e)
      delete global.plugins[filename]
    }
  }
  }
}
await filesInit()

function findPluginPath(filename) {
  for (const folder of pluginFolders) {
    const dir = join(folder, filename)
    if (existsSync(dir)) return dir
  }
  return null
}

global.reload = async (_ev, filename) => {
  if (pluginFilter(filename)) {
    const dir = findPluginPath(filename)
    if (!dir) {
      if (filename in global.plugins) delete global.plugins[filename]
      return
    }
    const resolved = global.__filename(dir, true)
    if (filename in global.plugins) {
      if (existsSync(dir)) conn.logger.info(`Updated plugin - '${filename}'`)
      else {
        conn.logger.warn(`Deleted plugin - '${filename}'`)
        return delete global.plugins[filename]
      }
    } else conn.logger.info(`New plugin - '${filename}'`)

    const err = syntaxerror(readFileSync(dir), filename, {
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    })
    if (err) conn.logger.error(`Syntax error while loading '${filename}':\n${format(err)}`)
    else {
      try {
        const module = await import(`${resolved}?update=${Date.now()}`)
        let plugin = module.default || module
        if (typeof plugin === 'function') {
          plugin = {
            handler: plugin,
            all: plugin.all,
            before: plugin.before,
            command: plugin.command || [],
            tags: plugin.tags || [],
            help: plugin.help || [],
            customPrefix: plugin.customPrefix,
            disabled: !!plugin.disabled,
          }
        }
        global.plugins[filename] = plugin
      } catch (e) {
        conn.logger.error(`Error requiring plugin '${filename}':\n${format(e)}`)
      } finally {
        global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)))
      }
    }
  }
}
Object.freeze(global.reload)

for (const pluginFolder of pluginFolders) {
  watch(pluginFolder, (event, filename) => {
    if (global.isCreatingUser) return
    if (filename && pluginFilter(filename)) {
      global.reload(event, filename)
    }
  })
}
await global.reloadHandler()


if (!isSubBot) {
  setTimeout(() => {
    reconnectSubBots().catch(console.error)
  }, 5000)
}


global.reconnectSubBots = async function() {
  
  try {
    const usuariosDir = join(process.cwd(), 'usuarios')
    if (!existsSync(usuariosDir)) return
    
    
    const folders = readdirSync(usuariosDir).filter(f => {
      const folderPath = join(usuariosDir, f)
      return statSync(folderPath).isDirectory() && existsSync(join(folderPath, 'link.json'))
    })

    if (folders.length > 0) {
      console.log(chalk.cyan(`\n[SISTEMA] Detectados ${folders.length} sub-bots en carpeta usuarios/  Reconectando...`))
      for (const number of folders) {
        try {
          const linkPath = join(usuariosDir, number, 'link.json')
          const linkData = JSON.parse(readFileSync(linkPath, 'utf8'))

          if (isRentalBlocked(linkData)) {
            console.log(chalk.yellow(`[RENTAL] Omitiendo ${number} — alquiler vencido o pausado`))
            continue
          }
          
          const port = linkData.port
          const name = linkData.name || 'Bot'

          if (port) {
            console.log(chalk.cyan(`[SISTEMA] Levantando instancia: ${number} (${name}) en puerto ${port}`))
            
            
            if (global.db && global.db.data) {
              global.db.data.subbots = global.db.data.subbots || {}
              const existing = global.db.data.subbots[number] || {}
              global.db.data.subbots[number] = mergeSubbotRentalFromLink({
                ...existing,
                number,
                port,
                name,
                panelUser: linkData.panelUser || existing.panelUser || '---',
                panelPass: linkData.panelPass || existing.panelPass || '---',
                status: existing.status || 'offline',
              }, linkData)
            }
            await spawnSubBot(number, port, name)
            
            await new Promise(resolve => setTimeout(resolve, 8000))
          }
        } catch (e) {
          console.error(`[ERROR] No se pudo leer link.json para ${number}:`, e.message)
        }
      }
    }
  } catch (err) {
    console.error(chalk.red('[ERROR RECONEXIÓN] Error al escanear carpeta usuarios:'), err.message)
  }

  
  if (!global.conns || !Array.isArray(global.conns)) {
    global.conns = []
  }

  const serbotDir = './Serbot'
  if (!existsSync(serbotDir)) {
    
    return
  }

  const subBotFolders = readdirSync(serbotDir).filter(folder => {
    const folderPath = join(serbotDir, folder)
    return statSync(folderPath).isDirectory() && existsSync(join(folderPath, 'creds.json'))
  })

  if (subBotFolders.length === 0) {
    console.log(chalk.yellow('No se encontraron sub-bots para reconectar'))
    return
  }

  console.log(chalk.cyan(`\nReconectando ${subBotFolders.length} sub-bots...`))

  for (const folder of subBotFolders) {
    try {
      const botPath = join(serbotDir, folder)
      const credsPath = join(botPath, 'creds.json')
      
      if (!existsSync(credsPath)) {
        console.log(chalk.red(`No se encontró creds.json en ${folder}`))
        continue
      }

     
      const isAlreadyConnected = global.conns.some(conn => 
        conn.user && conn.user.jid && conn.user.jid.includes(folder)
      )

      if (isAlreadyConnected) {
        console.log(chalk.green(`Sub-bot ${folder} ya está conectado`))
        continue
      }

      
      const serbotModule = await import('./plugins/serbot-serbot.js')
      if (serbotModule.AYBot) {
        await serbotModule.AYBot({
          pathAYBot: botPath,
          m: null,
          conn: global.conn,
          args: [],
          usedPrefix: '.',
          command: 'qr',
          fromCommand: false
        })
        console.log(chalk.green(`Sub-bot ${folder} reconectado exitosamente`))
      } else {
        console.log(chalk.red(`No se pudo importar AYBot para ${folder}`))
      }

     
      await new Promise(resolve => setTimeout(resolve, 2000))

    } catch (error) {
      console.log(chalk.red(`Error reconectando sub-bot ${folder}:`, error.message))
    }
  }

  console.log(chalk.cyan(`\nProceso de reconexión de sub-bots completado`))
}


const originalConnectionUpdate = connectionUpdate
connectionUpdate = async function(update) {
  await originalConnectionUpdate.call(this, update)
  
  
  if (update.connection === 'open' && !global.isReconnectingSubBots) {
    global.isReconnectingSubBots = true
    
    // Pequeño delay para asegurar que el bot principal - NO TOCAR ESTO
    setTimeout(() => {
        console.log(chalk.cyan('\n[SISTEMA] Bot principal estable. Iniciando reconexión programada de sub-bots...'))
        global.reconnectSubBots().catch(console.error)
    }, 15000) 
  }
}




global.safeDbWrite = safeDbWrite
global.safeGruposWrite = safeGruposWrite

import('./server.js')
