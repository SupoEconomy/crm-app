console.log('⧉ Inicializando BOT SPAM...')

import { join, dirname } from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { setupMaster, fork } from 'cluster'
import { watchFile, unwatchFile } from 'fs'
import cfonts from 'cfonts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(__dirname)

cfonts.say('BOT\nSPAM\nULTRA', {
  font: 'block',
  align: 'center',
  gradient: ['blue', 'green'],
  transitionGradient: true
})

cfonts.say('Multi Device - Android and PC.', {
  font: 'simple',
  align: 'center',
  gradient: ['green', 'blue'],
  transitionGradient: true
})


let isWorking = false

async function launch(scripts) {
  if (isWorking) return
  isWorking = true

  for (const script of scripts) {
    const args = [join(__dirname, script), ...process.argv.slice(2)]

    setupMaster({
      exec: args[0],
      args: args.slice(1),
    })

    let child = fork()

    child.on('message', (msg) => {
      if (msg === 'reset') {
        console.log('[SISTEMA] Petición de reinicio TOTAL recibida.')
        child.kill('SIGKILL') // Forzamos la muerte del proceso hijo
        process.exit(1)       // Matamos al padre, para que el sistema operativo o el reinicio de node lo levante todo
      }
    })

    child.on('exit', (code) => {
      isWorking = false
      if (code !== 0) {
        console.log('Reiniciando proceso...')
        setTimeout(() => launch(scripts), 2000)
      }

      watchFile(args[0], () => {
        unwatchFile(args[0])
        launch(scripts)
      })
    })
  }
}

launch(['main.js'])