import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

const registro = new Map<string, number[]>()

export const ipDe = (c: Context) => {
  const f = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  return f || c.req.header('x-real-ip') || 'local'
}

export const limitar = (clave: string, maximo: number, ventanaMs: number) => {
  const ahora = Date.now()
  const lista = (registro.get(clave) ?? []).filter((t) => t > ahora - ventanaMs)
  if (lista.length >= maximo) throw new HTTPException(429, { message: 'Demasiadas solicitudes. Espera un momento e inténtalo otra vez.' })
  lista.push(ahora)
  registro.set(clave, lista)
  if (registro.size > 5000) for (const [k, v] of registro) if (!v.some((t) => t > ahora - ventanaMs)) registro.delete(k)
}
