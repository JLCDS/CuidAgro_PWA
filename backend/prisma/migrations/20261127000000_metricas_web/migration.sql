-- Fase 11: métricas de campo (Core Web Vitals) enviadas por la app. Sin datos personales.
-- CreateEnum
CREATE TYPE "NombreMetrica" AS ENUM ('LCP', 'INP', 'CLS', 'FCP', 'TTFB');

-- CreateEnum
CREATE TYPE "CalificacionMetrica" AS ENUM ('BUENA', 'MEJORABLE', 'MALA');

-- CreateEnum
CREATE TYPE "DispositivoMetrica" AS ENUM ('MOVIL', 'ESCRITORIO');

-- CreateTable
CREATE TABLE "metricas_web" (
    "id" UUID NOT NULL,
    "nombre" "NombreMetrica" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "calificacion" "CalificacionMetrica" NOT NULL,
    "ruta" TEXT NOT NULL,
    "dispositivo" "DispositivoMetrica" NOT NULL,
    "conexion" TEXT,
    "version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metricas_web_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metricas_web_nombre_created_at_idx" ON "metricas_web"("nombre", "created_at");
