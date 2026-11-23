import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { validacion } from './errors.js';

export const MAX_FOTO_BYTES = 5 * 1024 * 1024;

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FOTO_BYTES, files: 1, fields: 20, parts: 25 },
}).single('foto');

function errorDeSubida(error) {
  if (error?.code === 'LIMIT_FILE_SIZE') return validacion('foto', 'La foto no puede superar 5 MB');
  if (error?.code === 'LIMIT_UNEXPECTED_FILE') return validacion('foto', 'El archivo debe enviarse en el campo "foto"');
  if (error?.code === 'LIMIT_FILE_COUNT') return validacion('foto', 'Envía una sola foto');
  return validacion('foto', 'No se pudo leer la foto enviada');
}

/** Lee un multipart con el campo `foto` opcional. Deja los campos de texto en `req.body` y el archivo en `req.file`. */
export function leerMultipart(req, res) {
  return new Promise((resolve, reject) => {
    subida(req, res, (error) => (error ? reject(errorDeSubida(error)) : resolve()));
  });
}

/** Un multipart envía todo como texto: los campos vacíos se tratan como ausentes. */
export const sinCamposVacios = (cuerpo = {}) => Object.fromEntries(Object.entries(cuerpo).filter(([, v]) => v !== ''));

const FIRMAS = [
  { mime: 'image/jpeg', ext: 'jpg', coincide: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    coincide: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    coincide: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** Valida por bytes mágicos (no por el mimetype declarado). Devuelve `{ mime, ext }` o lanza 400. */
export function tipoDeImagen(buffer) {
  const tipo = buffer && buffer.length >= 12 ? FIRMAS.find((f) => f.coincide(buffer)) : null;
  if (!tipo) throw validacion('foto', 'La foto debe ser una imagen JPEG, PNG o WebP');
  return { mime: tipo.mime, ext: tipo.ext };
}

/** Guarda el archivo con un nombre propio y devuelve los datos para la base. */
export async function guardarFoto(buffer) {
  const { mime, ext } = tipoDeImagen(buffer);
  const archivo = `${randomUUID()}.${ext}`;
  await mkdir(env.UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(env.UPLOADS_DIR, archivo), buffer);
  return { fotoArchivo: archivo, fotoMime: mime, fotoBytes: buffer.length };
}

/** Borrar es de mejor esfuerzo: un archivo huérfano no debe tumbar la petición. */
export async function borrarFoto(archivo) {
  if (!archivo) return;
  try {
    await unlink(path.join(env.UPLOADS_DIR, path.basename(archivo)));
  } catch {
    // ya no existe
  }
}

export async function leerFoto(archivo) {
  try {
    return await readFile(path.join(env.UPLOADS_DIR, path.basename(archivo)));
  } catch {
    return null;
  }
}
