import fs from 'fs/promises'
import path from 'path'
import { getImagesPath, resolveSavedImagePath, safeDeletePublicationImage } from '../lib/image-storage.js'

const defaultPublication = () => ({
  enabled: false,
  image: '',
  text: '',
  imageType: '',
  interval: 600000,
  savedBy: '',
  savedAt: '',
  activatedBy: '',
  activatedAt: '',
  timeSetBy: '',
  timeSetAt: ''
})

const imageStorageOpts = () => ({
  isSubBot: process.env.IS_SUBBOT === 'true',
  subBotNumber: process.env.SUBBOT_NUMBER || null,
})

const ensureChatConfig = (chatId) => {
  if (!global.db.data.publicaciones) global.db.data.publicaciones = {}
  
  if (!global.db.data.publicaciones[chatId]) {
    global.db.data.publicaciones[chatId] = { publications: [], interval: 600000, enabled: false }
  }
  
  const cfg = global.db.data.publicaciones[chatId]
  
  if (!Array.isArray(cfg.publications)) {
    cfg.publications = []
  }
  
  if (typeof cfg.interval !== 'number') {
    cfg.interval = 600000
  }
  
  if (typeof cfg.enabled !== 'boolean') {
    cfg.enabled = false
  }
  
  global.db.data.publicaciones[chatId] = cfg
  return cfg
}

const getSelectedGroups = (chatId) => {
  const groups = global.gruposDB.data.selectedGroups || [];
  return [...groups];
}

const formatPublicationList = (publications, startIndex = 1) => {
  if (!publications || publications.length === 0) {
    return '📭 *No hay publicaciones guardadas*';
  }
  
  let list = '📋 *Lista de Publicaciones*\n\n';
  publications.forEach((pub, index) => {
    const num = startIndex + index;
    const status = pub.enabled !== false ? '✅' : '❌';
    const type = pub.imageType === 'video' ? '🎥' : pub.imageType === 'image' ? '🖼️' : '📝';
    const textPreview = pub.text ? pub.text.substring(0, 50) + (pub.text.length > 50 ? '...' : '') : 'Sin texto';
    const savedBy = pub.savedBy || 'Desconocido';
    const savedDate = pub.savedAt ? new Date(pub.savedAt).toLocaleDateString() : 'Fecha desconocida';
    
    list += `${num}. ${status} ${type} ${textPreview}\n`;
    list += `   👤 Guardado por: ${savedBy}\n`;
    list += `   📅 Fecha: ${savedDate}\n\n`;
  });
  
  return list;
}

const deletePublication = async (groupId, publicationIndex) => {
  if (!global.db.data.publicaciones) return false;
  
  const cfg = global.db.data.publicaciones[groupId];
  if (!cfg || !cfg.publications) return false;
  
  if (publicationIndex < 0 || publicationIndex >= cfg.publications.length) return false;
  
  const deletedPub = cfg.publications[publicationIndex];
  
  if (deletedPub.image) {
    await safeDeletePublicationImage(deletedPub.image, imageStorageOpts())
  }
  
  cfg.publications.splice(publicationIndex, 1);
  
  if (cfg.publications.length === 0) {
    cfg.enabled = false;
  }
  
  return true;
}

let handler = async (m, { conn, usedPrefix, isOwner, args }) => {
  try {
    if (m.isGroup) {
      return conn.sendMessage(m.chat, { 
        text: '⚠️ Por favor, usa este comando en el chat privado con el bot.'
      }, { quoted: m })
    }
    
    if (!isOwner) {
      return conn.sendMessage(m.chat, { 
        text: '❌ *Acceso denegado*: Solo los propietarios pueden usar este comando.'
      }, { quoted: m })
    }
    
    const selectedGroups = getSelectedGroups(m.chat);
    if (selectedGroups.length === 0) {
      return conn.sendMessage(m.chat, { 
        text: `❌ *Error*: No hay grupos seleccionados.\n\n` +
              `Usa ${usedPrefix}grupos para ver la lista de grupos y seleccionar uno o más.\n` +
              `Ejemplo: ${usedPrefix}grupos all - para seleccionar todos los grupos`
      }, { quoted: m });
    }
    
    if (args[0] === 'public') {
      await global.loadDatabase?.()
      
      let allPublications = [];
      let startIndex = 1;
      
      for (const groupId of selectedGroups) {
        const cfg = global.db.data.publicaciones?.[groupId];
        if (cfg && cfg.publications && cfg.publications.length > 0) {
          const groupName = await conn.getName(groupId).catch(() => `Grupo ${groupId}`);
          
          const validPublications = [];
          for (const pub of cfg.publications) {
            if (pub) {
              if (pub.image) {
                try {
                  const imagePath = resolveSavedImagePath(pub.image, imageStorageOpts())
                  if (imagePath) {
                    validPublications.push(pub);
                  } else {
                    throw new Error('Ruta de imagen inválida')
                  }
                } catch (e) {
                  console.log(`⚠️ Publicación con archivo eliminado, omitiendo: ${pub.image}`);
                  const pubIndex = cfg.publications.indexOf(pub);
                  if (pubIndex > -1) {
                    cfg.publications.splice(pubIndex, 1);
                    console.log(`🗑️ Publicación eliminada de la base de datos (archivo no encontrado)`);
                  }
                }
              } else {
                validPublications.push(pub);
              }
            }
          }
          
          if (validPublications.length > 0) {
            allPublications.push({
              groupId,
              groupName,
              publications: validPublications
            });
          }
        }
      }
      
      if (allPublications.length === 0 || allPublications.some(p => p.publications.length === 0)) {
        await (global.safeDbWrite?.(global.db) ?? global.db.write());
      }
      
      if (allPublications.length === 0) {
        return conn.sendMessage(m.chat, { 
          text: '📭 *No hay publicaciones guardadas en ningún grupo seleccionado.*\n\n' +
                `Usa ${usedPrefix}savep respondiendo a un mensaje con imagen/video para guardar una publicación.`
        }, { quoted: m });
      }
      
      let message = `📋 *Tus Publicaciones Guardadas (${selectedGroups.length} grupos)*\n\n`;
      
      for (const groupData of allPublications) {
        message += `📌 *${groupData.groupName}* (${groupData.groupId}):\n`;
        message += `${groupData.publications.length} publicación(es)\n\n`;
      }
      
      message += `💡 *Para eliminar una publicación:*\n`;
      message += `${usedPrefix}savep del <número>\n`;
      message += `Ejemplo: ${usedPrefix}savep del 4`;
      
      await conn.sendMessage(m.chat, { text: message }, { quoted: m });
      
      let pubCounter = 1;
      
      for (const groupData of allPublications) {
        const { groupId, groupName, publications } = groupData;
        
        for (const pub of publications) {
          try {
            let messageContent = {
              text: `🔢 *Publicación #${pubCounter}*\n📌 *Grupo:* ${groupName}\n\n${pub.text || ''}`
            };
            
            if (pub.image && pub.imageType) {
              try {
                const imagePath = resolveSavedImagePath(pub.image, imageStorageOpts())
                let mediaBuffer = null
                if (imagePath) {
                  mediaBuffer = await fs.readFile(imagePath);
                }
                
                if (!mediaBuffer) throw new Error('No se pudo leer el archivo multimedia')
                
                if (pub.imageType === 'video') {
                  messageContent = {
                    video: mediaBuffer,
                    caption: `🔢 *Publicación #${pubCounter}*\n📌 *Grupo:* ${groupName}\n\n${pub.text || ''}`
                  };
                } else {
                  messageContent = {
                    image: mediaBuffer,
                    caption: `🔢 *Publicación #${pubCounter}*\n📌 *Grupo:* ${groupName}\n\n${pub.text || ''}`
                  };
                }
              } catch (e) {
                console.log(`⚠️ No se pudo leer el archivo: ${e.message}`);
                messageContent = {
                  text: `🔢 *Publicación #${pubCounter}* 📎\n📌 *Grupo:* ${groupName}\n\n${pub.text || ''}\n\n⚠️ No se pudo cargar el archivo multimedia`
                };
              }
            }
            
            await conn.sendMessage(m.chat, messageContent);
            console.log(`✅ Publicación #${pubCounter} enviada a ${m.sender.split('@')[0]}`);
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } catch (e) {
            console.error(`❌ Error al enviar publicación #${pubCounter} a ${m.sender}:`, e);
          }
          
          pubCounter++;
        }
      }
      
      const finalMessage = `✅ *Revisión completada*\n\n` +
        `📊 Total publicaciones revisadas: ${pubCounter - 1}\n` +
        `Grupos: ${selectedGroups.length}\n\n` +
        `💡 Ahora puedes eliminar cualquier publicación con:\n` +
        `${usedPrefix}savep del <número>\n` +
        `Ejemplo: ${usedPrefix}savep del 4`;
      
      return conn.sendMessage(m.chat, { text: finalMessage }, { quoted: m });
    }
    
    if (args[0] === 'del' && args[1]) {
      
      const pubNumber = parseInt(args[1]);
      if (isNaN(pubNumber) || pubNumber < 1) {
        return conn.sendMessage(m.chat, { 
          text: '❌ *Error*: Debes especificar un número válido.\n\n' +
                `Ejemplo: ${usedPrefix}savep del 4`
        }, { quoted: m });
      }
      
      let allPublications = [];
      let pubCounter = 1;
      let targetPub = null;
      let targetGroup = null;
      let targetIndex = -1;
      
      for (const groupId of selectedGroups) {
        const cfg = global.db.data.publicaciones?.[groupId];
        if (cfg && cfg.publications && cfg.publications.length > 0) {
          for (let i = 0; i < cfg.publications.length; i++) {
            const pub = cfg.publications[i];
            
            if (pub) {
              if (pub.image) {
                try {
                  const imagePath = resolveSavedImagePath(pub.image, imageStorageOpts())
                  if (!imagePath) throw new Error('Ruta de imagen inválida')
                  if (pubCounter === pubNumber) {
                    targetPub = pub;
                    targetGroup = groupId;
                    targetIndex = i;
                    break;
                  }
                  pubCounter++;
                } catch (e) {
                  console.log(`⚠️ Eliminando publicación con archivo faltante durante búsqueda: ${pub.image}`);
                  cfg.publications.splice(i, 1);
                  i--;
                }
              } else {
                if (pubCounter === pubNumber) {
                  targetPub = pub;
                  targetGroup = groupId;
                  targetIndex = i;
                  break;
                }
                pubCounter++;
              }
            }
          }
          if (targetPub) break;
        }
      }
      
      await (global.safeDbWrite?.(global.db) ?? global.db.write());
      
      if (!targetPub) {
        return conn.sendMessage(m.chat, { 
          text: `❌ *Error*: No se encontró la publicación #${pubNumber}.\n\n` +
                `Usa ${usedPrefix}savep public para ver la lista de publicaciones disponibles.`
        }, { quoted: m });
      }
      
      const success = await deletePublication(targetGroup, targetIndex);
      
      if (success) {
        await (global.safeDbWrite?.(global.db) ?? global.db.write());
        const groupName = await conn.getName(targetGroup).catch(() => `Grupo ${targetGroup}`);
        const typeText = targetPub.imageType === 'video' ? 'video' : targetPub.imageType === 'image' ? 'imagen' : 'texto';
        
        return conn.sendMessage(m.chat, { 
          text: `✅ *Publicación eliminada correctamente*\n\n` +
                `Grupo: ${groupName}\n` +
                `Número: #${pubNumber}\n` +
                `Tipo: ${typeText}\n` +
                `Texto: ${targetPub.text ? targetPub.text.substring(0, 50) + (targetPub.text.length > 50 ? '...' : '') : 'Sin texto'}\n\n` +
                `Usa ${usedPrefix}savep public para ver la lista actualizada.`
        }, { quoted: m });
      } else {
        return conn.sendMessage(m.chat, { 
          text: `❌ *Error*: No se pudo eliminar la publicación #${pubNumber}.`
        }, { quoted: m });
      }
    }
    
    if (!m.quoted) {
      const help = `📝 *Guardar Publicación*\n\n` +
        `*Comandos disponibles:*\n` +
        `• ${usedPrefix}savep - Guardar publicación (responde a un mensaje)\n` +
        `• ${usedPrefix}savep public - Ver lista de publicaciones\n` +
        `• ${usedPrefix}savep del <número> - Eliminar publicación\n\n` +
        `*Uso básico:*\n` +
        `1. Selecciona grupos con: ${usedPrefix}grupos\n` +
        `2. Responde a un mensaje con: ${usedPrefix}savep\n\n` +
        `*Nota:* La publicación se guardará en todos los grupos seleccionados.`
      
      return conn.sendMessage(m.chat, { text: help }, { quoted: m })
    }
    
    if (!m.quoted.mimetype || !m.quoted.mimetype.startsWith('image') && !m.quoted.mimetype.startsWith('video')) {
      return conn.sendMessage(m.chat, { 
        text: '❌ *Error*: El mensaje debe contener una imagen o video.'
      }, { quoted: m });
    }
    
    const text = m.quoted.caption || m.quoted.text || '';
    const savedBy = m.pushName || m.sender.split('@')[0];
    const savedAt = new Date().toISOString();
    
    let successCount = 0;
    const results = [];
    
    for (const groupId of selectedGroups) {
      try {
        const cfg = ensureChatConfig(groupId);
        const groupName = await conn.getName(groupId).catch(() => `Grupo ${groupId}`);
        
        let imageBuffer;
        let imageType = m.quoted.mimetype.startsWith('video') ? 'video' : 'image';
        
        try {
          imageBuffer = await m.quoted.download();
        } catch (e) {
          console.error('Error al descargar el archivo:', e);
          results.push({
            groupId,
            success: false,
            error: 'No se pudo descargar el archivo'
          });
          continue;
        }
        
        const extension = imageType === 'video' ? '.mp4' : '.png'
        const timestamp = Date.now()
        const randomSuffix = Math.random().toString(36).substring(2)
        const safeName = savedBy.replace(/[^a-zA-Z0-9]/g, '_')
        const fileName = `${timestamp}_${randomSuffix}_wa_${safeName}_${groupId.split('@')[0].substring(0, 8)}${extension}`
        const imageDir = getImagesPath(
          process.env.IS_SUBBOT === 'true',
          process.env.SUBBOT_NUMBER || null
        )
        const filePath = path.join(imageDir, fileName)
        
        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true })
          await fs.writeFile(filePath, imageBuffer)
        } catch (e) {
          console.error(`Error al guardar archivo para grupo ${groupId}:`, e);
          results.push({
            groupId,
            success: false,
            error: 'No se pudo guardar el archivo'
          });
          continue;
        }
        
        cfg.publications.push({
          image: fileName,
          text: text,
          imageType: imageType,
          savedBy: savedBy,
          savedAt: savedAt,
          enabled: true
        });
        
        results.push({
          groupName,
          success: true
        });
        
        successCount++;
        console.log(`✅ Publicación guardada para ${groupName} con archivo: ${fileName}`);
        
      } catch (e) {
        console.error(`Error al guardar en grupo ${groupId}:`, e);
        results.push({
          groupId,
          success: false,
          error: e.message
        });
      }
    }
    
    await (global.safeDbWrite?.(global.db) ?? global.db.write());
    
    let resultMessage = `✅ *Publicación guardada en ${successCount} grupo(s)*\n\n`;
    
    results.forEach(result => {
      if (result.success) {
        resultMessage += `✅ *${result.groupName}*\n`;
      } else {
        resultMessage += `❌ *${result.groupId}*: ${result.error || 'Error desconocido'}\n`;
      }
    });
    
    resultMessage += `\nUsa ${usedPrefix}publicg on para activar las publicaciones.`;
    
    return conn.sendMessage(m.chat, { text: resultMessage }, { quoted: m });
  } catch (e) {
    console.error('Error en savep:', e)
    return conn.sendMessage(m.chat, {
      text: '❌ *Error*: Ocurrió un error al guardar la publicación.\n' +
            'Por favor, verifica que el mensaje contenga una imagen o video e inténtalo de nuevo.'
    }, { quoted: m })
  }
}

//handler.command = ['savep', 'savepublicacion']
handler.admin = true

export default handler
