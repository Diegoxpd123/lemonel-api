import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { serveStatic } from '@hono/node-server/serve-static'
import fs from 'node:fs'
import path from 'node:path'
import { env } from './env.js'
import { auth } from './routes/auth.js'
import { publico } from './routes/public.js'
import { productos } from './routes/productos.js'
import { catalogo } from './routes/catalogo.js'
import { sitio } from './routes/sitio.js'

fs.mkdirSync(env.uploads, { recursive: true })

export const app = new Hono()

app.use('*', secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }))

app.use(
  '/api/*',
  cors({
    origin: (origin) => (env.origins.includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 600,
  }),
)

app.use(
  '/uploads/*',
  async (c, next) => {
    await next()
    c.header('Cache-Control', 'public, max-age=2592000, immutable')
    c.header('Access-Control-Allow-Origin', '*')
  },
  serveStatic({ root: path.relative(process.cwd(), env.uploads) || '.', rewriteRequestPath: (p) => p.replace(/^\/uploads/, '') }),
)

app.get('/salud', (c) => c.json({ ok: true }))

app.route('/api/auth', auth)
app.route('/api/public', publico)
app.route('/api/admin/productos', productos)
app.route('/api/admin', catalogo)
app.route('/api/admin', sitio)

app.notFound((c) => c.json({ error: 'No encontrado' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'Error interno del servidor' }, 500)
})
