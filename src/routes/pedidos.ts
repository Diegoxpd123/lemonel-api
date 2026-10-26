import { Hono } from 'hono'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db.js'
import { requiereAdmin, type Sesion } from '../auth.js'
import { idParam, parse } from '../util.js'
import { borrarPrivado, guardarCaptura, leerPrivado } from '../files.js'
import { incluirProducto, productoPublico } from '../serializar.js'
import { ESTADOS, METODOS_ENVIO, METODOS_PAGO, detalleDe, incluirPedido, nuevoToken, pedidoAdmin, pedidoFila, soloDigitos } from '../pedidos.js'

export const pedidos = new Hono<{ Variables: { admin: Sesion } }>()

pedidos.use('*', requiereAdmin)

const texto = (max: number) => z.string().trim().max(max).default('')

const entradaItem = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    productoId: z.coerce.number().int().positive().optional(),
    varianteId: z.coerce.number().int().positive().optional(),
    opciones: z.record(z.string().max(40), z.string().max(40)).default({}),
    diseno: texto(200),
    nombre: texto(120),
    detalle: texto(200),
    cantidad: z.coerce.number().int().min(1, 'La cantidad mínima es 1').max(999),
    precio: z.coerce.number().min(0, 'Precio inválido').max(100000).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.id) return
    if (e.productoId && !e.varianteId) ctx.addIssue({ code: 'custom', message: 'Elige la pieza del producto', path: ['varianteId'] })
    if (!e.productoId && !e.nombre) ctx.addIssue({ code: 'custom', message: 'Escribe el concepto', path: ['nombre'] })
    if (!e.productoId && e.precio === undefined) ctx.addIssue({ code: 'custom', message: 'Escribe el precio', path: ['precio'] })
  })

const datos = z.object({
  cliente: texto(120),
  whatsapp: z
    .string()
    .trim()
    .max(30)
    .default('')
    .transform(soloDigitos),
  ciudad: texto(80),
  nota: texto(600),
  metodoEnvio: z.enum(['', ...METODOS_ENVIO]).default(''),
  agencia: texto(120),
  seguimiento: texto(60),
  envioCosto: z.coerce.number().min(0).max(5000).default(0),
  descuento: z.coerce.number().min(0).max(100000).default(0),
})

const crearCuerpo = datos.extend({ items: z.array(entradaItem).min(1, 'Agrega al menos un producto').max(60) })
const editarCuerpo = datos.partial().extend({ items: z.array(entradaItem).min(1, 'Agrega al menos un producto').max(60).optional() })

const cuerpoEstado = z.object({
  estado: z.enum(ESTADOS),
  nota: texto(300),
  metodoEnvio: z.enum(['', ...METODOS_ENVIO]).optional(),
  agencia: z.string().trim().max(120).optional(),
  seguimiento: z.string().trim().max(60).optional(),
})

const cuerpoPago = z.object({
  monto: z.coerce.number().positive('Escribe el monto').max(100000),
  metodo: z.enum(METODOS_PAGO),
  nota: texto(200),
  fecha: z.string().trim().optional(),
})

type ItemGuardado = { id: number; productoId: number | null; nombre: string; detalle: string; sku: string | null; foto: string | null; precio: unknown }

const construirItems = async (entradas: z.output<typeof entradaItem>[], existentes: ItemGuardado[] = []) => {
  const ids = [...new Set(entradas.flatMap((e) => (e.productoId ? [e.productoId] : [])))]
  const prods = await db.producto.findMany({ where: { id: { in: ids } }, include: incluirProducto })
  return entradas.map((e, orden) => {
    if (e.id) {
      const x = existentes.find((y) => y.id === e.id)
      if (!x) throw new HTTPException(400, { message: 'Uno de los productos no pertenece a este pedido' })
      const libre = x.productoId === null
      return { productoId: x.productoId, nombre: libre && e.nombre ? e.nombre : x.nombre, detalle: libre && e.detalle ? e.detalle : x.detalle, sku: x.sku, foto: x.foto, precio: e.precio ?? Number(x.precio), cantidad: e.cantidad, orden }
    }
    if (!e.productoId) {
      return { productoId: null, nombre: e.nombre, detalle: e.detalle, sku: null, foto: null, precio: e.precio ?? 0, cantidad: e.cantidad, orden }
    }
    const p = prods.find((x) => x.id === e.productoId)
    if (!p) throw new HTTPException(400, { message: 'Uno de los productos ya no existe' })
    const v = p.variantes.find((x) => x.id === e.varianteId)
    if (!v) throw new HTTPException(400, { message: `La pieza elegida no pertenece a “${p.nombre}”` })
    for (const [k, val] of Object.entries(e.opciones)) {
      const o = p.opciones.find((x) => x.nombre === k)
      if (!o || !o.valores.includes(val)) throw new HTTPException(400, { message: `La opción ${k}: ${val} no existe en “${p.nombre}”` })
    }
    return {
      productoId: p.id,
      nombre: p.nombre,
      detalle: detalleDe(v.tipo, p.variantes.length > 1, e.opciones, e.diseno),
      sku: v.sku,
      foto: p.fotos[0]?.archivo ?? null,
      precio: e.precio ?? Number(v.precio),
      cantidad: e.cantidad,
      orden,
    }
  })
}

const cargar = async (id: number) => {
  const p = await db.pedido.findUnique({ where: { id }, include: incluirPedido })
  if (!p) throw new HTTPException(404, { message: 'Pedido no encontrado' })
  return p
}

pedidos.get('/', async (c) => {
  const q = c.req.query('q')?.trim() ?? ''
  const estado = c.req.query('estado') ?? ''
  const digitos = soloDigitos(q)
  const lista = await db.pedido.findMany({
    where: {
      ...(estado === 'cancelado' ? { cancelado: true } : estado === 'porenviar' ? { estado: { in: ['pagado', 'preparando'] }, cancelado: false } : (ESTADOS as readonly string[]).includes(estado) ? { estado, cancelado: false } : {}),
      ...(q
        ? {
            OR: [
              { codigo: { contains: q, mode: 'insensitive' as const } },
              { cliente: { contains: q, mode: 'insensitive' as const } },
              { ciudad: { contains: q, mode: 'insensitive' as const } },
              ...(digitos.length >= 3 ? [{ whatsapp: { contains: digitos } }] : []),
            ],
          }
        : {}),
    },
    orderBy: [{ creado: 'desc' }, { id: 'desc' }],
    take: 500,
    include: incluirPedido,
  })
  const grupos = await db.pedido.groupBy({ by: ['estado', 'cancelado'], _count: { _all: true } })
  const conteos: Record<string, number> = { recibido: 0, pagado: 0, preparando: 0, enviado: 0, entregado: 0, cancelado: 0 }
  for (const g of grupos) {
    if (g.cancelado) conteos.cancelado = (conteos.cancelado ?? 0) + g._count._all
    else conteos[g.estado] = (conteos[g.estado] ?? 0) + g._count._all
  }
  conteos.porenviar = (conteos.pagado ?? 0) + (conteos.preparando ?? 0)
  return c.json({ pedidos: lista.map(pedidoFila), conteos })
})

pedidos.get('/catalogo', async (c) => {
  const lista = await db.producto.findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }], include: incluirProducto })
  return c.json(
    lista.map((p) => {
      const x = productoPublico(p)
      return {
        id: x.id,
        nombre: x.nombre,
        categoria: x.categoria,
        oculto: p.oculto,
        agotado: x.agotado,
        escogeDiseno: x.escogeDiseno,
        foto: x.fotos[0]?.sm ?? null,
        variantes: x.variantes,
        opciones: x.opciones,
      }
    }),
  )
})

pedidos.get('/pagos/:pagoId/captura', async (c) => {
  const pago = await db.pago.findUnique({ where: { id: idParam(c.req.param('pagoId')) } })
  if (!pago?.captura) throw new HTTPException(404, { message: 'Sin captura' })
  const buf = await leerPrivado(pago.captura)
  return c.body(new Uint8Array(buf), 200, { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=3600' })
})

pedidos.post('/', async (c) => {
  const b = parse(crearCuerpo, await c.req.json().catch(() => ({})))
  const items = await construirItems(b.items)
  const { items: _omitir, ...resto } = b
  const creado = await db.$transaction(async (tx) => {
    const p = await tx.pedido.create({
      data: { ...resto, codigo: `tmp-${nuevoToken()}`, token: nuevoToken(), origen: 'manual', items: { create: items }, eventos: { create: { estado: 'recibido', nota: '' } } },
    })
    return tx.pedido.update({ where: { id: p.id }, data: { codigo: `LM-${1000 + p.id}` }, include: incluirPedido })
  })
  return c.json(pedidoAdmin(creado), 201)
})

pedidos.get('/:id', async (c) => c.json(pedidoAdmin(await cargar(idParam(c.req.param('id'))))))

pedidos.put('/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const actual = await cargar(id)
  const b = parse(editarCuerpo, await c.req.json().catch(() => ({})))
  const { items, ...resto } = b
  const nuevos = items ? await construirItems(items, actual.items) : null
  const p = await db.$transaction(async (tx) => {
    if (nuevos) {
      await tx.pedidoItem.deleteMany({ where: { pedidoId: id } })
      await tx.pedidoItem.createMany({ data: nuevos.map((i) => ({ ...i, pedidoId: id })) })
    }
    return tx.pedido.update({ where: { id }, data: resto, include: incluirPedido })
  })
  return c.json(pedidoAdmin(p))
})

pedidos.post('/:id/estado', async (c) => {
  const id = idParam(c.req.param('id'))
  const actual = await cargar(id)
  const b = parse(cuerpoEstado, await c.req.json().catch(() => ({})))
  const metodoEnvio = b.metodoEnvio ?? actual.metodoEnvio
  if (b.estado === 'enviado' && !metodoEnvio) throw new HTTPException(400, { message: 'Elige cómo se envía el pedido' })
  const cambio = b.estado !== actual.estado
  const p = await db.pedido.update({
    where: { id },
    data: {
      estado: b.estado,
      metodoEnvio,
      agencia: b.agencia ?? actual.agencia,
      seguimiento: b.seguimiento ?? actual.seguimiento,
      ...(cambio || b.nota ? { eventos: { create: { estado: b.estado, nota: b.nota } } } : {}),
    },
    include: incluirPedido,
  })
  return c.json(pedidoAdmin(p))
})

pedidos.post('/:id/cancelar', async (c) => {
  const id = idParam(c.req.param('id'))
  await cargar(id)
  const b = parse(z.object({ cancelado: z.boolean(), nota: texto(300) }), await c.req.json().catch(() => ({})))
  const p = await db.pedido.update({
    where: { id },
    data: { cancelado: b.cancelado, eventos: { create: { estado: b.cancelado ? 'cancelado' : 'reactivado', nota: b.nota } } },
    include: incluirPedido,
  })
  return c.json(pedidoAdmin(p))
})

pedidos.post('/:id/token', async (c) => {
  const id = idParam(c.req.param('id'))
  await cargar(id)
  const p = await db.pedido.update({ where: { id }, data: { token: nuevoToken() }, include: incluirPedido })
  return c.json(pedidoAdmin(p))
})

pedidos.post('/:id/pagos', async (c) => {
  const id = idParam(c.req.param('id'))
  const actual = await cargar(id)
  const form = await c.req.parseBody()
  const b = parse(cuerpoPago, {
    monto: form['monto'],
    metodo: form['metodo'],
    nota: typeof form['nota'] === 'string' ? form['nota'] : '',
    fecha: typeof form['fecha'] === 'string' ? form['fecha'] : undefined,
  })
  const archivo = form['captura']
  const captura = archivo instanceof File && archivo.size > 0 ? await guardarCaptura(archivo) : null
  const fecha = b.fecha && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? new Date(`${b.fecha}T12:00:00`) : new Date()
  const avanza = actual.estado === 'recibido' && !actual.cancelado
  const p = await db.pedido.update({
    where: { id },
    data: {
      pagos: { create: { monto: b.monto, metodo: b.metodo, nota: b.nota, captura, fecha } },
      ...(avanza ? { estado: 'pagado', eventos: { create: { estado: 'pagado', nota: '' } } } : {}),
    },
    include: incluirPedido,
  })
  return c.json(pedidoAdmin(p), 201)
})

pedidos.delete('/:id/pagos/:pagoId', async (c) => {
  const id = idParam(c.req.param('id'))
  const pagoId = idParam(c.req.param('pagoId'))
  const pago = await db.pago.findFirst({ where: { id: pagoId, pedidoId: id } })
  if (!pago) throw new HTTPException(404, { message: 'Pago no encontrado' })
  await db.pago.delete({ where: { id: pagoId } })
  await borrarPrivado(pago.captura)
  return c.json(pedidoAdmin(await cargar(id)))
})

pedidos.delete('/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const p = await cargar(id)
  await db.pedido.delete({ where: { id } })
  for (const pago of p.pagos) await borrarPrivado(pago.captura)
  return c.json({ ok: true })
})
