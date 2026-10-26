import { Hono } from 'hono'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db.js'
import { requiereAdmin, type Sesion } from '../auth.js'
import { esquemas, leerAjustes, type ClaveAjuste } from '../ajustes.js'
import { parse } from '../util.js'
import { borrarArchivo, guardarPoster, guardarVideo, urlDe } from '../files.js'
import { invalidar } from '../cache.js'
import { cifras, incluirPedido } from '../pedidos.js'

export const sitio = new Hono<{ Variables: { admin: Sesion } }>()

sitio.use('*', requiereAdmin)

const heroUrls = (hero: { video: string; poster: string | null }[]) => hero.map((h, i) => ({ indice: i, video: urlDe(h.video), poster: urlDe(h.poster) }))

sitio.get('/ajustes', async (c) => {
  const a = await leerAjustes()
  return c.json({ ...a, hero: heroUrls(a.hero as { video: string; poster: string | null }[]) })
})

sitio.put('/ajustes/:clave', async (c) => {
  const clave = c.req.param('clave') as ClaveAjuste
  if (!(clave in esquemas) || clave === 'hero') throw new HTTPException(404, { message: 'Ajuste desconocido' })
  const valor = parse(esquemas[clave] as z.ZodTypeAny, await c.req.json().catch(() => ({})))
  await db.ajuste.upsert({ where: { clave }, update: { valor }, create: { clave, valor } })
  invalidar()
  return c.json(valor)
})

const leerHero = async () => ((await leerAjustes()).hero as { video: string; poster: string | null }[])

const guardarHero = async (lista: { video: string; poster: string | null }[]) => {
  await db.ajuste.upsert({ where: { clave: 'hero' }, update: { valor: lista }, create: { clave: 'hero', valor: lista } })
  invalidar()
  return heroUrls(lista)
}

sitio.post('/hero', async (c) => {
  const form = await c.req.parseBody()
  const video = form['video']
  const poster = form['poster']
  if (!(video instanceof File)) throw new HTTPException(400, { message: 'Selecciona un video' })
  const lista = await leerHero()
  if (lista.length >= 8) throw new HTTPException(400, { message: 'Máximo 8 videos' })
  const archivoVideo = await guardarVideo(video)
  const archivoPoster = poster instanceof File ? await guardarPoster(poster) : null
  lista.push({ video: archivoVideo, poster: archivoPoster })
  return c.json(await guardarHero(lista), 201)
})

sitio.put('/hero/orden', async (c) => {
  const b = parse(z.object({ indices: z.array(z.number().int().min(0)) }), await c.req.json().catch(() => ({})))
  const lista = await leerHero()
  const nueva = b.indices.filter((i) => i < lista.length).map((i) => lista[i]!)
  if (nueva.length !== lista.length) throw new HTTPException(400, { message: 'Orden inválido' })
  return c.json(await guardarHero(nueva))
})

sitio.delete('/hero/:indice', async (c) => {
  const i = Number(c.req.param('indice'))
  const lista = await leerHero()
  const x = lista[i]
  if (!x) throw new HTTPException(404, { message: 'Video no encontrado' })
  lista.splice(i, 1)
  await borrarArchivo(x.video)
  if (x.poster) await borrarArchivo(x.poster)
  return c.json(await guardarHero(lista))
})

sitio.get('/resumen', async (c) => {
  const [productos, agotados, ocultos, destacados, categorias, colecciones, porCategoria] = await Promise.all([
    db.producto.count(),
    db.producto.count({ where: { agotado: true } }),
    db.producto.count({ where: { oculto: true } }),
    db.producto.count({ where: { destacado: true } }),
    db.categoria.count(),
    db.coleccion.count(),
    db.categoria.findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }], include: { _count: { select: { productos: true } } } }),
  ])
  const sinFoto = await db.producto.count({ where: { fotos: { none: {} } } })
  const vivos = await db.pedido.findMany({ where: { cancelado: false, estado: { not: 'entregado' } }, include: incluirPedido })
  const pedidos = {
    nuevos: vivos.filter((p) => p.estado === 'recibido').length,
    porEnviar: vivos.filter((p) => p.estado === 'pagado' || p.estado === 'preparando').length,
    enCamino: vivos.filter((p) => p.estado === 'enviado').length,
    conSaldo: vivos.filter((p) => cifras(p).saldo > 0).length,
  }
  return c.json({
    pedidos,
    productos,
    agotados,
    ocultos,
    destacados,
    sinFoto,
    categorias,
    colecciones,
    porCategoria: porCategoria.map((x) => ({ nombre: x.nombre, total: x._count.productos })),
  })
})
