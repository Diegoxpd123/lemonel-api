import type { Prisma } from '@prisma/client'
import { smDe, urlDe } from './files.js'

export const incluirProducto = {
  categoria: true,
  variantes: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] },
  opciones: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] },
  fotos: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] },
  colecciones: { include: { coleccion: true } },
} satisfies Prisma.ProductoInclude

export type ProductoCompleto = Prisma.ProductoGetPayload<{ include: typeof incluirProducto }>

const foto = (f: { id: number; archivo: string; ancho: number; alto: number }) => ({
  id: f.id,
  url: urlDe(f.archivo),
  sm: urlDe(smDe(f.archivo)),
  ancho: f.ancho,
  alto: f.alto,
})

export const productoAdmin = (p: ProductoCompleto) => ({
  id: p.id,
  slug: p.slug,
  nombre: p.nombre,
  categoriaId: p.categoriaId,
  categoria: p.categoria.slug,
  seccion: p.seccion,
  material: p.material,
  descripcion: p.descripcion,
  agotado: p.agotado,
  oculto: p.oculto,
  destacado: p.destacado,
  nuevo: p.nuevo,
  escogeDiseno: p.escogeDiseno,
  orden: p.orden,
  variantes: p.variantes.map((v) => ({ id: v.id, tipo: v.tipo, precio: Number(v.precio), sku: v.sku, agotado: v.agotado })),
  opciones: p.opciones.map((o) => ({ id: o.id, nombre: o.nombre, valores: o.valores, agotados: o.agotados, requerida: o.requerida })),
  fotos: p.fotos.map(foto),
  colecciones: p.colecciones.map((c) => c.coleccionId),
})

export const productoPublico = (p: ProductoCompleto) => {
  const precios = p.variantes.map((v) => Number(v.precio))
  return {
    id: p.id,
    slug: p.slug,
    nombre: p.nombre,
    categoria: p.categoria.slug,
    seccion: p.seccion,
    material: p.material,
    descripcion: p.descripcion,
    agotado:
      p.agotado ||
      (p.variantes.length > 0 && p.variantes.every((v) => v.agotado)) ||
      p.opciones.some((o) => o.valores.length > 0 && o.valores.every((v) => o.agotados.includes(v))),
    destacado: p.destacado,
    nuevo: p.nuevo,
    escogeDiseno: p.escogeDiseno,
    precioDesde: precios.length ? Math.min(...precios) : 0,
    variantes: p.variantes.map((v) => ({ id: v.id, tipo: v.tipo, precio: Number(v.precio), sku: v.sku, agotado: v.agotado })),
    opciones: p.opciones.map((o) => ({ nombre: o.nombre, valores: o.valores, agotados: o.agotados, requerida: o.requerida })),
    fotos: p.fotos.map((f) => ({ url: urlDe(f.archivo), sm: urlDe(smDe(f.archivo)), ancho: f.ancho, alto: f.alto })),
    colecciones: p.colecciones.map((c) => c.coleccion.slug),
  }
}
