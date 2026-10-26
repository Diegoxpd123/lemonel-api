import { Hono } from 'hono'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db.js'
import { abrirSesion, cerrarSesion, comparar, hash, limitarLogin, registrarIntento, requiereAdmin, sesionActual, type Sesion } from '../auth.js'
import { parse } from '../util.js'

export const auth = new Hono<{ Variables: { admin: Sesion } }>()

const login = z.object({ email: z.string().trim().toLowerCase().email('Correo inválido'), password: z.string().min(1, 'Escribe tu contraseña') })

auth.post('/login', async (c) => {
  const body = parse(login, await c.req.json().catch(() => ({})))
  const clave = `${c.req.header('x-forwarded-for') ?? 'local'}|${body.email}`
  limitarLogin(clave)
  const admin = await db.admin.findUnique({ where: { email: body.email } })
  const ok = admin ? await comparar(body.password, admin.passwordHash) : false
  registrarIntento(clave, ok)
  if (!admin || !ok) throw new HTTPException(401, { message: 'Correo o contraseña incorrectos' })
  const s = { id: admin.id, email: admin.email, nombre: admin.nombre }
  await abrirSesion(c, s)
  return c.json(s)
})

auth.post('/logout', (c) => {
  cerrarSesion(c)
  return c.json({ ok: true })
})

auth.get('/me', async (c) => {
  const s = await sesionActual(c)
  if (!s) throw new HTTPException(401, { message: 'Sin sesión' })
  return c.json(s)
})

const cambio = z.object({
  actual: z.string().min(1, 'Escribe tu contraseña actual'),
  nueva: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres').max(100),
})

auth.post('/password', requiereAdmin, async (c) => {
  const body = parse(cambio, await c.req.json().catch(() => ({})))
  const s = c.get('admin')
  const admin = await db.admin.findUnique({ where: { id: s.id } })
  if (!admin || !(await comparar(body.actual, admin.passwordHash))) throw new HTTPException(400, { message: 'La contraseña actual no es correcta' })
  await db.admin.update({ where: { id: s.id }, data: { passwordHash: await hash(body.nueva) } })
  return c.json({ ok: true })
})
