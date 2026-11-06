const listGroups = async (conn) => {
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
          const all = Object.values(groupData || {}).filter(g => g && g.id && g.id.endsWith('@g.us'));
          
          
          
          const communities = all
            .filter(g => g.isCommunity === true || g.isParentGroup === true || g.id.includes('community'))
            .map(g => ({ id: g.id, name: g.subject || g.id }));
          
          
          if (global.db?.data) {
            global.db.data.communities = communities;
            global.db.write?.().catch(() => {});
          }
          
          return all
            .filter(g => {
              
              if (g.isCommunity === true || g.isParentGroup === true || g.id.includes('community')) return false;
            
              const name = (g.subject || '').toLowerCase();
              if (name.includes('community') || name.includes('comunidad')) {
              
                 if (!g.linkedParent) return false;
              }
              return true;
            })
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
      try {
        const result = await source();
        if (result && result.length > 0) {
          groups = [...groups, ...result];
          break; 
        }
      } catch (e) {
        console.error('Error al obtener grupos:', e);
      }
    }
    
    const uniqueGroups = [...new Map(groups.map(g => [g.id, g])).values()]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    return uniqueGroups.map((g, i) => ({
      index: i + 1,
      id: g.id,
      name: g.name || `Grupo ${i + 1}`
    }));
    
  } catch (e) {
    console.error('Error al listar grupos:', e);
    return [];
  }
};

const getGroupById = async (conn, groupId) => {
  try {
    const groups = await listGroups(conn);
    return groups.find(g => g.id === groupId || g.index === parseInt(groupId));
  } catch (e) {
    console.error('Error al obtener grupo por ID:', e);
    return null;
  }
};

const handleGroupSelection = (chatId, groupId, operation = 'toggle') => {
  const selectedGroups = global.gruposDB.data.selectedGroups || []
  
  if (operation === 'add') {
    if (!selectedGroups.includes(groupId)) {
      selectedGroups.push(groupId)
      global.gruposDB.data.selectedGroups = selectedGroups
      return { added: true, count: selectedGroups.length }
    }
    return { added: false, count: selectedGroups.length }
  } else if (operation === 'remove') {
    const initialCount = selectedGroups.length
    global.gruposDB.data.selectedGroups = selectedGroups.filter(id => id !== groupId)
    return { removed: initialCount !== global.gruposDB.data.selectedGroups.length, count: global.gruposDB.data.selectedGroups.length }
  } else if (operation === 'clear') {
    const count = selectedGroups.length
    global.gruposDB.data.selectedGroups = []
    return { cleared: true, count }
  } else if (operation === 'all') {
    return { all: true }
  }
  
  const index = selectedGroups.indexOf(groupId)
  if (index === -1) {
    selectedGroups.push(groupId)
    global.gruposDB.data.selectedGroups = selectedGroups
    return { added: true, count: selectedGroups.length }
  } else {
    selectedGroups.splice(index, 1)
    global.gruposDB.data.selectedGroups = selectedGroups
    return { removed: true, count: selectedGroups.length }
  }
};

const handler = async (m, { conn, isOwner, usedPrefix, command, args }) => {
  if (!isOwner) return m.reply('❌ Solo el propietario puede usar este comando');
  
  const chatId = m.chat;
  const groups = await listGroups(conn);
  
  if (!args[0]) {
    let message = '📋 *Lista de Grupos*\n\n';
    
    const selectedGroups = global.gruposDB.data.selectedGroups || [];
    
    groups.forEach((group, index) => {
      const isSelected = selectedGroups.includes(group.id);
      message += `${index + 1}. ${isSelected ? '✅' : '⬜'} ${group.name || 'Sin nombre'} (${group.id})\n`;
    });
    
    message += '\n*Comandos:*\n';
    message += `• ${usedPrefix}grupos +N - Agregar grupo N\n`;
    message += `• ${usedPrefix}grupos -N - Quitar grupo N\n`;
    message += `• ${usedPrefix}grupos +1 +2 -3 - Múltiples operaciones\n`;
    message += `• ${usedPrefix}grupos all - Seleccionar todos\n`;
    message += `• ${usedPrefix}grupos clear - Limpiar selección\n`;
    message += `\nGrupos seleccionados: ${selectedGroups.length}/${groups.length}`;
    
    return m.reply(message);
  }
  
  let results = []
  let processedArgs = new Set()
  
  if (args.includes('all')) {
    const allGroupIds = groups.map(g => g.id)
    global.db.data.publicaciones[chatId] = global.db.data.publicaciones[chatId] || {}
    global.db.data.publicaciones[chatId].selectedGroups = [...new Set(allGroupIds)]
    results.push(`✅ *${allGroupIds.length} grupos* han sido seleccionados`)
    processedArgs.add('all')
  }
  
  if (args.includes('clear')) {
    const result = handleGroupSelection(chatId, null, 'clear');
    results.push(`✅ Selección de grupos limpiada (${result.count} eliminados)`);
    processedArgs.add('clear');
  }
  
  
  for (const arg of args) {
    if (processedArgs.has(arg)) continue;
    
    const match = arg.match(/^([+-]?)(\d+)$/);
    if (match) {
      const [_, op, num] = match;
      const index = parseInt(num) - 1;
      
      if (index < 0 || index >= groups.length) {
        results.push(`❌ Número ${num} inválido (1-${groups.length})`);
        continue;
      }
      
      const group = groups[index];
      let result;
      
      if (op === '+') {
        result = handleGroupSelection(chatId, group.id, 'add');
        if (result.added) {
          results.push(`✅ +${num} "${group.name || group.id}" agregado`);
        } else {
          results.push(`ℹ️ +${num} ya estaba seleccionado`);
        }
      } else if (op === '-') {
        result = handleGroupSelection(chatId, group.id, 'remove');
        if (result.removed) {
          results.push(`❌ -${num} "${group.name || group.id}" eliminado`);
        } else {
          results.push(`ℹ️ -${num} no estaba seleccionado`);
        }
      } else {
        result = handleGroupSelection(chatId, group.id);
        if (result.added) {
          results.push(`✅ ${num} "${group.name || group.id}" agregado`);
        } else {
          results.push(`❌ ${num} "${group.name || group.id}" eliminado`);
        }
      }
    } else {
      results.push(`❌ Argumento "${arg}" no reconocido`);
    }
  }
  
  if (results.length === 0) {
    return m.reply(`❌ No se procesaron argumentos válidos. Usa ${usedPrefix}grupos sin argumentos para ver la ayuda.`);
  }
  
  const finalCount = (global.gruposDB.data.selectedGroups || []).length;
  results.push(`\n📊 Total seleccionados: ${finalCount}/${groups.length}`);
  
  await (global.safeGruposWrite?.(global.gruposDB) ?? global.gruposDB.write());
  return m.reply(results.join('\n'));
};

const getSelectedGroups = (chatId) => {
  if (!global.db.data.publicaciones?.[chatId]?.selectedGroups) {
    return [];
  }
  return [...global.db.data.publicaciones[chatId].selectedGroups];
};

handler.command = ['grupos'];
handler.private = true;

export { listGroups, getGroupById, getSelectedGroups, handleGroupSelection };

export default handler;
