-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Admin" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "seccion" TEXT NOT NULL DEFAULT '',
    "material" TEXT NOT NULL DEFAULT '',
    "descripcion" TEXT NOT NULL DEFAULT '',
    "agotado" BOOLEAN NOT NULL DEFAULT false,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "destacado" BOOLEAN NOT NULL DEFAULT false,
    "nuevo" BOOLEAN NOT NULL DEFAULT false,
    "escogeDiseno" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variante" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "sku" TEXT,
    "agotado" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Variante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opcion" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "valores" TEXT[],
    "requerida" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Opcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Foto" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "archivo" TEXT NOT NULL,
    "ancho" INTEGER NOT NULL DEFAULT 0,
    "alto" INTEGER NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Foto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coleccion" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "foto" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Coleccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoColeccion" (
    "productoId" INTEGER NOT NULL,
    "coleccionId" INTEGER NOT NULL,

    CONSTRAINT "ProductoColeccion_pkey" PRIMARY KEY ("productoId","coleccionId")
);

-- CreateTable
CREATE TABLE "Color" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "hex" TEXT NOT NULL,

    CONSTRAINT "Color_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" SERIAL NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ajuste" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,

    CONSTRAINT "Ajuste_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_slug_key" ON "Categoria"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_slug_key" ON "Producto"("slug");

-- CreateIndex
CREATE INDEX "Producto_categoriaId_idx" ON "Producto"("categoriaId");

-- CreateIndex
CREATE INDEX "Producto_orden_idx" ON "Producto"("orden");

-- CreateIndex
CREATE INDEX "Variante_productoId_idx" ON "Variante"("productoId");

-- CreateIndex
CREATE INDEX "Opcion_productoId_idx" ON "Opcion"("productoId");

-- CreateIndex
CREATE INDEX "Foto_productoId_idx" ON "Foto"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "Coleccion_slug_key" ON "Coleccion"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Color_nombre_key" ON "Color"("nombre");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variante" ADD CONSTRAINT "Variante_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opcion" ADD CONSTRAINT "Opcion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoColeccion" ADD CONSTRAINT "ProductoColeccion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoColeccion" ADD CONSTRAINT "ProductoColeccion_coleccionId_fkey" FOREIGN KEY ("coleccionId") REFERENCES "Coleccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

