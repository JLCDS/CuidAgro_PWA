-- Fase 10: espacios del galpón (cuadrantes y zonas), raciones por semana y espacio de los lotes y consumos.
CREATE TYPE "TipoEspacio" AS ENUM ('CUADRANTE', 'ZONA', 'OTRO');

CREATE TABLE "espacios" (
    "id" UUID NOT NULL,
    "finca_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT,
    "tipo" "TipoEspacio" NOT NULL,
    "capacidad" INTEGER,
    "estado" "EstadoRegistro" NOT NULL DEFAULT 'ACTIVO',
    "motivo_baja" TEXT,
    "observaciones" TEXT,
    "creado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "espacios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "raciones_semanales" (
    "finca_id" UUID NOT NULL,
    "proposito" "PropositoLote" NOT NULL,
    "semana" INTEGER NOT NULL,
    "gramos_ave_dia" INTEGER NOT NULL,

    CONSTRAINT "raciones_semanales_pkey" PRIMARY KEY ("finca_id","proposito","semana")
);

ALTER TABLE "lotes_oviparos" ADD COLUMN "espacio_id" UUID;
ALTER TABLE "consumos_lotes" ADD COLUMN "espacio_id" UUID;

CREATE UNIQUE INDEX "espacios_finca_id_codigo_key" ON "espacios"("finca_id", "codigo");
CREATE INDEX "lotes_oviparos_espacio_id_idx" ON "lotes_oviparos"("espacio_id");
CREATE INDEX "consumos_lotes_espacio_id_fecha_idx" ON "consumos_lotes"("espacio_id", "fecha");

-- Un espacio solo admite un lote activo (también ante dos peticiones simultáneas).
CREATE UNIQUE INDEX "lotes_espacio_activo_uq" ON "lotes_oviparos"("espacio_id") WHERE "estado" = 'ACTIVO' AND "espacio_id" IS NOT NULL;

ALTER TABLE "espacios" ADD CONSTRAINT "espacios_finca_id_fkey" FOREIGN KEY ("finca_id") REFERENCES "fincas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "espacios" ADD CONSTRAINT "espacios_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raciones_semanales" ADD CONSTRAINT "raciones_semanales_finca_id_fkey" FOREIGN KEY ("finca_id") REFERENCES "fincas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lotes_oviparos" ADD CONSTRAINT "lotes_oviparos_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consumos_lotes" ADD CONSTRAINT "consumos_lotes_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
