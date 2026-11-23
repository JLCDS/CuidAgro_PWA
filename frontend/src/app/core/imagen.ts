export const LADO_MAXIMO = 1600;
export const CALIDAD_JPEG = 0.8;

/** Dimensiones finales: el lado mayor no pasa de `max` y nunca se agranda. */
export function dimensionesReducidas(ancho: number, alto: number, max = LADO_MAXIMO): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= max) return { ancho, alto };
  const factor = max / mayor;
  return { ancho: Math.round(ancho * factor), alto: Math.round(alto * factor) };
}

async function cargar(archivo: File): Promise<{ fuente: CanvasImageSource; ancho: number; alto: number; liberar: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      return { fuente: bmp, ancho: bmp.width, alto: bmp.height, liberar: () => bmp.close() };
    } catch {
      // Se intenta con <img>.
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Reduce la imagen (lado mayor 1600 px, JPEG calidad 0,8). Lanza error si el archivo no es una imagen legible. */
export async function reducirImagen(archivo: File): Promise<File> {
  const { fuente, ancho, alto, liberar } = await cargar(archivo);
  try {
    const { ancho: w, alto: h } = dimensionesReducidas(ancho, alto);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Sin canvas');
    ctx.drawImage(fuente, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', CALIDAD_JPEG));
    if (!blob) throw new Error('No se pudo comprimir la imagen');
    const base = archivo.name.replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } finally {
    liberar();
  }
}
