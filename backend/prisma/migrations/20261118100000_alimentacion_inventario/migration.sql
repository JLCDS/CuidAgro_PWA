-- CreateEnum
CREATE TYPE "TipoAlimento" AS ENUM ('CONCENTRADO', 'FORRAJE', 'GRANO', 'SUPLEMENTO', 'SAL_MINERAL', 'OTRO');

-- CreateEnum
CREATE TYPE "Jornada" AS ENUM ('MANANA', 'TARDE', 'NOCHE');

-- CreateTable
CREATE TABLE "alimentos" (
    "id" UUID NOT NULL,
    "finca_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoAlimento" NOT NULL,
    "stock_gramos" INTEGER NOT NULL DEFAULT 0,
    "stock_minimo_gramos" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoRegistro" NOT NULL DEFAULT 'ACTIVO',
    "motivo_baja" TEXT,
    "observaciones" TEXT,
    "creado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entradas_alimento" (
    "id" UUID NOT NULL,
    "alimento_id" UUID NOT NULL,
    "cantidad_gramos" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "nota" TEXT,
    "registrado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entradas_alimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumos_vacunos" (
    "id" UUID NOT NULL,
    "vacuno_id" UUID NOT NULL,
    "alimento_id" UUID NOT NULL,
    "cantidad_gramos" INTEGER NOT NULL,
    "jornada" "Jornada" NOT NULL,
    "fecha" DATE NOT NULL,
    "observaciones" TEXT,
    "registrado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumos_vacunos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumos_lotes" (
    "id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "alimento_id" UUID NOT NULL,
    "cantidad_gramos" INTEGER NOT NULL,
    "jornada" "Jornada" NOT NULL,
    "fecha" DATE NOT NULL,
    "observaciones" TEXT,
    "registrado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumos_lotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alimentos_finca_id_idx" ON "alimentos"("finca_id");

-- CreateIndex
CREATE INDEX "alimentos_estado_idx" ON "alimentos"("estado");

-- CreateIndex
CREATE INDEX "entradas_alimento_alimento_id_fecha_idx" ON "entradas_alimento"("alimento_id", "fecha");

-- CreateIndex
CREATE INDEX "consumos_vacunos_alimento_id_fecha_idx" ON "consumos_vacunos"("alimento_id", "fecha");

-- CreateIndex
CREATE INDEX "consumos_vacunos_fecha_idx" ON "consumos_vacunos"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "consumos_vacunos_vacuno_id_alimento_id_fecha_jornada_key" ON "consumos_vacunos"("vacuno_id", "alimento_id", "fecha", "jornada");

-- CreateIndex
CREATE INDEX "consumos_lotes_alimento_id_fecha_idx" ON "consumos_lotes"("alimento_id", "fecha");

-- CreateIndex
CREATE INDEX "consumos_lotes_fecha_idx" ON "consumos_lotes"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "consumos_lotes_lote_id_alimento_id_fecha_jornada_key" ON "consumos_lotes"("lote_id", "alimento_id", "fecha", "jornada");

-- AddForeignKey
ALTER TABLE "alimentos" ADD CONSTRAINT "alimentos_finca_id_fkey" FOREIGN KEY ("finca_id") REFERENCES "fincas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alimentos" ADD CONSTRAINT "alimentos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_alimento" ADD CONSTRAINT "entradas_alimento_alimento_id_fkey" FOREIGN KEY ("alimento_id") REFERENCES "alimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_alimento" ADD CONSTRAINT "entradas_alimento_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_vacunos" ADD CONSTRAINT "consumos_vacunos_vacuno_id_fkey" FOREIGN KEY ("vacuno_id") REFERENCES "vacunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_vacunos" ADD CONSTRAINT "consumos_vacunos_alimento_id_fkey" FOREIGN KEY ("alimento_id") REFERENCES "alimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_vacunos" ADD CONSTRAINT "consumos_vacunos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_lotes" ADD CONSTRAINT "consumos_lotes_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_oviparos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_lotes" ADD CONSTRAINT "consumos_lotes_alimento_id_fkey" FOREIGN KEY ("alimento_id") REFERENCES "alimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_lotes" ADD CONSTRAINT "consumos_lotes_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Nombre único por finca sin distinguir mayúsculas, también entre inactivos (Prisma no lo modela).
CREATE UNIQUE INDEX "alimentos_finca_id_nombre_lower_key" ON "alimentos"("finca_id", lower("nombre"));
