import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { validacion } from './errors.js';
import { prisma } from './prisma.js';

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

// Las fotos se guardan en la tabla `fotos` (no en disco): el disco del despliegue
// gratuito se borra cada vez que el servicio se reinicia o se duerme.
// `archivo` es la clave que la novedad guarda en `fotoArchivo`.

/** Guarda la foto con un nombre propio y devuelve los datos para la novedad. */
export async function guardarFoto(buffer) {
  const { mime, ext } = tipoDeImagen(buffer);
  const archivo = `${randomUUID()}.${ext}`;
  await prisma.foto.create({ data: { archivo, datos: buffer } });
  return { fotoArchivo: archivo, fotoMime: mime, fotoBytes: buffer.length };
}

/** Borrar es de mejor esfuerzo: una foto huérfana no debe tumbar la petición. */
export async function borrarFoto(archivo) {
  if (!archivo) return;
  try {
    await prisma.foto.deleteMany({ where: { archivo } });
  } catch {
    // ya no existe o la base no respondió
  }
}

export async function leerFoto(archivo) {
  const foto = await prisma.foto.findUnique({ where: { archivo } });
  return foto ? Buffer.from(foto.datos) : null;
}
