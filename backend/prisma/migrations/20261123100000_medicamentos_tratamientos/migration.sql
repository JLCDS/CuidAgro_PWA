-- CreateEnum
CREATE TYPE "TipoMedicamento" AS ENUM ('ANTIBIOTICO', 'ANTIPARASITARIO', 'VACUNA', 'VITAMINA', 'ANTIINFLAMATORIO', 'HORMONAL', 'OTRO');

-- CreateEnum
CREATE TYPE "UnidadMedicamento" AS ENUM ('ML', 'G', 'UNIDAD', 'DOSIS');

-- CreateEnum
CREATE TYPE "ViaAdministracion" AS ENUM ('ORAL', 'INTRAMUSCULAR', 'SUBCUTANEA', 'INTRAVENOSA', 'TOPICA', 'EN_AGUA', 'EN_ALIMENTO', 'OTRA');

-- CreateTable
CREATE TABLE "medicamentos" (
    "id" UUID NOT NULL,
    "finca_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoMedicamento" NOT NULL,
    "unidad" "UnidadMedicamento" NOT NULL,
    "stock" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha_vencimiento" DATE,
    "laboratorio" TEXT,
    "dias_retiro_carne" INTEGER,
    "dias_retiro_leche" INTEGER,
    "estado" "EstadoRegistro" NOT NULL DEFAULT 'ACTIVO',
    "motivo_baja" TEXT,
    "observaciones" TEXT,
    "creado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entradas_medicamento" (
    "id" UUID NOT NULL,
    "medicamento_id" UUID NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "nota" TEXT,
    "registrado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entradas_medicamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tratamientos" (
    "id" UUID NOT NULL,
    "finca_id" UUID NOT NULL,
    "vacuno_id" UUID,
    "lote_id" UUID,
    "caso_salud_id" UUID,
    "medicamento_id" UUID NOT NULL,
    "dosis" DECIMAL(12,2) NOT NULL,
    "via" "ViaAdministracion" NOT NULL,
    "fecha" DATE NOT NULL,
    "dias_retiro_carne" INTEGER,
    "dias_retiro_leche" INTEGER,
    "observaciones" TEXT,
    "registrado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tratamientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medicamentos_finca_id_idx" ON "medicamentos"("finca_id");

-- CreateIndex
CREATE INDEX "medicamentos_estado_idx" ON "medicamentos"("estado");

-- CreateIndex
CREATE INDEX "entradas_medicamento_medicamento_id_fecha_idx" ON "entradas_medicamento"("medicamento_id", "fecha");

-- CreateIndex
CREATE INDEX "tratamientos_finca_id_fecha_idx" ON "tratamientos"("finca_id", "fecha");

-- CreateIndex
CREATE INDEX "tratamientos_vacuno_id_idx" ON "tratamientos"("vacuno_id");

-- CreateIndex
CREATE INDEX "tratamientos_lote_id_idx" ON "tratamientos"("lote_id");

-- CreateIndex
CREATE INDEX "tratamientos_caso_salud_id_idx" ON "tratamientos"("caso_salud_id");

-- CreateIndex
CREATE INDEX "tratamientos_medicamento_id_fecha_idx" ON "tratamientos"("medicamento_id", "fecha");

-- AddForeignKey
ALTER TABLE "medicamentos" ADD CONSTRAINT "medicamentos_finca_id_fkey" FOREIGN KEY ("finca_id") REFERENCES "fincas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicamentos" ADD CONSTRAINT "medicamentos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_medicamento" ADD CONSTRAINT "entradas_medicamento_medicamento_id_fkey" FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_medicamento" ADD CONSTRAINT "entradas_medicamento_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_finca_id_fkey" FOREIGN KEY ("finca_id") REFERENCES "fincas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_vacuno_id_fkey" FOREIGN KEY ("vacuno_id") REFERENCES "vacunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_oviparos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_caso_salud_id_fkey" FOREIGN KEY ("caso_salud_id") REFERENCES "casos_salud"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_medicamento_id_fkey" FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Único por finca sin distinguir mayúsculas (no expresable en Prisma).
CREATE UNIQUE INDEX "medicamentos_finca_id_nombre_lower_key" ON "medicamentos"("finca_id", lower("nombre"));

-- Exactamente uno de vacuno_id / lote_id (no expresable en Prisma).
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_un_sujeto_chk" CHECK (num_nonnulls("vacuno_id", "lote_id") = 1);