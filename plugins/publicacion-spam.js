import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import {
  isCampaignEffectivelyEnabled,
  isCampaignManuallyOn,
  getSpamMode,
  getDueWeeklySlots,
  markWeeklySlotsFired,
  syncAllCampaignSchedules,
  getScheduledActiveState,
  normalizeScheduleFields,
} from '../lib/spam-schedule.js'


global.spamLogs = global.spamLogs || [];

/** Separa "Campaña:groupId" (el JID puede tener ':', así que solo el primer ':'). */
function parseCampaignTarget(target) {
  const raw = String(target || '')
  const idx = raw.indexOf(':')
  if (idx === -1) return { campaignName: null, groupId: raw }
  return { campaignName: raw.slice(0, idx), groupId: raw.slice(idx + 1) }
}

/** Pubs de UNA carpeta en un grupo (nunca mezcla campañas). */
function getEnabledPubsForCampaign(groupId, campaignName) {
  const all = global.db?.data?.publicaciones?.[groupId]?.publications || []
  const tagged = all.filter((p) => {
    if (p.enabled === false) return false
    if (p.campaign === campaignName) return true
    // Legacy sin tag: solo cuenta para Principal
    if (!p.campaign && campaignName === 'Principal') return true
    return false
  })
  if (tagged.length > 0) return tagged
  const campaignPubs = global.db?.data?.campaigns?.[campaignName]?.publications || []
  return campaignPubs.filter((p) => p.enabled !== false)
}

function campaignHasContent(groupId, campaignName) {
  return getEnabledPubsForCampaign(groupId, campaignName).length > 0
}
const addSpamLog = (type, message, groupName = 'Sistema') => {
  const log = {
    time: new Date().toLocaleTimeString(),
    type, 
    group: groupName,
    message
  };
  global.spamLogs.unshift(log); 
  if (global.spamLogs.length > 100) global.spamLogs.pop(); 

  
  if (global.db && global.db.data) {
    global.db.data.spamStats = global.db.data.spamStats || { success: 0, failure: 0, total: 0, lastActivity: null, uniqueGroups: [] };
    
    if (type === 'success') {
      global.db.data.spamStats.success++;
      global.db.data.spamStats.total++;
      
      
      
      if (groupName !== 'Sistema') {
         
         global.db.data.spamStats.uniqueGroupIds = global.db.data.spamStats.uniqueGroupIds || [];
         
         const gId = (global.gruposDB.data.groups || []).find(g => g.name === groupName)?.id || groupName;
         
         if (!global.db.data.spamStats.uniqueGroupIds.includes(gId)) {
            global.db.data.spamStats.uniqueGroupIds.push(gId);
            
            if (!global.db.data.spamStats.uniqueGroups.includes(groupName)) {
               global.db.data.spamStats.uniqueGroups.push(groupName);
            }
         }
      }
    } else if (type === 'error') {
      global.db.data.spamStats.failure++;
      global.db.data.spamStats.total++;
    }
    
    global.db.data.spamStats.lastActivity = Date.now();
    global.db.write().catch(() => {});
  }
};


// ═══════════════════════════════════════════════════════════════════════════
// SEND QUEUE — cola global única: solo UN sendMessage activo a la vez.
// Evita que Baileys colapse el WebSocket por concurrencia. OSEA QUE EVITA QUE WHATSAPP BLOQUEE EL SPAM EN ESE MOMENTO
// ═══════════════════════════════════════════════════════════════════════════
class SendQueue {
  constructor(delayMs = 800) {
    this._queue = [];
    this._running = false;
    this._delay = delayMs;
  }
  
  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      this._run();
    });
  }
  async _run() {
    if (this._running) return;
    this._running = true;
    while (this._queue.length > 0) {
      const { fn, resolve, reject } = this._queue.shift();
      try { resolve(await fn()); } catch (e) { reject(e); }
      if (this._queue.length > 0) {
        
        const activeCount = global.activeTimers ? global.activeTimers.size : 0;
        const dynDelay = activeCount > 50 ? Math.round(this._delay * 0.75) : this._delay;
        await new Promise(r => setTimeout(r, dynDelay));
      }
    }
    this._running = false;
  }
  get pending() { return this._queue.length; }
  clear() { this._queue.length = 0; }
}

global.sendQueue = global.sendQueue || new SendQueue(800);
const sendQueue = global.sendQueue;

// Cola de reintentos (mantener para compatibilidad)
const retryQueue = [];
let isProcessingRetry = false;

async function processRetryQueue() {
  if (isProcessingRetry || retryQueue.length === 0) return;
  isProcessingRetry = true;
  while (retryQueue.length > 0) {
    const { task, delay } = retryQueue.shift();
    await new Promise(r => setTimeout(r, delay));
    try { await task(); } catch (e) { console.error('[RETRY-ERR]', e); }
  }
  isProcessingRetry = false;
}

// processQueue / globalQueue mantienen compatibilidad con manualSpamTrigger
const globalQueue = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || globalQueue.length === 0) return;
  isProcessingQueue = true;
  while (globalQueue.length > 0) {
    const task = globalQueue.shift();
    try { await task(); } catch (e) { console.error('[QUEUE-ERR]', e); }
  }
  isProcessingQueue = false;
}


global.activeTimers = global.activeTimers || new Map();
const activeTimers = global.activeTimers;


const saveTimerState = async (target, nextRun) => {
  if (!global.db?.data) return;
  global.db.data.timerState = global.db.data.timerState || {};
  global.db.data.timerState[target] = nextRun;
  await global.db.write().catch(() => {});
};

const clearTimerState = async (target) => {
  if (!global.db?.data?.timerState) return;
  delete global.db.data.timerState[target];
  await global.db.write().catch(() => {});
};

const groupLocks = new Map() 

//  RECONEXION - NO BORREN ESTO
async function waitForConnection(maxWait = 30000) {
  if (global.connState === 'open' && global.conn?.user) return true;
  console.log(`\x1b[33m[SPAM-LOG]\x1b[0m ⏳ Esperando reconexión de WhatsApp...`);
  const start = Date.now();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      global.connEvents?.off('open', onOpen);
      console.log(`\x1b[31m[SPAM-LOG]\x1b[0m ❌ Reconexión no ocurrió en ${maxWait/1000}s`);
      resolve(false);
    }, maxWait);
    const onOpen = () => {
      clearTimeout(timeout);
      console.log(`\x1b[32m[SPAM-LOG]\x1b[0m ✅ Conexión restaurada (${Date.now() - start}ms)`);
      resolve(true);
    };
    global.connEvents?.once('open', onOpen);
  });
}

// Ping activo

async function pingConnection(maxWait = 60000) {
  const conn = global.conn;
  if (!conn || !conn.user) {
    global.connState = 'connecting';
    return waitForConnection(maxWait);
  }
  
  if (global.connState !== 'open') {
    return waitForConnection(maxWait);
  }
  try {
    await conn.sendPresenceUpdate('available', 'status@broadcast');
    return true;
  } catch (pingErr) {
    const msg = pingErr.message || '';
    const isDead = msg.includes('Connection Closed') || msg.includes('Connection closed') ||
                   msg.includes('ECONNRESET') || msg.includes('socket') || msg.includes('WebSocket');
    if (isDead) {
      
      await new Promise(r => setTimeout(r, 2000));
      if (global.connState === 'open' && global.conn?.user) {
        return true;
      }
      console.log(`\x1b[33m[SPAM-LOG]\x1b[0m ⚠️ Ping falló (${msg.slice(0,40)}). Forzando espera de reconexión...`);
      global.connState = 'connecting';
      return waitForConnection(maxWait);
    }
    return true;
  }
}

const getTimerKey = (target) => `timer:${target}`;

const hasActiveTimer = (target) => {
  const key = getTimerKey(target);
  return activeTimers.has(key);
};

const clearTimer = (target, preserveState = false) => {
  const timerKey = getTimerKey(target);
  if (activeTimers.has(timerKey)) {
    const timerObj = activeTimers.get(timerKey);
    if (timerObj.main) clearTimeout(timerObj.main); 
    if (timerObj.monitor) clearInterval(timerObj.monitor);
    activeTimers.delete(timerKey);
    if (!preserveState) clearTimerState(target); 
    console.log(`\x1b[31m[SPAM-LOG]\x1b[0m Deteniendo temporizador para: ${target}`);
    return true;
  }
  return false;
};

const clearAllTimers = (groupId = null) => {
  let count = 0;
  for (const [key, timerObj] of activeTimers.entries()) {
    if (!groupId || key === getTimerKey(groupId)) {
      if (timerObj.main) clearTimeout(timerObj.main); 
      if (timerObj.monitor) clearInterval(timerObj.monitor);
      activeTimers.delete(key);
      count++;
    }
  }
  return count;
};

async function sendPublication(conn, target, pub, retryCount = 0) {
  const maxRetries = 3; 
  const retryDelay = 5000; 

  const { campaignName, groupId: realGroupId } = parseCampaignTarget(target);
  const groupName = (global.gruposDB.data.groups || []).find(g => g.id === realGroupId)?.name || realGroupId;

  
  if (campaignName) {
    const camp = global.db.data.campaigns?.[campaignName]
    const mode = getSpamMode(camp)
    let allowed = false
    if (mode === 'weekly') {
      // Solo envíos intencionales (hora programada o manual), no el loop por intervalo
      allowed = camp?.enabled !== false && global.__forceSendCampaign === campaignName
    } else {
      allowed = isCampaignEffectivelyEnabled(camp)
    }
    if (!allowed) {
      const reason = mode === 'weekly'
        ? (camp?.enabled === false ? 'carpeta desactivada' : 'spam semanal (solo a horas fijas o envío manual)')
        : (camp?.scheduleEnabled && getScheduledActiveState(camp) === false
          ? 'fuera de horario programado'
          : 'campaña desactivada')
      console.log(`\x1b[31m[SPAM-LOG]\x1b[0m Cancelando envío para ${target}: ${reason}.`)
      return false
    }
  } else {
    if (global.db.data.publicaciones?.[target]?.enabled === false) {
      console.log(`\x1b[31m[SPAM-LOG]\x1b[0m Cancelando envío para ${target}: Publicación desactivada.`);
      return false;
    }
  }

  if (!pub || (!pub.image && !pub.video)) {
    console.log(`\x1b[31m[SPAM-LOG]\x1b[0m ⚠️ Falta multimedia en pub de ${realGroupId}`)
    return false
  }
  
  try {
    
    let currentConn = conn;
    if (!currentConn || !currentConn.user) {
        currentConn = global.conn;
    }
    
    
    if (global.connState !== 'open') {
        console.log(`\x1b[33m[SPAM-LOG]\x1b[0m conexion inestable, esperando reconexión...`);
        const reconnected = await waitForConnection(25000);
        if (!reconnected) {
            console.log(`\x1b[31m[SPAM-LOG]\x1b[0m Sin conexión disponible, saltando grupo ${realGroupId}`);
            return false;
        }
        currentConn = global.conn;
    }

    const isVideo = pub.video || (pub.image && (pub.image.includes('.mp4') || pub.image.includes('.gif'))) || pub.imageType === 'video';

    
    console.log(`\x1b[36m[SPAM-LOG]\x1b[0m 📤 Enviando a ${groupName} (${realGroupId})`)
    
    if (currentConn && typeof currentConn.sendPresenceUpdate === 'function') {
      const presenceType = isVideo ? 'recording' : 'composing';
      const captionLen = (pub.text || '').length;
      // Tiempo de "escribiendo/grabando" realista para CADA publicación (no solo la 1ra).
      // Base 1.5s + ~25ms por carácter (tope 2.5s) + jitter aleatorio hasta 1.2s.
      const baseTyping = 1500 + Math.min(captionLen * 25, 2500);
      const typingTime = Math.floor(baseTyping + Math.random() * 1200);

      // Mantener el indicador "escribiendo" activo toda la espera: WhatsApp lo
      // expira a los pocos segundos, así que lo refrescamos cada ~1.5s.
      const presenceStart = Date.now();
      await currentConn.sendPresenceUpdate(presenceType, realGroupId).catch(() => {});
      while (Date.now() - presenceStart < typingTime) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (Date.now() - presenceStart < typingTime) {
          await currentConn.sendPresenceUpdate(presenceType, realGroupId).catch(() => {});
        }
      }
    } else {
      const typingTime = Math.floor(1500 + Math.random() * 1200);
      await new Promise(resolve => setTimeout(resolve, typingTime));
    }
    
    let mediaBuffer;
    const mediaPath = typeof pub.image === 'string' ? pub.image : '';
    
    // Soporte
    if (mediaPath) {
      let fullPath = mediaPath;
      
  
      // y la carpeta storage/images (o usuarios/X/images si es subbot)
      if (!path.isAbsolute(mediaPath)) {
        const isSubBot = process.env.IS_SUBBOT === 'true';
        const subBotNumber = process.env.SUBBOT_NUMBER;
        
        if (isSubBot && subBotNumber) {
          fullPath = path.join(process.cwd(), 'usuarios', subBotNumber, 'images', mediaPath);
        } else {
          fullPath = path.join(process.cwd(), 'storage', 'images', mediaPath);
        }
      }
      
      if (existsSync(fullPath)) {
        mediaBuffer = await fs.readFile(fullPath);
      } else if (mediaPath.length > 100) { // Fallback por si es base64
        mediaBuffer = Buffer.from(mediaPath, 'base64');
      }
    }
    
    if (!mediaBuffer) {
       console.log(`\x1b[31m[SPAM-LOG]\x1b[0m \u26a0\ufe0f No se pudo encontrar el archivo: ${mediaPath}`);
       return false;
    }
    
    let enviado = false;
    try {
      if (!currentConn || typeof currentConn.sendMessage !== 'function') {
        throw new Error('Socket no inicializado o sendMessage no es una función');
      }
      
      const sent = await currentConn.sendMessage(realGroupId, {
        [isVideo ? 'video' : 'image']: mediaBuffer,
        caption: pub.text || '',
        mentions: []
      }, { ephemeralExpiration: 86400, delay: 0 });

    
      enviado = true;
      if (!sent) {
        console.log(`\x1b[33m[SPAM-LOG]\x1b[0m Sin objeto de confirmación de Baileys pero el socket lo procesó para ${realGroupId}.`);
      }

    } catch (msgErr) {
       const mErr = msgErr.message || '';
       
       
       if (mErr.includes('ECONN') || mErr.includes('ETIMEDOUT') || mErr.includes('close') || mErr.toLowerCase().includes('rate')) {
          throw msgErr; 
       }
       
       
       console.log(`\x1b[31m[SPAM-LOG]\x1b[0m error para ${realGroupId}: ${mErr}`);
       throw msgErr; 
    }
    
    if (currentConn && typeof currentConn.sendPresenceUpdate === 'function') {
      await currentConn.sendPresenceUpdate('available', realGroupId).catch(() => {});
    }
    
    console.log(`\x1b[32m[SPAM-LOG]\x1b[0m ✅ ENVIADO EXITOSAMENTE a ${realGroupId}`)
    addSpamLog('success', `✅ Publicación enviada correctamente`, groupName);
    return true
  } catch (e) {
    const errorMsg = e.message || '';
    const errorStack = e.stack || '';
    
    
    

    const isForbidden = errorMsg.includes('403') || errorMsg.includes('Forbidden') || errorMsg.includes('not-in-group');
    const isRateLimit = errorMsg.includes('429') || errorMsg.includes('Rate') || errorMsg.toLowerCase().includes('rate');

    console.error(`\x1b[31m[SPAM-LOG]\x1b[0m ❌ ERROR en ${realGroupId} (Intento ${retryCount + 1}):`, errorMsg)
    
    if (isForbidden) {
      console.error(`\x1b[31m[SPAM-LOG]\x1b[0m ACCESO DENEGADO (Saca bot / Grupo Cerrado): ${realGroupId}. Cancelando reintentos.`);
      addSpamLog('error', `ACCESO DENEGADO: ${errorMsg}`, groupName);
      return 'STOP_TIMER';
    }

    if (isRateLimit && retryCount < maxRetries) {
      
      const waitTime = 4000; 
      console.log(`\x1b[33m[SPAM-LOG]\x1b[0m [!] Rate-limit en ${realGroupId}. Reintentando en ${waitTime/1000}s en cola secundaria...`);
      retryQueue.push({
        delay: waitTime,
        task: () => sendPublication(conn, target, pub, retryCount + 1)
      });
      
      setTimeout(() => processRetryQueue(), 100);
      return false; 
    }
    
    
    const isConnClosed = errorMsg.includes('Connection Closed') || errorMsg.includes('Connection closed') || 
                         errorMsg.includes('ECONNRESET') || errorMsg.includes('socket hang up');
    if (isConnClosed && retryCount < maxRetries) {
      console.log(`\x1b[33m[SPAM-LOG]\x1b[0m [!] Connection Closed en ${realGroupId} — esperando reconexión real...`);
      
      global.connState = 'connecting';
      const reconnected = await waitForConnection(60000); 
      if (!reconnected) {
        console.log(`\x1b[31m[SPAM-LOG]\x1b[0m ❌ No se pudo reconectar para ${realGroupId}, cancelando.`);
        addSpamLog('error', `❌ Sin conexión: ${errorMsg}`, groupName);
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      return sendPublication(global.conn, target, pub, retryCount + 1);
    }

    if (retryCount < maxRetries) {
      console.log(`\x1b[33m[SPAM-LOG]\x1b[0m [!] Reintentando ${realGroupId} en ${retryDelay/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return sendPublication(conn, target, pub, retryCount + 1);
    }
    addSpamLog('error', `❌ FALLÓ el envío: ${errorMsg}`, groupName);
    return false
  }
}

async function schedulePublication(conn, target, pub) {
  if (!conn) {
    console.error(`\x1b[31m[ERROR]\x1b[0m No hay conexión establecida para ${target}`);
    return false;
  }
  
  
  const { groupId } = parseCampaignTarget(target);

  
  const savedNextRun = global.db?.data?.timerState?.[target];
  clearTimer(target, true); 
  
  if (!pub.enabled || !pub.interval || !pub.publications || pub.publications.length === 0) {
    console.log(`\x1b[31m[SPAM-LOG]\x1b[0m Publicación desactivada para ${target}`);
    clearTimerState(target);
    return false;
  }
  
  console.log(`\x1b[32m[SPAM-LOG]\x1b[0m [!] Programando envío para ${target} cada ${intervalToText(pub.interval)}`);
  
  let isActive = true;

  
  const rescheduleNext = async () => {
    if (!isActive) return;
    const timerKey = getTimerKey(target);
    if (!activeTimers.has(timerKey)) return;
    const timerObj = activeTimers.get(timerKey);
    if (timerObj && timerObj.main) clearTimeout(timerObj.main);
    const nextRun = Date.now() + pub.interval;
    await saveTimerState(target, nextRun);
    const newTimer = setTimeout(sendAndReschedule, pub.interval);
    if (timerObj) timerObj.main = newTimer;
    const nextDate = new Date(nextRun).toLocaleString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    console.log(`\x1b[35m[TIMER]\x1b[0m ⏰ Próximo envío para ${target}: ${nextDate}`);
  };
  
  const sendAndReschedule = async () => {
    if (!isActive) return;
    
    if (groupLocks.get(target)) {
      console.log(`\x1b[33m[SPAM-LOG]\x1b[0m Ciclo previo aún activo para ${target}. Reprogramando sin enviar...`);
      
      await rescheduleNext();
      return;
    }

    groupLocks.set(target, true);

    try {
      
      
      const { campaignName, groupId: realGroupId } = parseCampaignTarget(target);
      let publications = [];

      if (campaignName) {
        const campaign = global.db.data.campaigns?.[campaignName];
        if (!campaign || !isCampaignEffectivelyEnabled(campaign) || !(campaign.groups || []).includes(realGroupId)) {
           console.log(`\x1b[31m[SPAM-LOG]\x1b[0m Deteniendo [${campaignName}] para ${realGroupId} (campaña pausada/eliminada/fuera de horario).`);
           clearTimer(target);
           isActive = false;
           return; // Stop total, campaña desactivada desde panel
        }

        // Solo pubs de ESTA carpeta — nunca mezclar con otras campañas.
        publications = getEnabledPubsForCampaign(realGroupId, campaignName);
        
      } else {
        const config = global.db.data.publicaciones?.[realGroupId];
        if (!config || !config.enabled) {
           console.log(`\x1b[31m[SPAM-LOG]\x1b[0m Spam desactivado para ${realGroupId}. Reprogramando de todas formas...`);
           
           await rescheduleNext();
           return;
        }
        publications = (config.publications || []).filter(p => p.enabled !== false);
      }

      if (!publications || publications.length === 0) {
        console.log(`\x1b[33m[SPAM-LOG]\x1b[0m Sin publicaciones activas para ${target}. Reprogramando...`);
        await rescheduleNext();
        return;
      }

      // ─── Ping activo: verifica que la conexión esté REALMENTE viva ───────────
      const connOk = await pingConnection(60000);
      if (!connOk) {
        console.log(`\x1b[31m[SPAM-LOG]\x1b[0m ❌ Sin conexión para iniciar ciclo de ${target}. Reprogramando...`);
        await rescheduleNext();
        return;
      }
      
      await new Promise(r => setTimeout(r, 500));
      const currentConn = global.conn;
      // ────────────────────────────────────────────────────────────────────────

      console.log(`\x1b[34m[SPAM-LOG]\x1b[0m 🚀 Iniciando ciclo: ${publications.length} pub(s) para ${target}`);
      
      let successCount = 0;
      let failureCount = 0;
      let stopTimer = false;

      
      for (const pubItem of publications) {
        if (!isActive || stopTimer) break;
        const result = await sendQueue.enqueue(() => sendPublication(currentConn, target, { ...pubItem }));
        if (result === 'STOP_TIMER') { stopTimer = true; break; }
        if (result === true) successCount++;
        else failureCount++;
      }

      if (stopTimer) {
        console.log(`\x1b[31m[SPAM-LOG]\x1b[0m [!] Bot expulsado de ${target}. Deteniendo permanentemente.`);
        isActive = false;
        clearTimer(target);
        return;
      }
      
      const groupName = (global.gruposDB.data.groups || []).find(g => g.id === realGroupId)?.name || realGroupId;
      const summary = `✅ ${successCount} enviadas${failureCount > 0 ? `, ❌ ${failureCount} fallidas` : ''}`;
      addSpamLog('info', `${summary}. Sig. ciclo en ${intervalToText(pub.interval)}`, groupName);
      console.log(`\x1b[32m[SPAM-LOG]\x1b[0m [!] ${summary} para ${target}`);
      
    
      await rescheduleNext();

    } catch (e) {
      console.error(`\x1b[31m[ERROR-SPAM]\x1b[0m Error en ${target}:`, e.message);
      
      await rescheduleNext();
    } finally {
      groupLocks.set(target, false);
    }
  };

  
  const timerKey = getTimerKey(target);
  
  
  let initialWait = pub.interval;
  const now = Date.now();
  if (savedNextRun) {
    const remaining = savedNextRun - now;
    if (remaining <= 0) {
      
      
      const margin = pub.interval * 0.1; 
      if (Math.abs(remaining) < margin || Math.abs(remaining) < 60000) {
        initialWait = 5000;
        const missedDate = new Date(savedNextRun).toLocaleString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
        console.log(`\x1b[33m[SISTEMA]\x1b[0m ⚡ ${target}: hora programada (${missedDate}) ya pasó o está cerca. Enviando en 5s...`);
      } else {
        
        const firstNextRun = now + initialWait;
        await saveTimerState(target, firstNextRun);
        const nextDate = new Date(firstNextRun).toLocaleString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
        console.log(`\x1b[33m[SISTEMA]\x1b[0m ⚠️ ${target}: tiempo guardado muy antiguo. Re-programando → ${nextDate}`);
      }
    } else {
      initialWait = remaining;
      const nextDate = new Date(savedNextRun).toLocaleString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
      console.log(`\x1b[36m[SISTEMA]\x1b[0m 🕐 ${target}: próximo envío restaurado → ${nextDate} (en ${Math.round(remaining/1000)}s)`);
    }
  } else {
    
    const firstNextRun = now + initialWait;
    await saveTimerState(target, firstNextRun);
    const nextDate = new Date(firstNextRun).toLocaleString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    console.log(`\x1b[36m[SISTEMA]\x1b[0m 🕐 ${target}: primer envío programado → ${nextDate}`);
  }

  const timer = setTimeout(sendAndReschedule, initialWait); 
  
  activeTimers.set(timerKey, { main: timer, monitor: null });
  
  const changeMonitor = setInterval(() => {
    if (!activeTimers.has(timerKey)) {
        clearInterval(changeMonitor);
        return;
    }

    
    

    let currentInterval;
    let isEnabled;
    const { campaignName: cName } = parseCampaignTarget(target);
    if (cName) {
        const camp = global.db.data.campaigns?.[cName];
        currentInterval = camp?.interval;
        isEnabled = isCampaignEffectivelyEnabled(camp);
    } else {
        currentInterval = global.db.data.publicaciones?.[target]?.interval;
        isEnabled = global.db.data.publicaciones?.[target]?.enabled;
    }

    
    if (isEnabled === false) {
        console.log(`\x1b[31m[SISTEMA]\x1b[0m Detectada PAUSA en panel para ${target}. Deteniendo.`);
        clearTimer(target);
        return;
    }

    if (currentInterval && currentInterval !== pub.interval) {
        console.log(`\x1b[35m[TEMPORIZADOR]\x1b[0m Detectado cambio de tiempo en panel para ${target} (${intervalToText(pub.interval)} -> ${intervalToText(currentInterval)}). Reiniciando ciclo...`);
        
        
        if (global.db?.data?.timerState) delete global.db.data.timerState[target];
        
        clearTimer(target, true); 
        
        const freshPub = { ...pub, interval: currentInterval };
        schedulePublication(conn, target, freshPub);
        return; 
    }
  }, 1000); 

  
  if (activeTimers.has(timerKey)) {
    activeTimers.get(timerKey).monitor = changeMonitor;
  }
  const existing = activeTimers.get(timerKey);
  if (existing) {
    existing.monitor = changeMonitor;
  } else {
    activeTimers.set(timerKey, { main: timer, monitor: changeMonitor });
  }
  
  return true;
};

const defaultPublication = () => ({
  enabled: false,
  image: '',
  text: '',
  imageType: '',
  interval: 0,
  savedBy: '',
  savedAt: '',
  activatedBy: '',
  activatedAt: '',
  timeSetBy: '',
  timeSetAt: ''
})

const ensureChatConfig = (chatId) => {
  if (!global.db.data.publicaciones) global.db.data.publicaciones = {}
  
  if (!global.db.data.publicaciones[chatId]) {
    global.db.data.publicaciones[chatId] = { publications: [], interval: 600000, enabled: false, activatedBy: '', activatedAt: '', deactivatedBy: '', deactivatedAt: '', timeSetBy: '', timeSetAt: '' }
  }
  
  const cfg = global.db.data.publicaciones[chatId]
  
  if (!Array.isArray(cfg.publications)) {
    cfg.publications = []
  }
  
  if (typeof cfg.interval !== 'number') {
    cfg.interval = 600000
  }
  
  if (typeof cfg.lastInterval !== 'number') {
    cfg.lastInterval = cfg.interval
  }
  
  global.db.data.publicaciones[chatId] = cfg
  return cfg
}

const intervalToText = (ms) => {
  const hours = Math.round(ms / 3600000)
  const minutes = Math.round(ms / 60000)
  const seconds = Math.round(ms / 1000)
  if (ms >= 3600000) return `${hours} hora${hours > 1 ? 's' : ''}`
  if (ms >= 60000) return `${minutes} minuto${minutes > 1 ? 's' : ''}`
  return `${seconds} segundo${seconds > 1 ? 's' : ''}`
}

const parseSlot = (args, pos = 1) => {
  const slot = args[pos - 1]?.toLowerCase()
  if (slot === 'all') return 'all'
  const slotNum = parseInt(slot)
  if (isNaN(slotNum) || slotNum < 1 || slotNum > MAX_SLOTS) return null
  return slotNum - 1 
}

const parseInterval = (timeStr) => {
  if (!timeStr) return { error: 'Debes especificar un intervalo de tiempo (ej: 5m, 30s, 1h)' }
  
  const num = parseFloat(timeStr)
  if (isNaN(num)) return { error: 'El tiempo debe ser un número válido' }
  
  if (timeStr.endsWith('s')) return { ms: num * 1000 }
  if (timeStr.endsWith('m')) return { ms: num * 60000 }
  if (timeStr.endsWith('h')) return { ms: num * 3600000 }
  
  return { ms: num * 60000 } 
}

const getSelectedGroups = (chatId) => {
  const groups = global.gruposDB.data.selectedGroups || []
  return groups.filter(groupId => {
    const exists = conn.chats && conn.chats[groupId];
    if (!exists) {
      console.log(`⚠️  Grupo ${groupId} ya no existe, eliminando de la selección`);
      return false;
    }
    return true;
  });
}

const getSelectedGroup = (chatId) => {
  const groups = getSelectedGroups(chatId);
  return groups.length > 0 ? groups[0] : null;
}

let handler = async (m, { conn, args, usedPrefix, isOwner }) => {
  try {
    if (m.isGroup) return
    if (!isOwner) {
      return conn.sendMessage(m.chat, { text: '❌ *Acceso denegado*: Solo los propietarios pueden usar este comando.' }, { quoted: m })
    }
    
    const [cmd, ...params] = args
    const subcmd = (params[0] || '').toLowerCase()
    
    const selectedGroups = getSelectedGroups(m.chat)
    const selectedGroup = selectedGroups.length > 0 ? selectedGroups[0] : null
  
  if (!cmd) {
    let help = `*Comandos de Publicación Automática*\n\n` +
      `• ${usedPrefix}publicg on - Activar publicación en grupos seleccionados\n` +
      `• ${usedPrefix}publicg off - Desactivar publicación en grupos seleccionados\n` +
      `• ${usedPrefix}publicg time <tiempo> - Establecer intervalo en grupos seleccionados\n` +
      `• ${usedPrefix}publicg status - Ver estado de grupos seleccionados\n` +
      `• ${usedPrefix}publicg all - Ver estado de todos los grupos seleccionados\n\n`
    
    if (selectedGroups.length > 0) {
      help += `✅ *Grupos seleccionados (${selectedGroups.length}):*\n`
      for (const groupId of selectedGroups) {
        const groupName = await conn.getName(groupId).catch(() => `Grupo ${groupId}`);
        help += `• ${groupName} (${groupId})\n`
      }
      help += `\nUsa ${usedPrefix}grupos para cambiar los grupos seleccionados.\n`
    } else {
      help += `⚠️ *No hay grupos seleccionados*\n`
      help += `Usa ${usedPrefix}grupos para ver la lista y seleccionar uno o más grupos.\n`
    }
    
    help += `\nEjemplo de uso:\n` +
      `${usedPrefix}publicg on\n` +
      `${usedPrefix}publicg time 30m\n`
    
    return conn.sendMessage(m.chat, { text: help }, { quoted: m })
  }
  
  if (['on', 'off'].includes(cmd)) {
    if (selectedGroups.length === 0) {
      return conn.sendMessage(m.chat, { 
        text: `❌ *Error*: No hay grupos seleccionados.\n\n` +
              `Usa ${usedPrefix}grupos para ver la lista de grupos y seleccionar uno o más.\n` +
              `Ejemplo: ${usedPrefix}grupos all - para seleccionar todos los grupos`
      }, { quoted: m })
    }
    
    const isOn = cmd === 'on';
    let successCount = 0;
    let resultMessage = `*Resultado de ${isOn ? 'activación' : 'desactivación'}*\n\n`;
    
    for (const groupId of selectedGroups) {
      try {
        const cfg = ensureChatConfig(groupId);
        const publications = cfg.publications;
        
        if (isOn) {
          if (!cfg.timeSetBy) {
            resultMessage += `❌ *${await conn.getName(groupId).catch(() => groupId)}*: Configura el tiempo con \`publicg time Xm\` primero\n`;
            continue;
          }
          
          if (publications.length === 0) {
            resultMessage += `❌ *${await conn.getName(groupId).catch(() => groupId)}*: No hay publicaciones guardadas\n`;
            continue;
          }
        }
        
        cfg.enabled = isOn;
        cfg[isOn ? 'activatedBy' : 'deactivatedBy'] = m.pushName || m.sender.split('@')[0];
        cfg[isOn ? 'activatedAt' : 'deactivatedAt'] = new Date().toISOString();
        
        if (isOn) {
          try {
            const groupInfo = await conn.groupMetadata(groupId).catch(() => {
              throw new Error('No se pudo acceder al grupo. Asegúrate de que el bot siga en el grupo.');
            });
            
            schedulePublication(conn, groupId, cfg);
            resultMessage += `✅ *${await conn.getName(groupId).catch(() => groupId)}*: Publicación activada (primera en ${intervalToText(cfg.interval)})\n`;
            successCount++;
            
          } catch (e) {
            console.error(`Error al activar en grupo ${groupId}:`, e);
            cfg.enabled = false;
            resultMessage += `❌ *${await conn.getName(groupId).catch(() => groupId)}*: Error al activar - ${e.message}\n`;
          }
        } else {
          clearTimer(groupId);
          resultMessage += `✅ *${await conn.getName(groupId).catch(() => groupId)}*: Publicación desactivada\n`;
          successCount++;
        }
      } catch (e) {
        console.error(`Error al procesar grupo ${groupId}:`, e);
        resultMessage += `❌ *${groupId}*: Error al procesar - ${e.message}\n`;
      }
    }
    
    await global.db.write();
    
    resultMessage += `\nTotal: ${successCount} grupos ${isOn ? 'activados' : 'desactivados'}.`;
    return conn.sendMessage(m.chat, { text: resultMessage }, { quoted: m });
  }
  
  if (cmd === 'time') {
    if (selectedGroups.length === 0) {
      return conn.sendMessage(m.chat, { 
        text: `❌ *Error*: No hay grupos seleccionados.\n\n` +
              `Usa ${usedPrefix}grupos para ver la lista de grupos y seleccionar uno o más.\n` +
              `Ejemplo: ${usedPrefix}grupos all - para seleccionar todos los grupos`
      }, { quoted: m })
    }
    
    if (!params[0]) {
      return conn.sendMessage(m.chat, { 
        text: `❌ *Error*: Debes especificar un intervalo de tiempo (ej: 5m, 30s, 1h).`
      }, { quoted: m })
    }
    
    const timeStr = params[0];
    const parsed = parseInterval(timeStr);
    
    if (parsed.error) {
      return conn.sendMessage(m.chat, { 
        text: `❌ *Error*: ${parsed.error}`
      }, { quoted: m })
    }
    
    let successCount = 0;
    let resultMessage = `*Resultado de cambio de intervalo a ${intervalToText(parsed.ms)}*\n\n`;
    
    for (const groupId of selectedGroups) {
      try {
        const cfg = ensureChatConfig(groupId);
        
        cfg.interval = parsed.ms;
        cfg.timeSetBy = m.pushName || m.sender.split('@')[0];
        cfg.timeSetAt = new Date().toISOString();
        
        if (cfg.enabled) {
          schedulePublication(conn, groupId, cfg);
        }
        
        const nextTime = new Date(Date.now() + parsed.ms).toLocaleString();
        resultMessage += `⏱ *${await conn.getName(groupId).catch(() => groupId)}*: Intervalo actualizado a ${intervalToText(parsed.ms)}\nPróxima publicación: ${nextTime}\n`;
        successCount++;
      } catch (e) {
        console.error(`Error al procesar grupo ${groupId}:`, e);
        resultMessage += `❌ *${groupId}*: Error al procesar - ${e.message}\n`;
      }
    }
    
    await global.db.write();
    
    resultMessage += `\nTotal: ${successCount} grupos actualizados.`;
    return conn.sendMessage(m.chat, { text: resultMessage }, { quoted: m });
  }
  
  if (cmd === 'status') {
    if (selectedGroups.length === 0) {
      return conn.sendMessage(m.chat, { 
        text: `❌ *Error*: No hay grupos seleccionados.\n\n` +
              `Usa ${usedPrefix}grupos para ver la lista de grupos y seleccionar uno o más.\n` +
              `Ejemplo: ${usedPrefix}grupos all - para seleccionar todos los grupos`
      }, { quoted: m })
    }
    
    let resultMessage = `*Estado de Publicaciones*\n\n`;
    
    for (const groupId of selectedGroups) {
      try {
        const cfg = ensureChatConfig(groupId);
        const publications = cfg.publications;
        const groupName = await conn.getName(groupId).catch(() => `Grupo ${groupId}`);
        
        resultMessage += `*📌 ${groupName}* (${groupId}):\n` +
                         `Estado: ${cfg.enabled ? '✅ Activado' : '❌ Desactivado'}\n` +
                         `Intervalo: ${intervalToText(cfg.interval)}\n` +
                         `Publicaciones: ${publications.length}\n`
        
        if (cfg.activatedBy) {
          resultMessage += `Activado por: ${cfg.activatedBy}\n`
          resultMessage += `Última activación: ${new Date(cfg.activatedAt).toLocaleString()}\n`
        }
        
        if (cfg.timeSetBy) {
          resultMessage += `⏰ Intervalo establecido por: ${cfg.timeSetBy}\n`
          resultMessage += `Último cambio: ${new Date(cfg.timeSetAt).toLocaleString()}\n`
        }
        
        if (publications.length > 0) {
          resultMessage += `📝 Última publicación guardada por: ${publications[publications.length - 1].savedBy}\n`
          resultMessage += `Fecha: ${new Date(publications[publications.length - 1].savedAt).toLocaleString()}\n`
          resultMessage += `Tipo: ${publications[publications.length - 1].imageType || 'Solo texto'}\n`
        } else {
          resultMessage += '⚠️ No hay publicaciones guardadas\n'
        }
        
        resultMessage += '\n';
      } catch (e) {
        console.error(`Error al obtener información del grupo ${groupId}:`, e);
        resultMessage += `❌ Error al cargar la información de ${groupId}\n\n`;
      }
    }
    
    return conn.sendMessage(m.chat, { text: resultMessage }, { quoted: m });
  }
  
  if (cmd === 'all') {
    if (!global.db.data.publicaciones) {
      return conn.sendMessage(m.chat, { text: 'No hay publicaciones configuradas.' }, { quoted: m })
    }
    
    let status = '*📋 Estado de todas las publicaciones*\n\n'
    
    if (selectedGroups.length > 0) {
      for (const groupId of selectedGroups) {
        try {
          const cfg = ensureChatConfig(groupId);
          const publications = cfg.publications;
          const groupName = await conn.getName(groupId).catch(() => `Grupo ${groupId}`);
          
          status += `*📌 ${groupName}* (${groupId}):\n` +
                    `  Estado: ${cfg.enabled ? '✅' : '❌'} | Intervalo: ${intervalToText(cfg.interval)} | Publicaciones: ${publications.length}`;
          
          if (cfg.enabled && cfg.activatedAt && publications.length > 0) {
            const nextTime = new Date(new Date(cfg.activatedAt).getTime() + cfg.interval).toLocaleString();
            status += ` | Próxima: ${nextTime}`;
          }
          
          status += '\n\n';
        } catch (e) {
          console.error(`Error al obtener información del grupo ${groupId}:`, e);
          status += `  ❌ Error al cargar la información de este grupo\n\n`;
        }
      }
      
      status += '✅ = Activado | ❌ = Desactivado | 📝 = Con publicación | 📭 = Vacío\n';
    } else {
      status += '⚠️ *No hay grupos seleccionados*\n\n';
      status += 'Usa los siguientes comandos para comenzar:\n';
      status += `1. ${usedPrefix}grupos - Ver y seleccionar grupos\n`;
      status += `2. ${usedPrefix}savep - Guardar una publicación\n`;
      status += `3. ${usedPrefix}publicg on - Activar publicaciones\n`;
      status += `4. ${usedPrefix}publicg time <tiempo> - Configurar intervalo\n`;
    }
    
    await conn.sendMessage(m.chat, { text: status }, { quoted: m });
    
  } else {
    return conn.sendMessage(m.chat, { 
      text: `❌ Comando no reconocido. Usa ${usedPrefix}publicg para ver la ayuda.` 
    }, { quoted: m })
  }
  
  } catch (e) {
    console.error('Error en publicg:', e)
    await conn.sendMessage(m.chat, { 
      text: '❌ *Error*: Ocurrió un error al configurar la publicación automática.' 
    }, { quoted: m })
    await global.db.write()
  }
}

if (typeof process !== 'undefined') {
  process.on('exit', () => {
    console.log('Limpiando todo...');
    clearAllTimers();
  });
  
  process.on('SIGINT', () => {
    clearAllTimers();
    process.exit(0);
  });
  
  process.on('uncaughtException', (err) => {
    console.error('⚠️  Error no manejado:', err);
    clearAllTimers();
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  Promesa rechazada no manejada:', reason);
  });
}

//handler.command = ['publicg', 'publicacion', 'spam']
handler.private = true




setInterval(async () => {
  if (!global.conn || !global.db || !global.db.data) return;

  const changed = syncAllCampaignSchedules(global.db)
  if (changed.length > 0) {
    for (const name of changed) {
      const camp = global.db.data.campaigns[name]
      const state = camp?.enabled ? 'ACTIVADA' : 'PAUSADA'
      const sched = camp?.scheduleEnabled ? ` (${camp.scheduleStart}–${camp.scheduleStop})` : ''
      console.log(`\x1b[35m[PROGRAMACIÓN]\x1b[0m Campaña "${name}" ${state} por horario${sched}`)
    }
    const writeFn = global.safeDbWrite || ((d) => d.write())
    await writeFn(global.db).catch(() => {})
  }

  const campaigns = global.db.data.campaigns || {}
  let weeklyFiredAny = false

  for (const campaignName of Object.keys(campaigns)) {
    const campaign = campaigns[campaignName]
    normalizeScheduleFields(campaign)

    // ── Modo WEEKLY: un envío completo a horas exactas (no intervalo) ──
    if (getSpamMode(campaign) === 'weekly') {
      // Limpiar timers de intervalo si quedaron de un modo auto previo
      for (const groupId of (campaign.groups || [])) {
        clearTimer(`${campaignName}:${groupId}`)
      }

      if (!isCampaignManuallyOn(campaign) || !(campaign.groups || []).length) continue

      const due = getDueWeeklySlots(campaign, new Date())
      if (due.length === 0) continue

      markWeeklySlotsFired(campaign, due)
      weeklyFiredAny = true
      const times = due.map((d) => d.time).join(', ')
      console.log(`\x1b[35m[SPAM PROGRAMADO]\x1b[0m [${campaignName}] disparo a las ${times}`)
      if (typeof global.manualSpamTrigger === 'function') {
        await global.manualSpamTrigger(campaignName, { force: true })
      }
      continue
    }

    // ── Modo AUTO: intervalo + ventana horaria (lógica original) ──
    const active = isCampaignEffectivelyEnabled(campaign)

    if (!active || !campaign.groups || campaign.groups.length === 0) {
      for (const groupId of (campaign.groups || [])) {
        clearTimer(`${campaignName}:${groupId}`);
      }
      continue;
    }

    const campaignGroups = campaign.groups;

    for (let i = 0; i < campaignGroups.length; i++) {
      const groupId = campaignGroups[i];
      const uniqueKey = `${campaignName}:${groupId}`;
      const timerKey = getTimerKey(uniqueKey);

      const campaignPubs = campaign.publications || []
      const hasOwnContent = campaignHasContent(groupId, campaignName) || (campaignPubs.filter(p => p.enabled !== false).length > 0);
      const hasContent = hasOwnContent && active;

      if (hasContent && !activeTimers.has(timerKey)) {

        const placeholder = { main: null, monitor: null, createdAt: Date.now() };
        activeTimers.set(timerKey, placeholder);

        const burstDelay = i * 200;

        // Solo contenido de ESTA campaña (aislamiento entre carpetas).
        const ownPubs = getEnabledPubsForCampaign(groupId, campaignName);
        const virtualCfg = {
          enabled: true,
          interval: campaign.interval || 600000,
          publications: ownPubs.length > 0 ? ownPubs : campaignPubs.filter(p => p.enabled !== false)
        }

        setTimeout(() => {
          if (!activeTimers.has(timerKey) || activeTimers.get(timerKey) !== placeholder) return;

          if (campaign && isCampaignEffectivelyEnabled(campaign)) {
            console.log(`\x1b[36m[SISTEMA]\x1b[0m Iniciando cronómetro de spam para [${campaignName}] en el grupo ${groupId} (${intervalToText(campaign.interval || 600000)})`);
            schedulePublication(global.conn, uniqueKey, virtualCfg);
          } else {
            activeTimers.delete(timerKey);
          }
        }, burstDelay);
      }
    }
  }

  if (weeklyFiredAny) {
    const writeFn = global.safeDbWrite || ((d) => d.write())
    await writeFn(global.db).catch(() => {})
  }
}, 10000);

setInterval(async () => {
  if (!global.db?.data?.campaigns) return
  const changed = syncAllCampaignSchedules(global.db)
  if (changed.length === 0) return
  for (const name of changed) {
    const camp = global.db.data.campaigns[name]
    const state = camp?.enabled ? 'ACTIVADA' : 'PAUSADA'
    console.log(`\x1b[35m[PROGRAMACIÓN]\x1b[0m Campaña "${name}" ${state} por horario (${camp?.scheduleStart}–${camp?.scheduleStop})`)
  }
  const writeFn = global.safeDbWrite || ((d) => d.write())
  await writeFn(global.db).catch(() => {})
}, 30000);

global.manualSpamTrigger = async (campaignName, { force = false } = {}) => {
    if (!global.db?.data) return;

    const connOk = await pingConnection(60000);
    if (!connOk) {
        console.log(`\x1b[31m[SPAM-LOG]\x1b[0m ❌ Manual cancelado: sin conexión WhatsApp para [${campaignName}]`);
        return;
    }

    await new Promise(r => setTimeout(r, 500));

    const prevForce = global.__forceSendCampaign
    // force / modo weekly: el flag debe vivir hasta que terminen los envíos en cola
    const campPreview = global.db.data.campaigns?.[campaignName]
    const needForce = force || getSpamMode(campPreview) === 'weekly'
    if (needForce) global.__forceSendCampaign = campaignName

    try {
        const campaign = global.db.data.campaigns?.[campaignName];
        if (!campaign || !campaign.groups) return;

        console.log(`\x1b[35m[SPAM-LOG]\x1b[0m Ejecutando spam MANUAL para [${campaignName}] en ${campaign.groups.length} grupos...`);

        const jobs = []
        for (let i = 0; i < campaign.groups.length; i++) {
            const groupId = campaign.groups[i];
            const uniqueKey = `${campaignName}:${groupId}`;

            const campaignPubs = campaign.publications || [];

            let publications = getEnabledPubsForCampaign(groupId, campaignName);
            if (publications.length === 0) {
                publications = campaignPubs.filter(p => p.enabled !== false);
            }

            if (publications.length > 0) {
                if (groupLocks.get(uniqueKey)) {
                    console.log(`\x1b[33m[SPAM-LOG]\x1b[0m [!] Manual omite ${uniqueKey} (ciclo auto en curso)`);
                    continue;
                }
                groupLocks.set(uniqueKey, true);
                const items = publications.map(p => ({ ...p }));
                jobs.push(sendQueue.enqueue(async () => {
                    try {
                        for (const itemToProcess of items) {
                            await sendPublication(global.conn, uniqueKey, itemToProcess);
                        }
                    } finally {
                        groupLocks.set(uniqueKey, false);
                    }
                }).catch(e => { groupLocks.set(uniqueKey, false); console.error('[MANUAL-ERR]', e); }))
            }
        }
        if (jobs.length) await Promise.all(jobs)
        console.log(`\x1b[35m[SPAM-LOG]\x1b[0m Manual encolado. Pendientes en queue: ${sendQueue.pending}`);
    } catch (e) {
        console.error('Error en manualSpamTrigger:', e);
    } finally {
        if (needForce) {
            global.__forceSendCampaign = prevForce && prevForce !== campaignName ? prevForce : null
        }
    }
};

export default handler
