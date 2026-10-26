import { serve } from '@hono/node-server'
import { app } from './app.js'
import { env } from './env.js'
import { db } from './db.js'
import { hash } from './auth.js'
import { asegurarCarpetas } from './files.js'

const prepararAdmin = async () => {
  const total = await db.admin.count()
  if (total > 0) return
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.warn('No hay administradores. Define ADMIN_EMAIL y ADMIN_PASSWORD para crear el primero.')
    return
  }
  await db.admin.create({
    data: { email: env.ADMIN_EMAIL.toLowerCase(), nombre: env.ADMIN_NAME, passwordHash: await hash(env.ADMIN_PASSWORD) },
  })
  console.log(`Administrador creado: ${env.ADMIN_EMAIL}`)
}

await asegurarCarpetas()
await prepararAdmin()

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Lemonel API escuchando en el puerto ${info.port}`)
})
