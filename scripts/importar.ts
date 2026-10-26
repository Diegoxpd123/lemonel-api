import fs from 'node:fs'
import path from 'node:path'

const API = (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 50002}`).replace(/\/$/, '')
const EMAIL = process.env.IMPORT_EMAIL ?? process.env.ADMIN_EMAIL ?? ''
const PASSWORD = process.env.IMPORT_PASSWORD ?? process.env.ADMIN_PASSWORD ?? ''
const SEED = path.resolve('seed')

type Seed = {
  config: { whatsapp: string; instagram: string; tiktok: string; faq: [string, string][] }
  productos: {
    slug: string
    nombre: string
    categoria: string
    seccion: string
    material: string
    descripcion: string
    agotado: boolean
    destacado: boolean
    nuevo: boolean
    escogeDiseno: boolean
    variantes: { tipo: string; precio: number; sku: string | null }[]
    opciones: { nombre: string; valores: string[]; requerida: boolean }[]
    fotos: { archivo: string }[]
  }[]
}

const categorias = [
  { slug: 'collares', nombre: 'Collares', descripcion: 'Cadenas, dijes y combinaciones para cada día.' },
  { slug: 'aretes', nombre: 'Aretes', descripcion: 'Aros, chunkys y detalles pequeños.' },
  { slug: 'anillos', nombre: 'Anillos', descripcion: 'Regulables, para combinar y apilar.' },
  { slug: 'pulseras', nombre: 'Pulseras', descripcion: 'Brazaletes, cadenas y acrílicas.' },
  { slug: 'relojes', nombre: 'Relojes', descripcion: 'Relojes en acero con baño de oro.' },
]

const colores: Record<string, string> = {
  Dorado: '#D6B36A',
  Plateado: '#C9CCD1',
  Rojo: '#B3262E',
  Morado: '#6F3F9B',
  Rosado: '#E8A3B5',
  Azul: '#2F5DA8',
  Verde: '#3F7F5B',
  Negro: '#1E1E1E',
  Blanco: '#F8F6F1',
  Cristalino: '#E3EEF3',
  Tornasolado: '#BFD7E3',
  Celeste: '#9CCBE6',
  Vino: '#6E1F2F',
  Lila: '#C3A6E0',
  'Rosado nacarado': '#F2CFD6',
  'Rosado bebé': '#F7D3DD',
  'Verde bebé': '#BFE3C9',
  Traslúcido: '#EDEFF1',
}

const colecciones = [
  { nombre: 'Sol y luna', descripcion: 'Piezas con brillo propio.', patron: /\bsol(es|una)?\b|luna/i, principal: 'sol-y-luna' },
  { nombre: 'Tréboles', descripcion: 'La suerte se lleva puesta.', patron: /tr[eé]bol|van cleef/i, principal: 'van-cleef' },
  { nombre: 'Flores', descripcion: 'Jardines para llevar.', patron: /flor|tulip|margarita|p[eé]talos|floral|jard[ií]n/i, principal: 'tulipan' },
  { nombre: 'Corazones', descripcion: 'Para quien más quieres.', patron: /coraz[oó]n|love/i, principal: 'corazon-minimalista' },
  { nombre: 'Iniciales', descripcion: 'Tu letra, tu historia.', patron: /inicial/i, principal: 'inicial-globo' },
  { nombre: 'Perlas', descripcion: 'Clásicas y delicadas.', patron: /perla/i, principal: 'perlas' },
  { nombre: 'En pareja', descripcion: 'Regalos para compartir.', patron: /pareja|juntos/i, principal: 'cruz-en-pareja' },
]

let cookie = ''

const llamar = async (ruta: string, init: RequestInit = {}) => {
  const res = await fetch(`${API}${ruta}`, { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) } })
  const texto = await res.text()
  const datos = texto ? JSON.parse(texto) : null
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${ruta} → ${res.status} ${datos?.error ?? texto}`)
  return { datos, res }
}

const json = (cuerpo: unknown, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })

const archivo = (nombre: string) => {
  const buf = fs.readFileSync(path.join(SEED, 'img', nombre))
  return new Blob([buf], { type: 'image/webp' })
}

const principal = async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(SEED, 'productos.json'), 'utf8')) as Seed

  const login = await llamar('/api/auth/login', json({ email: EMAIL, password: PASSWORD }))
  cookie = (login.res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  console.log('Sesión iniciada')

  const catsExistentes = (await llamar('/api/admin/categorias')).datos as { id: number; slug: string }[]
  const catId = new Map(catsExistentes.map((c) => [c.slug, c.id]))
  for (const [i, c] of categorias.entries()) {
    if (catId.has(c.slug)) continue
    const r = await llamar('/api/admin/categorias', json({ nombre: c.nombre, descripcion: c.descripcion, orden: i + 1, activa: true }))
    catId.set(r.datos.slug, r.datos.id)
  }
  console.log('Categorías listas')

  const coloresActuales = new Set(((await llamar('/api/admin/colores')).datos as { nombre: string }[]).map((c) => c.nombre))
  for (const [nombre, hex] of Object.entries(colores)) {
    if (!coloresActuales.has(nombre)) await llamar('/api/admin/colores', json({ nombre, hex }))
  }
  console.log('Colores listos')

  const faqsActuales = (await llamar('/api/admin/faqs')).datos as unknown[]
  if (!faqsActuales.length) {
    for (const [i, [pregunta, respuesta]] of seed.config.faq.entries()) {
      await llamar('/api/admin/faqs', json({ pregunta, respuesta, orden: i + 1, activa: true }))
    }
  }
  console.log('Preguntas frecuentes listas')

  await llamar('/api/admin/ajustes/contacto', json({ whatsapp: seed.config.whatsapp, instagram: seed.config.instagram, tiktok: seed.config.tiktok, email: '' }, 'PUT'))

  const existentes = (await llamar('/api/admin/productos')).datos as { id: number; nombre: string; categoria: string }[]
  const clave = (n: string, c: string) => `${c}|${n}`
  const ya = new Map(existentes.map((p) => [clave(p.nombre, p.categoria), p.id]))
  const idPorSlug = new Map<string, number>()
  let creados = 0

  for (const p of seed.productos) {
    const previo = ya.get(clave(p.nombre, p.categoria))
    if (previo) {
      idPorSlug.set(p.slug, previo)
      continue
    }
    const cuerpo = {
      nombre: p.nombre,
      categoriaId: catId.get(p.categoria),
      seccion: p.seccion,
      material: p.material,
      descripcion: p.descripcion,
      agotado: p.agotado,
      oculto: false,
      destacado: p.destacado,
      nuevo: p.nuevo,
      escogeDiseno: p.escogeDiseno,
      variantes: p.variantes.map((v) => ({ tipo: v.tipo, precio: v.precio, sku: v.sku, agotado: false })),
      opciones: p.opciones.filter((o) => o.valores.length > 0).map((o) => ({ nombre: o.nombre, valores: o.valores, requerida: o.requerida })),
      colecciones: [],
    }
    const r = await llamar('/api/admin/productos', json(cuerpo))
    const id = r.datos.id as number
    idPorSlug.set(p.slug, id)
    for (const f of p.fotos) {
      const form = new FormData()
      form.append('fotos', archivo(f.archivo), f.archivo)
      await llamar(`/api/admin/productos/${id}/fotos`, { method: 'POST', body: form })
    }
    creados += 1
    if (creados % 10 === 0) console.log(`  ${creados} productos creados`)
  }
  console.log(`Productos nuevos: ${creados}`)

  const colActuales = (await llamar('/api/admin/colecciones')).datos as { id: number; nombre: string }[]
  const colId = new Map(colActuales.map((c) => [c.nombre, c.id]))
  for (const [i, c] of colecciones.entries()) {
    const miembros = seed.productos.filter((p) => c.patron.test(p.nombre)).map((p) => idPorSlug.get(p.slug)).filter((x): x is number => !!x)
    let id = colId.get(c.nombre)
    if (!id) {
      const r = await llamar('/api/admin/colecciones', json({ nombre: c.nombre, descripcion: c.descripcion, orden: i + 1, activa: true, productoIds: miembros }))
      id = r.datos.id as number
      const base = seed.productos.find((p) => p.slug === c.principal)
      if (base?.fotos[0]) {
        const form = new FormData()
        form.append('foto', archivo(base.fotos[0].archivo), base.fotos[0].archivo)
        await llamar(`/api/admin/colecciones/${id}/foto`, { method: 'POST', body: form })
      }
    } else {
      await llamar(`/api/admin/colecciones/${id}`, json({ nombre: c.nombre, descripcion: c.descripcion, orden: i + 1, activa: true, productoIds: miembros }, 'PUT'))
    }
  }
  console.log('Colecciones listas')
}

principal().catch((e) => {
  console.error(e)
  process.exit(1)
})
