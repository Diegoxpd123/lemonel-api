import { Hono } from 'hono'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db.js'
import { requiereAdmin, type Sesion } from '../auth.js'
import { idParam, parse, unico } from '../util.js'
import { borrarArchivo, guardarImagen, urlDe } from '../files.js'
import { invalidar } from '../cache.js'

export const catalogo = new Hono<{ Variables: { admin: Sesion } }>()

catalogo.use('*', requiereAdmin)

const categoriaCuerpo = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre').max(60),
  descripcion: z.string().trim().max(200).default(''),
  orden: z.coerce.number().int().min(0).default(0),
  activa: z.boolean().default(true),
})

catalogo.get('/categorias', async (c) => {
  const lista = await db.categoria.findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }], include: { _count: { select: { productos: true } } } })
  return c.json(lista.map((x) => ({ id: x.id, slug: x.slug, nombre: x.nombre, descripcion: x.descripcion, orden: x.orden, activa: x.activa, productos: x._count.productos })))
})

catalogo.post('/categorias', async (c) => {
  const b = parse(categoriaCuerpo, await c.req.json().catch(() => ({})))
  const slug = await unico(b.nombre, async (s) => !!(await db.categoria.findUnique({ where: { slug: s } })))
  const x = await db.categoria.create({ data: { ...b, slug } })
  invalidar()
  return c.json({ id: x.id, slug: x.slug, nombre: x.nombre, descripcion: x.descripcion, orden: x.orden, activa: x.activa, productos: 0 }, 201)
})

catalogo.put('/categorias/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const b = parse(categoriaCuerpo, await c.req.json().catch(() => ({})))
  const x = await db.categoria.update({ where: { id }, data: b }).catch(() => null)
  if (!x) throw new HTTPException(404, { message: 'Categoría no encontrada' })
  invalidar()
  return c.json({ ok: true })
})

catalogo.delete('/categorias/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const n = await db.producto.count({ where: { categoriaId: id } })
  if (n > 0) throw new HTTPException(400, { message: `Tiene ${n} producto(s). Muévelos a otra categoría antes de eliminarla.` })
  await db.categoria.delete({ where: { id } }).catch(() => null)
  invalidar()
  return c.json({ ok: true })
})

const coleccionCuerpo = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre').max(60),
  descripcion: z.string().trim().max(200).default(''),
  orden: z.coerce.number().int().min(0).default(0),
  activa: z.boolean().default(true),
  productoIds: z.array(z.number().int()).optional(),
})

const coleccionJson = (x: { id: number; slug: string; nombre: string; descripcion: string; foto: string | null; orden: number; activa: boolean; productos: { productoId: number }[] }) => ({
  id: x.id,
  slug: x.slug,
  nombre: x.nombre,
  descripcion: x.descripcion,
  foto: urlDe(x.foto),
  orden: x.orden,
  activa: x.activa,
  productoIds: x.productos.map((p) => p.productoId),
})

catalogo.get('/colecciones', async (c) => {
  const lista = await db.coleccion.findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }], include: { productos: { select: { productoId: true } } } })
  return c.json(lista.map(coleccionJson))
})

catalogo.post('/colecciones', async (c) => {
  const b = parse(coleccionCuerpo, await c.req.json().catch(() => ({})))
  const slug = await unico(b.nombre, async (s) => !!(await db.coleccion.findUnique({ where: { slug: s } })))
  const x = await db.coleccion.create({
    data: {
      slug,
      nombre: b.nombre,
      descripcion: b.descripcion,
      orden: b.orden,
      activa: b.activa,
      productos: { create: (b.productoIds ?? []).map((productoId) => ({ productoId })) },
    },
    include: { productos: { select: { productoId: true } } },
  })
  invalidar()
  return c.json(coleccionJson(x), 201)
})

catalogo.put('/colecciones/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const b = parse(coleccionCuerpo, await c.req.json().catch(() => ({})))
  const actual = await db.coleccion.findUnique({ where: { id } })
  if (!actual) throw new HTTPException(404, { message: 'Colección no encontrada' })
  await db.$transaction([
    ...(b.productoIds ? [db.productoColeccion.deleteMany({ where: { coleccionId: id } })] : []),
    db.coleccion.update({
      where: { id },
      data: {
        nombre: b.nombre,
        descripcion: b.descripcion,
        orden: b.orden,
        activa: b.activa,
        ...(b.productoIds ? { productos: { create: b.productoIds.map((productoId) => ({ productoId })) } } : {}),
      },
    }),
  ])
  invalidar()
  const x = await db.coleccion.findUnique({ where: { id }, include: { productos: { select: { productoId: true } } } })
  return c.json(coleccionJson(x!))
})

catalogo.post('/colecciones/:id/foto', async (c) => {
  const id = idParam(c.req.param('id'))
  const actual = await db.coleccion.findUnique({ where: { id } })
  if (!actual) throw new HTTPException(404, { message: 'Colección no encontrada' })
  const form = await c.req.parseBody()
  const file = form['foto']
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'Selecciona una foto' })
  const g = await guardarImagen('colecciones', actual.slug, file)
  await db.coleccion.update({ where: { id }, data: { foto: g.archivo } })
  if (actual.foto) await borrarArchivo(actual.foto)
  invalidar()
  const x = await db.coleccion.findUnique({ where: { id }, include: { productos: { select: { productoId: true } } } })
  return c.json(coleccionJson(x!))
})

catalogo.delete('/colecciones/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const actual = await db.coleccion.findUnique({ where: { id } })
  if (!actual) throw new HTTPException(404, { message: 'Colección no encontrada' })
  await db.coleccion.delete({ where: { id } })
  if (actual.foto) await borrarArchivo(actual.foto)
  invalidar()
  return c.json({ ok: true })
})

const colorCuerpo = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre').max(40),
  hex: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Usa el formato #RRGGBB'),
})

catalogo.get('/colores', async (c) => c.json(await db.color.findMany({ orderBy: { nombre: 'asc' } })))

catalogo.post('/colores', async (c) => {
  const b = parse(colorCuerpo, await c.req.json().catch(() => ({})))
  const existe = await db.color.findUnique({ where: { nombre: b.nombre } })
  if (existe) throw new HTTPException(400, { message: 'Ya existe un color con ese nombre' })
  const x = await db.color.create({ data: b })
  invalidar()
  return c.json(x, 201)
})

catalogo.put('/colores/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const b = parse(colorCuerpo, await c.req.json().catch(() => ({})))
  const x = await db.color.update({ where: { id }, data: b }).catch(() => null)
  if (!x) throw new HTTPException(404, { message: 'Color no encontrado' })
  invalidar()
  return c.json(x)
})

catalogo.delete('/colores/:id', async (c) => {
  await db.color.delete({ where: { id: idParam(c.req.param('id')) } }).catch(() => null)
  invalidar()
  return c.json({ ok: true })
})

const faqCuerpo = z.object({
  pregunta: z.string().trim().min(3, 'Escribe la pregunta').max(200),
  respuesta: z.string().trim().min(2, 'Escribe la respuesta').max(1200),
  orden: z.coerce.number().int().min(0).default(0),
  activa: z.boolean().default(true),
})

catalogo.get('/faqs', async (c) => c.json(await db.faq.findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }] })))

catalogo.post('/faqs', async (c) => {
  const b = parse(faqCuerpo, await c.req.json().catch(() => ({})))
  const maximo = await db.faq.aggregate({ _max: { orden: true } })
  const x = await db.faq.create({ data: { ...b, orden: b.orden || (maximo._max.orden ?? 0) + 1 } })
  invalidar()
  return c.json(x, 201)
})

catalogo.put('/faqs/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  const b = parse(faqCuerpo, await c.req.json().catch(() => ({})))
  const x = await db.faq.update({ where: { id }, data: b }).catch(() => null)
  if (!x) throw new HTTPException(404, { message: 'Pregunta no encontrada' })
  invalidar()
  return c.json(x)
})

catalogo.delete('/faqs/:id', async (c) => {
  await db.faq.delete({ where: { id: idParam(c.req.param('id')) } }).catch(() => null)
  invalidar()
  return c.json({ ok: true })
})
