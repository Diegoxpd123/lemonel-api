import { z } from 'zod'
import path from 'node:path'

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(50002),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PUBLIC_URL: z.string().url().default('http://localhost:50002'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:4321'),
  UPLOADS_DIR: z.string().default('./uploads'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_NAME: z.string().default('Lemonel'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Variables de entorno inválidas:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  uploads: path.resolve(parsed.data.UPLOADS_DIR),
  origins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  publicUrl: parsed.data.PUBLIC_URL.replace(/\/$/, ''),
}
