-- AlterTable
ALTER TABLE "consumos_vacunos" ADD COLUMN "cliente_id" UUID;

-- AlterTable
ALTER TABLE "consumos_lotes" ADD COLUMN "cliente_id" UUID;

-- AlterTable
ALTER TABLE "novedades" ADD COLUMN "cliente_id" UUID;

-- CreateTable
CREATE TABLE "suscripciones_push" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suscripciones_push_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avisos_enviados" (
    "id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_enviados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consumos_vacunos_cliente_id_key" ON "consumos_vacunos"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "consumos_lotes_cliente_id_key" ON "consumos_lotes"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "novedades_cliente_id_key" ON "novedades"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_push_endpoint_key" ON "suscripciones_push"("endpoint");

-- CreateIndex
CREATE INDEX "suscripciones_push_usuario_id_idx" ON "suscripciones_push"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "avisos_enviados_clave_key" ON "avisos_enviados"("clave");

-- AddForeignKey
ALTER TABLE "suscripciones_push" ADD CONSTRAINT "suscripciones_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
