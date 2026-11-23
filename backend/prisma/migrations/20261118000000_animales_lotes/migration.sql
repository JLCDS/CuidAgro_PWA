-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('MACHO', 'HEMBRA');

-- CreateEnum
CREATE TYPE "PropositoVacuno" AS ENUM ('ALIMENTACION', 'PRODUCCION_LECHERA', 'ENGORDE');

-- CreateEnum
CREATE TYPE "PropositoLote" AS ENUM ('PRODUCCION', 'ALIMENTACION');

-- CreateEnum
CREATE TYPE "EstadoRegistro" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateTable
CREATE TABLE "vacunos" (
    "id" UUID NOT NULL,
    "finca_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "sexo" "Sexo" NOT NULL,
    "raza" TEXT NOT NULL,
    "edad_meses" INTEGER NOT NULL,
    "peso" DECIMAL(7,2) NOT NULL,
    "fecha_llegada" DATE NOT NULL,
    "proposito" "PropositoVacuno" NOT NULL,
    "estado" "EstadoRegistro" NOT NULL DEFAULT 'ACTIVO',
    "motivo_baja" TEXT,
    "observaciones" TEXT,
    "creado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacunos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_oviparos" (
    "id" UUID NOT NULL,
    "finca_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo_ave" TEXT,
    "edad_min_semanas" INTEGER NOT NULL,
    "edad_max_semanas" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "proposito" "PropositoLote" NOT NULL,
    "fecha_ingreso" DATE,
    "estado" "EstadoRegistro" NOT NULL DEFAULT 'ACTIVO',
    "motivo_baja" TEXT,
    "observaciones" TEXT,
    "creado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lotes_oviparos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vacunos_finca_id_idx" ON "vacunos"("finca_id");

-- CreateIndex
CREATE INDEX "vacunos_estado_idx" ON "vacunos"("estado");

-- CreateIndex
CREATE INDEX "lotes_oviparos_finca_id_idx" ON "lotes_oviparos"("finca_id");

-- CreateIndex
CREATE INDEX "lotes_oviparos_estado_idx" ON "lotes_oviparos"("estado");

-- AddForeignKey
ALTER TABLE "vacunos" ADD CONSTRAINT "vacunos_finca_id_fkey" FOREIGN KEY ("finca_id") REFERENCES "fincas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacunos" ADD CONSTRAINT "vacunos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_oviparos" ADD CONSTRAINT "lotes_oviparos_finca_id_fkey" FOREIGN KEY ("finca_id") REFERENCES "fincas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_oviparos" ADD CONSTRAINT "lotes_oviparos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Nombre único por finca sin distinguir mayúsculas (Prisma no lo modela).
CREATE UNIQUE INDEX "vacunos_finca_id_nombre_lower_key" ON "vacunos"("finca_id", lower("nombre"));

CREATE UNIQUE INDEX "lotes_oviparos_finca_id_nombre_lower_key" ON "lotes_oviparos"("finca_id", lower("nombre"));
