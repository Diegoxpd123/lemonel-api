# Lemonel API

API de la tienda Lemonel: productos, fotos, colecciones, colores, preguntas frecuentes y ajustes. La consumen la tienda (`lemonel`) y el panel (`lemonel-admin`). Hono + Prisma + PostgreSQL.

## Desarrollo local

```bash
npm install
npm run db:dev        # PostgreSQL local en el puerto 5433 (déjalo corriendo)
npx prisma migrate deploy
npm run dev           # API en http://localhost:50002
npm run importar      # carga el catálogo (152 productos con fotos) en la base
```

El primer administrador se crea solo al iniciar, con `ADMIN_EMAIL` y `ADMIN_PASSWORD` del `.env`.

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Cadena de conexión de PostgreSQL |
| `JWT_SECRET` | Texto largo y aleatorio para firmar la sesión |
| `PUBLIC_URL` | URL pública de esta API (se usa para armar los enlaces de las fotos) |
| `CORS_ORIGINS` | Dominios del panel y de la tienda, separados por comas |
| `UPLOADS_DIR` | Carpeta de fotos y videos. Debe ser un volumen persistente (`/data/uploads`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Primer administrador (solo si no existe ninguno) |
| `PORT` | Puerto (por defecto 50002) |

## Despliegue en Dokploy

1. Crear una base de datos PostgreSQL y copiar su cadena de conexión.
2. Crear la aplicación desde este repositorio con el `Dockerfile`, puerto 50002 y dominio `lemonel-api`.
3. Cargar las variables de la tabla y agregar un volumen persistente montado en `/data/uploads`.
4. Al iniciar, el contenedor aplica las migraciones solo.
5. Cargar el catálogo desde tu computadora:

```bash
API_URL=https://lemonel-api.tupaginazo.com IMPORT_EMAIL=correo@lemonel.pe IMPORT_PASSWORD=clave npm run importar
```

El importador no duplica productos: si ya existen, los salta.

## Rutas principales

- `GET /api/public/catalogo`: todo lo que necesita la tienda, en una sola respuesta.
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.
- `/api/admin/*`: productos, fotos, categorías, colecciones, colores, preguntas, ajustes y videos de portada (requieren sesión).
- `GET /uploads/*`: fotos y videos.

## Pedidos y seguimiento

- `POST /api/public/pedidos`: crea un pedido desde el carrito de la tienda. El servidor recalcula precios y descuentos y valida opciones y stock. Límite de 8 por hora por IP (cabecera `x-forwarded-for`) y 300 por hora en total.
- `GET /api/public/pedido/:token`: vista pública del comprador. Solo expone nombre de pila, productos, montos, estados y mensajes. Nunca teléfono, nota interna, método de pago ni capturas.
- `/api/admin/pedidos/*`: lista con filtros y búsqueda, creación a mano, edición, cambio de estado, pagos con captura, cancelar, link nuevo y borrado.
- Las capturas de pago se guardan en `UPLOADS_DIR/privado/pagos` y solo se sirven por `GET /api/admin/pedidos/pagos/:id/captura` con sesión. `/uploads/privado/*` responde 404.
- Estados: `recibido`, `pagado`, `preparando`, `enviado`, `entregado` (más `cancelado` como bandera).

## Sesión del panel

La sesión usa una cookie `HttpOnly` con `SameSite=Lax`. Por eso el panel y la API deben estar bajo el mismo dominio principal (por ejemplo `lemonel-admin.tupaginazo.com` y `lemonel-api.tupaginazo.com`).
