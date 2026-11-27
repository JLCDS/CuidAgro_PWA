// Se ejecuta después de `ng build`: escribe en dist/frontend/browser/sw.js la lista de
// archivos a precachear (con sus hashes) y una versión que cambia cuando cambia algún archivo.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const salida = join(fileURLToPath(new URL('..', import.meta.url)), 'dist', 'frontend', 'browser');

function listar(carpeta) {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    return statSync(ruta).isDirectory() ? listar(ruta) : [ruta];
  });
}

// El SW, los mapas y las licencias no se precachean; "/" se resuelve con index.html.
const archivos = listar(salida)
  .map((ruta) => relative(salida, ruta).split(sep).join('/'))
  .filter((r) => r !== 'sw.js' && !r.endsWith('.map') && r !== '3rdpartylicenses.txt')
  .sort();

const urls = ['/', ...archivos.map((r) => '/' + r)];
const huella = createHash('sha256');
for (const r of archivos) huella.update(r).update(readFileSync(join(salida, r)));
const version = huella.digest('hex').slice(0, 12);

const rutaSw = join(salida, 'sw.js');
const original = readFileSync(rutaSw, 'utf8');
const sw = original
  .replace(/\/\*VERSION_INICIO\*\/[\s\S]*?\/\*VERSION_FIN\*\//, `/*VERSION_INICIO*/ ${JSON.stringify(version)} /*VERSION_FIN*/`)
  .replace(/\/\*PRECACHE_INICIO\*\/[\s\S]*?\/\*PRECACHE_FIN\*\//, `/*PRECACHE_INICIO*/ ${JSON.stringify(urls, null, 2)} /*PRECACHE_FIN*/`);
if (sw === original) throw new Error('sw.js no tiene los marcadores de versión y precaché');
// El service worker no pasa por el compilador: un error de sintaxis aquí apagaría el modo sin conexión.
try {
  new Script(sw, { filename: 'sw.js' });
} catch (error) {
  throw new Error(`sw.js tiene un error de sintaxis: ${error.message}`);
}
writeFileSync(rutaSw, sw);
console.log(`sw.js: versión ${version}, ${urls.length} URL en el precaché`);
