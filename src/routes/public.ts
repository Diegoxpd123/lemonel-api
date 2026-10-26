import { Hono } from 'hono'
import { db } from '../db.js'
import { leerAjustes } from '../ajustes.js'
import { incluirProducto, productoPublico } from '../serializar.js'
import { urlDe } from '../files.js'
import { versionActual } from '../cache.js'

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
