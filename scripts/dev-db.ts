import EmbeddedPostgres from 'embedded-postgres'
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve('.pgdata')
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'lemonel', password: 'lemonel', port: 5433, persistent: true })

if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise()
await pg.start()

try {
  await pg.createDatabase('lemonel')
} catch {
  console.log('La base lemonel ya existía')
}

console.log('PostgreSQL local listo en postgresql://lemonel:lemonel@localhost:5433/lemonel')

const cerrar = async () => {
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', cerrar)
process.on('SIGTERM', cerrar)
setInterval(() => {}, 1 << 30)
