import { watchFile, unwatchFile } from 'fs' 
import chalk from 'chalk'
import { fileURLToPath } from 'url'

global.owner = [
  ['51901437507', 'Sunkovv', true],
  ['aca pon tu numero dentro', 'un nombre', true],
]


global.ownerLid = [
  ['114263544885392', 'Sunkovv', true],
//  ['idLiD', 'UN NOMBRE', true],
 
]

global.sessions = 'Sessions'
global.bot = 'Serbot' 
global.AFBots = true

global.packname = ''
global.namebot = ''
global.author = ''
global.moneda = 'USD'


global.canal = ''

global.ch = {
ch1: '',
}

global.mods =   []
global.prems = []

global.multiplier = 69 
global.maxwarn = '2'


global.autoRead = false

let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
  unwatchFile(file)
  console.log(chalk.redBright("Update 'config.js'"))
  import(`${file}?update=${Date.now()}`)
})
