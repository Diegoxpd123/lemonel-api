import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { smDe, urlDe } from './files.js'

export const ESTADOS = ['recibido', 'pagado', 'preparando', 'enviado', 'entregado'] as const
export type Estado = (typeof ESTADOS)[number]
export const METODOS_ENVIO = ['motorizado', 'shalom', 'otro'] as const
export const METODOS_PAGO = ['Yape', 'Plin', 'Transferencia', 'Efectivo', 'Otro'] as const

export const incluirPedido = {
  items: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] },
  pagos: { orderBy: [{ fecha: 'asc' }, { id: 'asc' }] },
  eventos: { orderBy: [{ fecha: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.PedidoInclude

export type PedidoCompleto = Prisma.PedidoGetPayload<{ include: typeof incluirPedido }>

export const redondear = (n: number) => Math.round(n * 100) / 100

export const nuevoToken = () => crypto.randomBytes(12).toString('base64url')

export const soloDigitos = (s: string) => s.replace(/\D/g, '')

export const cifras = (p: PedidoCompleto) => {
  const subtotal = redondear(p.items.reduce((a, i) => a + Number(i.precio) * i.cantidad, 0))
  const descuento = Number(p.descuento)
  const envio = Number(p.envioCosto)
  const total = redondear(Math.max(0, subtotal - descuento + envio))
  const pagado = redondear(p.pagos.reduce((a, x) => a + Number(x.monto), 0))
  const saldo = redondear(Math.max(0, total - pagado))
  return { subtotal, descuento, envio, total, pagado, saldo }
}

const piezas = (p: PedidoCompleto) => p.items.reduce((a, i) => a + i.cantidad, 0)

export const pedidoFila = (p: PedidoCompleto) => {
  const c = cifras(p)
  return {
    id: p.id,
    codigo: p.codigo,
    origen: p.origen,
    estado: p.estado,
    cancelado: p.cancelado,
    cliente: p.cliente,
    ciudad: p.ciudad,
    piezas: piezas(p),
    resumen: p.items
      .slice(0, 3)
      .map((i) => i.nombre)
      .join(', '),
    total: c.total,
    pagado: c.pagado,
    saldo: c.saldo,
    creado: p.creado.toISOString(),
    actualizado: p.actualizado.toISOString(),
  }
}

const fotoItem = (archivo: string | null) => (archivo ? urlDe(smDe(archivo)) : null)

export const pedidoAdmin = (p: PedidoCompleto) => ({
  ...pedidoFila(p),
  token: p.token,
  whatsapp: p.whatsapp,
  nota: p.nota,
  metodoEnvio: p.metodoEnvio,
  agencia: p.agencia,
  seguimiento: p.seguimiento,
  envioCosto: Number(p.envioCosto),
  descuento: Number(p.descuento),
  subtotal: cifras(p).subtotal,
  items: p.items.map((i) => ({
    id: i.id,
    productoId: i.productoId,
    nombre: i.nombre,
    detalle: i.detalle,
    sku: i.sku,
    foto: fotoItem(i.foto),
    precio: Number(i.precio),
    cantidad: i.cantidad,
  })),
  pagos: p.pagos.map((x) => ({ id: x.id, monto: Number(x.monto), metodo: x.metodo, nota: x.nota, fecha: x.fecha.toISOString(), tieneCaptura: !!x.captura })),
  eventos: p.eventos.map((e) => ({ id: e.id, estado: e.estado, nota: e.nota, fecha: e.fecha.toISOString() })),
})

export const primerNombre = (s: string) => s.trim().split(/\s+/)[0] ?? ''

export const pedidoPublico = (p: PedidoCompleto, tienda: { whatsapp: string; dias: string; horasCambio: number }) => {
  const c = cifras(p)
  const actual = ESTADOS.indexOf(p.estado as Estado)
  const pasos = ESTADOS.map((estado, i) => {
    const ultimo = [...p.eventos].reverse().find((e) => e.estado === estado)
    return { estado, hecho: i <= actual, fecha: ultimo ? ultimo.fecha.toISOString() : null }
  })
  const mensajes = [...p.eventos]
    .filter((e) => e.nota.trim())
    .reverse()
    .slice(0, 5)
    .map((e) => ({ estado: e.estado, nota: e.nota, fecha: e.fecha.toISOString() }))
  const cancelacion = p.cancelado ? [...p.eventos].reverse().find((e) => e.estado === 'cancelado') : null
  return {
    codigo: p.codigo,
    estado: p.estado,
    indice: actual,
    cancelado: p.cancelado,
    motivoCancelacion: cancelacion?.nota ?? '',
    cliente: primerNombre(p.cliente),
    ciudad: p.ciudad,
    creado: p.creado.toISOString(),
    actualizado: p.actualizado.toISOString(),
    pasos,
    mensajes,
    envio: { metodo: p.metodoEnvio, agencia: p.agencia, seguimiento: p.seguimiento },
    items: p.items.map((i) => ({ nombre: i.nombre, detalle: i.detalle, cantidad: i.cantidad, foto: fotoItem(i.foto), subtotal: redondear(Number(i.precio) * i.cantidad) })),
    montos: { subtotal: c.subtotal, descuento: c.descuento, envio: c.envio, total: c.total, pagado: c.pagado, saldo: c.saldo },
    tienda,
  }
}

export const detalleDe = (tipo: string | null, varios: boolean, op: Record<string, string>, diseno: string) => {
  const partes: string[] = []
  if (varios && tipo) partes.push(tipo)
  for (const [k, v] of Object.entries(op)) if (v) partes.push(`${k}: ${v}`)
  if (diseno.trim()) partes.push(`Diseño: ${diseno.trim()}`)
  return partes.join(' · ')
}
