import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import { env } from './env.js'

const MAX_IMAGEN = 15 * 1024 * 1024
const MAX_VIDEO = 80 * 1024 * 1024

export const asegurarCarpetas = async () => {
  for (const d of ['productos', 'colecciones', 'hero']) {
    await fs.mkdir(path.join(env.uploads, d), { recursive: true })
  }
}

const sufijo = () => crypto.randomBytes(4).toString('hex')

export const smDe = (archivo: string) => archivo.replace(/\.webp$/, '-sm.webp')

export const guardarImagen = async (carpeta: 'productos' | 'colecciones', base: string, file: File) => {
  if (!file.type.startsWith('image/')) throw new HTTPException(400, { message: 'El archivo no es una imagen' })
  if (file.size > MAX_IMAGEN) throw new HTTPException(400, { message: 'La imagen supera los 15 MB' })
  const buf = Buffer.from(await file.arrayBuffer())
  const nombre = `${base}-${sufijo()}`
  const lg = `${carpeta}/${nombre}.webp`
  const sm = `${carpeta}/${nombre}-sm.webp`
  try {
    const grande = await sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true })
    await fs.writeFile(path.join(env.uploads, lg), grande.data)
    const chica = await sharp(buf).rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer()
    await fs.writeFile(path.join(env.uploads, sm), chica)
    return { archivo: lg, ancho: grande.info.width, alto: grande.info.height }
  } catch {
    throw new HTTPException(400, { message: 'No se pudo procesar la imagen' })
  }
}

export const guardarVideo = async (file: File) => {
  const permitido = ['video/mp4', 'video/webm']
  if (!permitido.includes(file.type)) throw new HTTPException(400, { message: 'El video debe ser MP4 o WebM' })
  if (file.size > MAX_VIDEO) throw new HTTPException(400, { message: 'El video supera los 80 MB' })
  const ext = file.type === 'video/webm' ? 'webm' : 'mp4'
  const nombre = `hero/video-${sufijo()}.${ext}`
  await fs.writeFile(path.join(env.uploads, nombre), Buffer.from(await file.arrayBuffer()))
  return nombre
}

export const guardarPoster = async (file: File) => {
  if (!file.type.startsWith('image/')) throw new HTTPException(400, { message: 'El archivo no es una imagen' })
  const buf = Buffer.from(await file.arrayBuffer())
  const nombre = `hero/poster-${sufijo()}.webp`
  const out = await sharp(buf).rotate().resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
  await fs.writeFile(path.join(env.uploads, nombre), out)
  return nombre
}

export const borrarArchivo = async (archivo: string) => {
  const seguro = path.normalize(archivo).replace(/^(\.\.[/\\])+/, '')
  for (const a of [seguro, smDe(seguro)]) {
    try {
      await fs.unlink(path.join(env.uploads, a))
    } catch {
      continue
    }
  }
}

export const urlDe = (archivo: string | null | undefined) => (archivo ? `${env.publicUrl}/uploads/${archivo}` : null)
