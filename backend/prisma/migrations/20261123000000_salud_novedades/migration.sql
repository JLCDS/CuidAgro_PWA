-- CreateEnum
CREATE TYPE "TipoNovedad" AS ENUM ('ENFERMEDAD', 'LESION', 'MUERTE', 'COMPORTAMIENTO', 'PRODUCCION', 'INFRAESTRUCTURA', 'OTRO');

-- CreateEnum
CREATE TYPE "PrioridadNovedad" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "EstadoNovedad" AS ENUM ('ABIERTA', 'EN_SEGUIMIENTO', 'CERRADA');

-- CreateEnum
CREATE TYPE "EstadoCasoSalud" AS ENUM ('EN_OBSERVACION', 'EN_TRATAMIENTO', 'RECUPERADO', 'FALLECIDO');

-- CreateTable
CREATE TABLE "novedades" (
    "id" UUID NOT NULL,
    "finca_id" UUID NOT NULL,
    "vacuno_id" UUID,
    "lote_id" UUID,
    "tipo" "TipoNovedad" NOT NULL,
    "prioridad" "PrioridadNovedad" NOT NULL DEFAULT 'MEDIA',
    "descripcion" TEXT NOT NULL,
    "fecha_hora" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitud" DECIMAL(9,6),
    "longitud" DECIMAL(9,6),
    "precision_metros" INTEGER,
    "foto_archivo" TEXT,
    "foto_mime" TEXT,
    "foto_bytes" INTEGER,
    "estado" "EstadoNovedad" NOT NULL DEFAULT 'ABIERTA',
    "cerrada_en" TIMESTAMPTZ(3),
    "registrado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "novedades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentarios_novedad" (
    "id" UUID NOT NULL,
    "novedad_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_novedad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos_salud" (
    "id" UUID NOT NULL,
    "finca_id" UUID NOT NULL,
    "vacuno_id" UUID,
    "lote_id" UUID,
    "novedad_id" UUID,
    "diagnostico" TEXT NOT NULL,
    "sintomas" TEXT,
    "estado" "EstadoCasoSalud" NOT NULL DEFAULT 'EN_OBSERVACION',
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE,
    "animales_afectados" INTEGER,
    "observaciones" TEXT,
    "registrado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "casos_salud_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "novedades_finca_id_fecha_hora_idx" ON "novedades"("finca_id", "fecha_hora");

-- CreateIndex
CREATE INDEX "novedades_vacuno_id_idx" ON "novedades"("vacuno_id");

-- CreateIndex
CREATE INDEX "novedades_lote_id_idx" ON "novedades"("lote_id");

-- CreateIndex
CREATE INDEX "comentarios_novedad_novedad_id_created_at_idx" ON "comentarios_novedad"("novedad_id", "created_at");

-- CreateIndex
CREATE INDEX "casos_salud_finca_id_estado_idx" ON "casos_salud"("finca_id", "estado");

-- CreateIndex
CREATE INDEX "casos_salud_vacuno_id_idx" ON "casos_salud"("vacuno_id");

-- CreateIndex
CREATE INDEX "casos_salud_lote_id_idx" ON "casos_salud"("lote_id");

-- AddForeignKey
ALTER TABLE "novedades" ADD CONSTRAINT "novedades_finca_id_fkey" FOREIGN KEY ("finca_id") REFERENCES "fincas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedades" ADD CONSTRAINT "novedades_vacuno_id_fkey" FOREIGN KEY ("vacuno_id") REFERENCES "vacunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedades" ADD CONSTRAINT "novedades_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_oviparos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedades" ADD CONSTRAINT "novedades_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_novedad" ADD CONSTRAINT "comentarios_novedad_novedad_id_fkey" FOREIGN KEY ("novedad_id") REFERENCES "novedades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_novedad" ADD CONSTRAINT "comentarios_novedad_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_salud" ADD CONSTRAINT "casos_salud_finca_id_fkey" FOREIGN KEY ("finca_id") REFERENCES "fincas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_salud" ADD CONSTRAINT "casos_salud_vacuno_id_fkey" FOREIGN KEY ("vacuno_id") REFERENCES "vacunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_salud" ADD CONSTRAINT "casos_salud_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_oviparos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_salud" ADD CONSTRAINT "casos_salud_novedad_id_fkey" FOREIGN KEY ("novedad_id") REFERENCES "novedades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_salud" ADD CONSTRAINT "casos_salud_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Exactamente uno de vacuno_id / lote_id (no expresable en Prisma).
ALTER TABLE "novedades" ADD CONSTRAINT "novedades_un_sujeto_chk" CHECK (num_nonnulls("vacuno_id", "lote_id") = 1);
ALTER TABLE "casos_salud" ADD CONSTRAINT "casos_salud_un_sujeto_chk" CHECK (num_nonnulls("vacuno_id", "lote_id") = 1);
