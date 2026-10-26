import { HTTPException } from 'hono/http-exception'
import type { ZodTypeAny, z } from 'zod'

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> => {
  const r = schema.safeParse(data)
  if (!r.success) {
    const first = r.error.issues[0]
    const campo = first?.path.join('.') || 'datos'
    throw new HTTPException(400, { message: `${campo}: ${first?.message ?? 'inválido'}` })
  }
  return r.data
}

export const idParam = (v: string) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new HTTPException(400, { message: 'Identificador inválido' })
  return n
}

export const unico = async (base: string, existe: (slug: string) => Promise<boolean>) => {
  let slug = slugify(base) || 'producto'
  let n = 2
  const raiz = slug
  while (await existe(slug)) {
    slug = `${raiz}-${n}`
    n += 1
  }
  return slug
}
