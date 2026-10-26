import { Hono } from 'hono'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db.js'
import { leerAjustes } from '../ajustes.js'
import { incluirProducto, productoPublico } from '../serializar.js'
import { urlDe } from '../files.js'
import { versionActual } from '../cache.js'
import { parse } from '../util.js'
import { ipDe, limitar } from '../limite.js'
import { cifras, detalleDe, incluirPedido, nuevoToken, pedidoPublico, redondear, soloDigitos, telefonoPeru } from '../pedidos.js'

export const publico = new Hono()

let memo: { version: number; hasta: number; cuerpo: string } | null = null

const construir = async () => {
  const [ajustes, categorias, colecciones, colores, faqs, productos] = await Promise.all([
    leerAjustes(),
    db.categoria.findMany({ where: { activa: true }, orderBy: [{ orden: 'asc' }, { id: 'asc' }] }),
    db.coleccion.findMany({ where: { activa: true }, orderBy: [{ orden: 'asc' }, { id: 'asc' }], include: { productos: { select: { productoId: true } } } }),
    db.color.findMany({ orderBy: { nombre: 'asc' } }),
    db.faq.findMany({ where: { activa: true }, orderBy: [{ orden: 'asc' }, { id: 'asc' }] }),
    db.producto.findMany({
      where: { oculto: false, categoria: { activa: true } },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      include: incluirProducto,
    }),
  ])

  const hero = (ajustes.hero as { video: string; poster: string | null }[]).map((h) => ({ video: urlDe(h.video), poster: urlDe(h.poster) }))

  return {
    ajustes: { ...ajustes, hero },
    categorias: categorias.map((c) => ({ id: c.id, slug: c.slug, nombre: c.nombre, descripcion: c.descripcion })),
    colecciones: colecciones.map((c) => ({
      id: c.id,
      slug: c.slug,
      nombre: c.nombre,
      descripcion: c.descripcion,
      foto: urlDe(c.foto),
      productoIds: c.productos.map((p) => p.productoId),
    })),
    colores: Object.fromEntries(colores.map((c) => [c.nombre, c.hex])),
    faqs: faqs.map((f) => ({ pregunta: f.pregunta, respuesta: f.respuesta })),
    productos: productos.map(productoPublico),
  }
}

publico.get('/catalogo', async (c) => {
  const ahora = Date.now()
  const v = versionActual()
  if (!memo || memo.version !== v || memo.hasta < ahora) {
    memo = { version: v, hasta: ahora + 15000, cuerpo: JSON.stringify(await construir()) }
  }
  c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=120')
  return c.body(memo.cuerpo, 200, { 'Content-Type': 'application/json; charset=UTF-8' })
})

const escalaPara = (escalas: { desde: number; porcentaje: number }[], cantidad: number) => {
  let d = 0
  for (const e of [...escalas].sort((a, b) => a.desde - b.desde)) if (cantidad >= e.desde) d = e.porcentaje / 100
  return d
}

const entradaTienda = z.object({
  id: z.coerce.number().int().positive(),
  vi: z.coerce.number().int().min(0).max(30).default(0),
  op: z.record(z.string().max(40), z.string().max(40)).default({}),
  dis: z.string().trim().max(200).default(''),
  qty: z.coerce.number().int().min(1, 'La cantidad mínima es 1').max(999),
})

const clienteTienda = z.object({
  nombre: z.string().trim().min(2, 'Escribe tu nombre').max(120),
  whatsapp: z
    .string()
    .trim()
    .max(30)
    .transform(soloDigitos)
    .transform(telefonoPeru)
    .refine((d) => d.length >= 10 && d.length <= 15, 'Escribe un número de WhatsApp válido'),
  ciudad: z.string().trim().min(2, 'Escribe tu ciudad').max(80),
})

const cuerpoTienda = z.object({
  cliente: clienteTienda.optional(),
  items: z.array(entradaTienda).min(1, 'El carrito está vacío').max(60),
  nota: z.string().trim().max(500).default(''),
  evento: z
    .object({ tipo: z.string().trim().max(60), fecha: z.string().trim().max(20).default('') })
    .nullish(),
})

publico.post('/pedidos', async (c) => {
  limitar(`pedido:${ipDe(c)}`, 20, 60 * 60 * 1000)
  limitar('pedido:global', 300, 60 * 60 * 1000)
  const b = parse(cuerpoTienda, await c.req.json().catch(() => ({})))
  const ids = [...new Set(b.items.map((i) => i.id))]
  const [prods, ajustes] = await Promise.all([
    db.producto.findMany({ where: { id: { in: ids }, oculto: false }, include: incluirProducto }),
    leerAjustes(),
  ])
  const escalas = ajustes.descuentos as { desde: number; porcentaje: number }[]
  const grupos = new Map<string, number>()
  for (const i of b.items) grupos.set(`${i.id}|${i.vi}`, (grupos.get(`${i.id}|${i.vi}`) ?? 0) + i.qty)

  const items = b.items.map((i, orden) => {
    const p = prods.find((x) => x.id === i.id)
    if (!p) throw new HTTPException(400, { message: 'Uno de los productos ya no está disponible. Actualiza la página e inténtalo otra vez.' })
    const v = p.variantes[i.vi]
    if (!v) throw new HTTPException(400, { message: `La pieza elegida de “${p.nombre}” no existe` })
    const publico = productoPublico(p)
    if (publico.agotado || v.agotado) throw new HTTPException(400, { message: `“${p.nombre}” está agotado` })
    for (const o of p.opciones) {
      const val = i.op[o.nombre]
      if (o.requerida && o.valores.length && !val) throw new HTTPException(400, { message: `Elige ${o.nombre.toLowerCase()} en “${p.nombre}”` })
      if (val && (!o.valores.includes(val) || o.agotados.includes(val))) throw new HTTPException(400, { message: `${o.nombre}: ${val} no está disponible en “${p.nombre}”` })
    }
    for (const k of Object.keys(i.op)) if (!p.opciones.some((o) => o.nombre === k)) throw new HTTPException(400, { message: `Opción desconocida en “${p.nombre}”` })
    const descuento = escalaPara(escalas, grupos.get(`${i.id}|${i.vi}`) ?? i.qty)
    return {
      productoId: p.id,
      nombre: p.nombre,
      detalle: detalleDe(v.tipo, p.variantes.length > 1, i.op, i.dis),
      sku: v.sku,
      foto: p.fotos[0]?.archivo ?? null,
      precio: redondear(Number(v.precio) * (1 - descuento)),
      cantidad: i.qty,
      orden,
    }
  })

  const notas = [
    b.evento ? `Evento: ${b.evento.tipo}${b.evento.fecha ? ` el ${b.evento.fecha}` : ''}` : '',
    b.nota ? `Nota de la clienta: ${b.nota}` : '',
  ]
    .filter(Boolean)
    .join('. ')

  const creado = await db.$transaction(async (tx) => {
    const p = await tx.pedido.create({
      data: {
        codigo: `tmp-${nuevoToken()}`,
        token: nuevoToken(),
        origen: 'tienda',
        cliente: b.cliente?.nombre ?? '',
        whatsapp: b.cliente?.whatsapp ?? '',
        ciudad: b.cliente?.ciudad ?? '',
        nota: notas,
        items: { create: items },
        eventos: { create: { estado: 'recibido', nota: '' } },
      },
    })
    return tx.pedido.update({ where: { id: p.id }, data: { codigo: `LM-${1000 + p.id}` }, include: incluirPedido })
  })
  return c.json({ codigo: creado.codigo, token: creado.token, ruta: `/pedido/${creado.token}`, total: cifras(creado).total }, 201)
})

publico.get('/pedido/:token', async (c) => {
  limitar(`seguimiento:${ipDe(c)}`, 300, 60 * 1000)
  const token = c.req.param('token')
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) throw new HTTPException(404, { message: 'Pedido no encontrado' })
  const p = await db.pedido.findUnique({ where: { token }, include: incluirPedido })
  if (!p) throw new HTTPException(404, { message: 'Pedido no encontrado' })
  const a = await leerAjustes()
  const contacto = a.contacto as { whatsapp: string }
  const envios = a.envios as { dias: string; horasCambio: number }
  c.header('Cache-Control', 'no-store')
  c.header('X-Robots-Tag', 'noindex, nofollow')
  return c.json(pedidoPublico(p, { whatsapp: contacto.whatsapp, dias: envios.dias, horasCambio: envios.horasCambio }))
})
