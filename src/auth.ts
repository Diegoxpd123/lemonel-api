import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { env } from './env.js'
import { db } from './db.js'

const COOKIE = 'lemonel_admin'
const secret = new TextEncoder().encode(env.JWT_SECRET)
const DURACION = 60 * 60 * 24 * 14

export type Sesion = { id: number; email: string; nombre: string }

export const hash = (p: string) => bcrypt.hash(p, 11)
export const comparar = (p: string, h: string) => bcrypt.compare(p, h)

export const abrirSesion = async (c: Context, a: Sesion) => {
  const token = await new SignJWT({ email: a.email, nombre: a.nombre })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(a.id))
    .setIssuedAt()
    .setExpirationTime(`${DURACION}s`)
    .sign(secret)
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'Lax',
    path: '/',
    maxAge: DURACION,
  })
}

export const cerrarSesion = (c: Context) => deleteCookie(c, COOKIE, { path: '/' })

const leer = async (c: Context): Promise<Sesion | null> => {
  const token = getCookie(c, COOKIE)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret)
    return { id: Number(payload.sub), email: String(payload.email), nombre: String(payload.nombre) }
  } catch {
    return null
  }
}

export const requiereAdmin: MiddlewareHandler<{ Variables: { admin: Sesion } }> = async (c, next) => {
  const s = await leer(c)
  if (!s) throw new HTTPException(401, { message: 'Inicia sesión para continuar' })
  const existe = await db.admin.findUnique({ where: { id: s.id }, select: { id: true } })
  if (!existe) throw new HTTPException(401, { message: 'Sesión inválida' })
  c.set('admin', s)
  await next()
}

export const sesionActual = leer

const intentos = new Map<string, { n: number; hasta: number }>()
const VENTANA = 15 * 60 * 1000
const MAXIMO = 8

export const limitarLogin = (clave: string) => {
  const ahora = Date.now()
  const r = intentos.get(clave)
  if (r && r.hasta > ahora && r.n >= MAXIMO) {
    throw new HTTPException(429, { message: 'Demasiados intentos. Espera unos minutos.' })
  }
}

export const registrarIntento = (clave: string, ok: boolean) => {
  if (ok) {
    intentos.delete(clave)
    return
  }
  const ahora = Date.now()
  const r = intentos.get(clave)
  if (!r || r.hasta <= ahora) intentos.set(clave, { n: 1, hasta: ahora + VENTANA })
  else r.n += 1
}
