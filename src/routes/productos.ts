import { Hono } from 'hono'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db.js'
import { requiereAdmin, type Sesion } from '../auth.js'
import { idParam, parse, unico } from '../util.js'
import { incluirProducto, productoAdmin } from '../serializar.js'
import { borrarArchivo, guardarImagen, smDe, urlDe } from '../files.js'
import { invalidar } from '../cache.js'

export const productos = new Hono<{ Variables: { admin: Sesion } }>()

productos.use('*', requiereAdmin)

const texto = (max: number) => z.string().trim().max(max).default('')

const variante = z.object({
  tipo: z.string().trim().min(1, 'Escribe el tipo').max(60),
  precio: z.coerce.number().min(0, 'Precio inválido').max(100000),
  sku: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v || null),
  agotado: z.boolean().default(false),
})

const opcion = z
  .object({
    nombre: z.string().trim().min(1, 'Escribe el nombre').max(40),
    valores: z.array(z.string().trim().min(1).max(40)).max(60).default([]),
    agotados: z.array(z.string().trim().min(1).max(40)).max(60).default([]),
    requerida: z.boolean().default(false),
  })
  .transform((o) => ({ ...o, agotados: o.agotados.filter((a) => o.valores.includes(a)) }))

const cuerpo = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre').max(120),
  categoriaId: z.coerce.number().int().positive('Elige una categoría'),
  seccion: texto(80),
  material: texto(160),
  descripcion: texto(800),
  agotado: z.boolean().default(false),
  oculto: z.boolean().default(false),
  destacado: z.boolean().default(false),
  nuevo: z.boolean().default(false),
  escogeDiseno: z.boolean().default(false),
  orden: z.coerce.number().int().min(0).optional(),
  variantes: z.array(variante).min(1, 'Agrega al menos una variante con precio').max(20),
  opciones: z.array(opcion).max(12).default([]),
  colecciones: z.array(z.number().int()).default([]),
})

const cargar = async (id: number) => {
  const p = await db.producto.findUnique({ where: { id }, include: incluirProducto })
  if (!p) throw new HTTPException(404, { message: 'Producto no encontrado' })
  return p
}

productos.get('/', async (c) => {
  const lista = await db.producto.findMany({
    orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    include: {
      categoria: true,
      variantes: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] },
      opciones: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] },
      fotos: { orderBy: [{ orden: 'asc' }, { id: 'asc' }], take: 1 },
    },
  })
  return c.json(
    lista.map((p) => ({
      id: p.id,
      slug: p.slug,
      nombre: p.nombre,
      categoria: p.categoria.slug,
      categoriaNombre: p.categoria.nombre,
      seccion: p.seccion,
      agotado: p.agotado,
      oculto: p.oculto,
      destacado: p.destacado,
      nuevo: p.nuevo,
      orden: p.orden,
      variantes: p.variantes.length,
      sinStock: [...p.variantes.filter((v) => v.agotado).map((v) => v.tipo), ...p.opciones.flatMap((o) => o.agotados.filter((a) => o.valores.includes(a)))],
      precioDesde: p.variantes.length ? Math.min(...p.variantes.map((v) => Number(v.precio))) : 0,
      foto: p.fotos[0] ? urlDe(smDe(p.fotos[0].archivo)) : null,
    })),
  )
})

productos.get('/:id', async (c) => c.json(productoAdmin(await cargar(idParam(c.req.param('id'))))))

productos.post('/', async (c) => {
  const b = parse(cuerpo, await c.req.json().catch(() => ({})))
  const cat = await db.categoria.findUnique({ where: { id: b.categoriaId } })
  if (!cat) throw new HTTPException(400, { message: 'La categoría no existe' })
  const slug = await unico(b.nombre, async (s) => !!(await db.producto.findUnique({ where: { slug: s } })))
  const maximo = await db.producto.aggregate({ _max: { orden: true } })
  const creado = await db.producto.create({
    data: {
      slug,
      nombre: b.nombre,
      categoriaId: b.categoriaId,
      seccion: b.seccion,
      material: b.material,
      descripcion: b.descripcion,
      agotado: b.agotado,
      oculto: b.oculto,
      destacado: b.destacado,
      nuevo: b.nuevo,
      escogeDiseno: b.escogeDiseno,
      orden: b.orden ?? (maximo._max.orden ?? 0) + 1,
      variantes: { create: b.variantes.map((v, i) => ({ ...v, orden: i })) },
      opciones: { create: b.opciones.map((o, i) => ({ ...o, orden: i })) },
      colecciones: { create: b.colecciones.map((coleccionId) => ({ coleccionId })) },
    },
  })
  invalidar()
  return c.json(productoAdmin(await cargar(creado.id)), 201)
})

productos.put('/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const b = parse(cuerpo, await c.req.json().catch(() => ({})))
  await cargar(id)
  const cat = await db.categoria.findUnique({ where: { id: b.categoriaId } })
  if (!cat) throw new HTTPException(400, { message: 'La categoría no existe' })
  await db.$transaction([
    db.variante.deleteMany({ where: { productoId: id } }),
    db.opcion.deleteMany({ where: { productoId: id } }),
    db.productoColeccion.deleteMany({ where: { productoId: id } }),
    db.producto.update({
      where: { id },
      data: {
        nombre: b.nombre,
        categoriaId: b.categoriaId,
        seccion: b.seccion,
        material: b.material,
        descripcion: b.descripcion,
        agotado: b.agotado,
        oculto: b.oculto,
        destacado: b.destacado,
        nuevo: b.nuevo,
        escogeDiseno: b.escogeDiseno,
        ...(b.orden !== undefined ? { orden: b.orden } : {}),
        variantes: { create: b.variantes.map((v, i) => ({ ...v, orden: i })) },
        opciones: { create: b.opciones.map((o, i) => ({ ...o, orden: i })) },
        colecciones: { create: b.colecciones.map((coleccionId) => ({ coleccionId })) },
      },
    }),
  ])
  invalidar()
  return c.json(productoAdmin(await cargar(id)))
})

const banderas = z
  .object({ agotado: z.boolean(), oculto: z.boolean(), destacado: z.boolean(), nuevo: z.boolean() })
  .partial()

productos.patch('/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const b = parse(banderas, await c.req.json().catch(() => ({})))
  await cargar(id)
  await db.producto.update({ where: { id }, data: b })
  invalidar()
  return c.json(productoAdmin(await cargar(id)))
})

productos.delete('/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const p = await cargar(id)
  await db.producto.delete({ where: { id } })
  await Promise.all(p.fotos.map((f) => borrarArchivo(f.archivo)))
  invalidar()
  return c.json({ ok: true })
})

productos.post('/:id/duplicar', async (c) => {
  const id = idParam(c.req.param('id'))
  const p = await cargar(id)
  const slug = await unico(`${p.nombre} copia`, async (s) => !!(await db.producto.findUnique({ where: { slug: s } })))
  const maximo = await db.producto.aggregate({ _max: { orden: true } })
  const copia = await db.producto.create({
    data: {
      slug,
      nombre: `${p.nombre} (copia)`,
      categoriaId: p.categoriaId,
      seccion: p.seccion,
      material: p.material,
      descripcion: p.descripcion,
      oculto: true,
      escogeDiseno: p.escogeDiseno,
      orden: (maximo._max.orden ?? 0) + 1,
      variantes: { create: p.variantes.map((v, i) => ({ tipo: v.tipo, precio: v.precio, sku: v.sku, agotado: v.agotado, orden: i })) },
      opciones: { create: p.opciones.map((o, i) => ({ nombre: o.nombre, valores: o.valores, agotados: o.agotados, requerida: o.requerida, orden: i })) },
      colecciones: { create: p.colecciones.map((x) => ({ coleccionId: x.coleccionId })) },
    },
  })
  invalidar()
  return c.json(productoAdmin(await cargar(copia.id)), 201)
})

productos.post('/:id/fotos', async (c) => {
  const id = idParam(c.req.param('id'))
  const p = await cargar(id)
  const form = await c.req.parseBody({ all: true })
  const crudo = form['fotos'] ?? form['foto']
  const archivos = (Array.isArray(crudo) ? crudo : crudo ? [crudo] : []).filter((x): x is File => x instanceof File)
  if (!archivos.length) throw new HTTPException(400, { message: 'Selecciona al menos una foto' })
  if (archivos.length > 12) throw new HTTPException(400, { message: 'Máximo 12 fotos por vez' })
  let orden = p.fotos.reduce((m, f) => Math.max(m, f.orden), -1) + 1
  for (const file of archivos) {
    const g = await guardarImagen('productos', p.slug, file)
    await db.foto.create({ data: { productoId: id, archivo: g.archivo, ancho: g.ancho, alto: g.alto, orden } })
    orden += 1
  }
  invalidar()
  return c.json(productoAdmin(await cargar(id)), 201)
})

const ordenFotos = z.object({ ids: z.array(z.number().int()).min(1) })

productos.put('/:id/fotos/orden', async (c) => {
  const id = idParam(c.req.param('id'))
  const b = parse(ordenFotos, await c.req.json().catch(() => ({})))
  const p = await cargar(id)
  const validas = new Set(p.fotos.map((f) => f.id))
  const ids = b.ids.filter((x) => validas.has(x))
  await db.$transaction(ids.map((fid, i) => db.foto.update({ where: { id: fid }, data: { orden: i } })))
  invalidar()
  return c.json(productoAdmin(await cargar(id)))
})

productos.delete('/:id/fotos/:fotoId', async (c) => {
  const id = idParam(c.req.param('id'))
  const fotoId = idParam(c.req.param('fotoId'))
  const f = await db.foto.findFirst({ where: { id: fotoId, productoId: id } })
  if (!f) throw new HTTPException(404, { message: 'Foto no encontrada' })
  await db.foto.delete({ where: { id: fotoId } })
  await borrarArchivo(f.archivo)
  invalidar()
  return c.json(productoAdmin(await cargar(id)))
})
