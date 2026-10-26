import { z } from 'zod'
import { db } from './db.js'

export const esquemas = {
  contacto: z.object({
    whatsapp: z.string().trim().regex(/^\d{8,15}$/, 'Solo números con código de país, por ejemplo 51981101636'),
    instagram: z.string().trim().max(60),
    tiktok: z.string().trim().max(60),
    email: z.string().trim().max(120).default(''),
  }),
  evento: z.object({
    minimo: z.coerce.number().int().min(1).max(1000),
    diasAnticipacion: z.coerce.number().int().min(0).max(120),
  }),
  descuentos: z
    .array(z.object({ desde: z.coerce.number().int().min(1).max(10000), porcentaje: z.coerce.number().min(0).max(90) }))
    .max(12),
  envios: z.object({
    motorizadoLima: z.coerce.number().min(0).max(500),
    shalom: z.coerce.number().min(0).max(500),
    dias: z.string().trim().max(120),
    separar: z.coerce.number().min(0).max(5000),
    mesesSeparar: z.coerce.number().int().min(0).max(24),
    horasCambio: z.coerce.number().int().min(0).max(720),
  }),
  hero: z
    .array(
      z.object({
        video: z.string().min(1),
        poster: z.string().nullable().default(null),
      }),
    )
    .max(8),
} as const

export type ClaveAjuste = keyof typeof esquemas

export const porDefecto: Record<ClaveAjuste, unknown> = {
  contacto: { whatsapp: '51981101636', instagram: 'lemonel.pe', tiktok: 'lemonel.pe', email: '' },
  evento: { minimo: 10, diasAnticipacion: 7 },
  descuentos: [
    { desde: 10, porcentaje: 10 },
    { desde: 30, porcentaje: 15 },
    { desde: 50, porcentaje: 20 },
    { desde: 100, porcentaje: 25 },
  ],
  envios: { motorizadoLima: 10, shalom: 8, dias: 'Martes y sábados', separar: 15, mesesSeparar: 3, horasCambio: 72 },
  hero: [],
}

export const leerAjustes = async () => {
  const filas = await db.ajuste.findMany()
  const out: Record<string, unknown> = { ...porDefecto }
  for (const f of filas) if (f.clave in esquemas) out[f.clave] = f.valor
  return out
}
