-- Fase 9: las fotos de novedades se guardan en la base y no en disco.
-- En el despliegue (Render, plan gratuito) el disco se borra al reiniciar o dormir el servicio.
-- `archivo` es el mismo nombre que guarda novedades.foto_archivo.
CREATE TABLE "fotos" (
    "archivo" TEXT NOT NULL,
    "datos" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_pkey" PRIMARY KEY ("archivo")
);
