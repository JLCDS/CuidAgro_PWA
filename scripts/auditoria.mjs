// Auditoría de laboratorio con Lighthouse (Sesión 23): páginas x perfiles, con umbrales.
//
// Uso:
//   npm run auditoria -- --url http://localhost:3190 --correo <correo> --password <clave>
//   (o AUDITORIA_URL, AUDITORIA_CORREO y AUDITORIA_PASSWORD en el entorno)
// Opciones: --carpeta <ruta> (salida; por defecto docs/auditoria/AAAA-MM-DD), --paginas /login,/consumos
//           --perfiles movil,escritorio, --repeticiones <n> (por defecto 1; con n > 1 se conserva la medición mediana en rendimiento,
//           porque el rendimiento varía unos puntos entre corridas)
// Chromium: CHROME_PATH o el de Playwright (%LOCALAPPDATA%\ms-playwright\chromium-*\chrome-win64\chrome.exe).
// Código de salida distinto de 0 si alguna página incumple los umbrales o falla la medición.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from 'chrome-launcher';
import lighthouse, { desktopConfig } from 'lighthouse';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PAGINAS = [
  { ruta: '/login', sesion: false },
  { ruta: '/', sesion: true },
  { ruta: '/consumos', sesion: true },
  { ruta: '/reportes', sesion: true },
  { ruta: '/espacios', sesion: true },
];

const PERFILES = [
  { id: 'movil', nombre: 'Móvil', config: undefined, rendimientoMin: 85 },
  { id: 'escritorio', nombre: 'Escritorio', config: desktopConfig, rendimientoMin: 90 },
];

const UMBRALES = { accessibility: 95, 'best-practices': 95, seo: 90 };
const CATEGORIAS = [
  ['performance', 'Rendimiento'],
  ['accessibility', 'Accesibilidad'],
  ['best-practices', 'Buenas prácticas'],
  ['seo', 'SEO'],
];
const METRICAS = [
  ['largest-contentful-paint', 'LCP'],
  ['cumulative-layout-shift', 'CLS'],
  ['total-blocking-time', 'TBT'],
  ['first-contentful-paint', 'FCP'],
  ['speed-index', 'Speed Index'],
];

function leerArgumentos(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
  return args;
}

function buscarChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  if (!existsSync(base)) return undefined;
  const carpetas = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const carpeta of carpetas) {
    const exe = path.join(base, carpeta, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

function fechaLocal() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Inicia sesión por la API y devuelve la cookie de renovación (cada medición usa una propia: el token rota). */
async function cookieDeSesion(base, correo, password) {
  const res = await fetch(new URL('/api/auth/login', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo, password }),
  });
  if (!res.ok) throw new Error(`Login falló (${res.status}). Revisa --correo y --password.`);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('cuidagro_rt='));
  if (!cookie) throw new Error('El login no devolvió la cookie de sesión.');
  return cookie.split(';')[0];
}

const puntaje = (cat) => Math.round((cat?.score ?? 0) * 100);

function evaluar(puntajes, perfil) {
  const fallos = [];
  if (puntajes.performance < perfil.rendimientoMin) fallos.push(`Rendimiento ${puntajes.performance} < ${perfil.rendimientoMin}`);
  for (const [id, minimo] of Object.entries(UMBRALES)) {
    if (puntajes[id] < minimo) fallos.push(`${CATEGORIAS.find(([c]) => c === id)[1]} ${puntajes[id]} < ${minimo}`);
  }
  return fallos;
}

async function medirUna({ base, pagina, perfil, correo, password, chromePath }) {
  const extraHeaders = pagina.sesion ? { Cookie: await cookieDeSesion(base, correo, password) } : undefined;
  const chrome = await launch({
    chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const url = new URL(pagina.ruta, base).href;
    const resultado = await lighthouse(
      url,
      {
        port: chrome.port,
        output: 'html',
        logLevel: 'error',
        onlyCategories: CATEGORIAS.map(([id]) => id),
        locale: 'es',
        extraHeaders,
      },
      perfil.config,
    );
    const { lhr, report } = resultado;
    const nombre = `${pagina.ruta === '/' ? 'inicio' : pagina.ruta.slice(1)}-${perfil.id}.html`;

    const puntajes = Object.fromEntries(CATEGORIAS.map(([id]) => [id, puntaje(lhr.categories[id])]));
    const metricas = Object.fromEntries(METRICAS.map(([id, etiqueta]) => [etiqueta, lhr.audits[id]?.displayValue ?? '-']));
    const pendientes = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable')
      .map((a) => `${a.id} (${Math.round(a.score * 100)})`);
    return { report, pagina, perfil, nombre, puntajes, metricas, pendientes, fallos: evaluar(puntajes, perfil), url, error: lhr.runtimeError?.message };
  } finally {
    try {
      await chrome.kill();
    } catch {
      // En Windows el perfil temporal a veces sigue en uso al cerrar; no afecta al resultado.
    }
  }
}

/** Repite la medición y devuelve la mediana por rendimiento; una corrida sin resultado (error de Chrome) se descarta. */
async function medir(opciones, repeticiones) {
  const corridas = [];
  for (let i = 0; i < repeticiones; i++) {
    const r = await medirUna(opciones);
    if (!r.error) corridas.push(r);
    else if (repeticiones === 1) return r;
  }
  if (corridas.length === 0) throw new Error('Lighthouse no produjo resultados.');
  corridas.sort((a, b) => a.puntajes.performance - b.puntajes.performance);
  const elegida = corridas[Math.floor((corridas.length - 1) / 2)];
  elegida.corridas = corridas.map((c) => c.puntajes.performance);
  writeFileSync(path.join(opciones.carpeta, elegida.nombre), elegida.report);
  return elegida;
}

function resumenMarkdown({ base, fecha, resultados }) {
  const marca = (valor, minimo) => (valor >= minimo ? String(valor) : `**${valor}**`);
  const lineas = [
    `# Auditoría Lighthouse del ${fecha}`,
    '',
    `Sitio medido: ${base}. Perfiles: móvil (emulación por defecto de Lighthouse) y escritorio.`,
    'Umbrales: accesibilidad >= 95, buenas prácticas >= 95, SEO >= 90, rendimiento >= 85 en móvil y >= 90 en escritorio. En negrita, lo que no cumple.',
    '',
    '## Puntajes',
    '',
    '| Página | Perfil | Rendimiento | Accesibilidad | Buenas prácticas | SEO | Resultado |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of resultados) {
    const p = r.puntajes;
    lineas.push(
      `| \`${r.pagina.ruta}\` | ${r.perfil.nombre} | ${marca(p.performance, r.perfil.rendimientoMin)} | ${marca(p.accessibility, 95)} | ${marca(p['best-practices'], 95)} | ${marca(p.seo, 90)} | ${r.error ? 'Error' : r.fallos.length ? 'No cumple' : 'Cumple'} |`,
    );
  }
  lineas.push('', '## Métricas de laboratorio', '', `| Página | Perfil | ${METRICAS.map(([, e]) => e).join(' | ')} | Informe |`, `|---|---|${METRICAS.map(() => '---').join('|')}|---|`);
  for (const r of resultados) {
    lineas.push(`| \`${r.pagina.ruta}\` | ${r.perfil.nombre} | ${METRICAS.map(([, e]) => r.metricas[e]).join(' | ')} | [${r.nombre}](${r.nombre}) |`);
  }
  lineas.push('', '## Auditorías por debajo de 90', '');
  for (const r of resultados) lineas.push(`- \`${r.pagina.ruta}\` (${r.perfil.nombre}): ${r.pendientes.length ? r.pendientes.join(', ') : 'ninguna'}`);
  const incumplen = resultados.filter((r) => r.fallos.length || r.error);
  lineas.push('', '## Conclusión', '');
  if (incumplen.length === 0) lineas.push('Todas las páginas cumplen los umbrales.');
  else for (const r of incumplen) lineas.push(`- \`${r.pagina.ruta}\` (${r.perfil.nombre}): ${r.error ?? r.fallos.join('; ')}`);
  return `${lineas.join('\n')}\n`;
}

async function main() {
  const args = leerArgumentos(process.argv.slice(2));
  const base = args.url ?? process.env.AUDITORIA_URL;
  const correo = args.correo ?? process.env.AUDITORIA_CORREO;
  const password = args.password ?? process.env.AUDITORIA_PASSWORD;
  if (!base) throw new Error('Falta --url (o AUDITORIA_URL), por ejemplo http://localhost:3190');

  const filtroPaginas = args.paginas?.split(',');
  const filtroPerfiles = args.perfiles?.split(',');
  const paginas = PAGINAS.filter((p) => !filtroPaginas || filtroPaginas.includes(p.ruta));
  const perfiles = PERFILES.filter((p) => !filtroPerfiles || filtroPerfiles.includes(p.id));
  if (paginas.length === 0 || perfiles.length === 0) throw new Error('Ninguna página o perfil coincide con --paginas / --perfiles.');
  if (paginas.some((p) => p.sesion) && (!correo || !password)) {
    throw new Error('Las páginas con sesión necesitan --correo y --password (o AUDITORIA_CORREO y AUDITORIA_PASSWORD).');
  }

  const repeticiones = Math.max(1, Number.parseInt(args.repeticiones ?? '1', 10) || 1);
  const chromePath = buscarChromium();
  if (!chromePath) throw new Error('No se encontró Chromium: define CHROME_PATH con la ruta de chrome.exe.');

  const fecha = fechaLocal();
  const carpeta = path.resolve(RAIZ, args.carpeta ?? path.join('docs', 'auditoria', fecha));
  mkdirSync(carpeta, { recursive: true });

  const resultados = [];
  for (const pagina of paginas) {
    for (const perfil of perfiles) {
      process.stdout.write(`Midiendo ${pagina.ruta} (${perfil.nombre})... `);
      try {
        const r = await medir({ base, pagina, perfil, correo, password, chromePath, carpeta }, repeticiones);
        resultados.push(r);
        const p = r.puntajes;
        console.log(`R ${p.performance}${r.corridas ? ` (corridas ${r.corridas.join('/')})` : ''} A ${p.accessibility} BP ${p['best-practices']} SEO ${p.seo}${r.fallos.length ? ` -> ${r.fallos.join('; ')}` : ''}`);
      } catch (error) {
        console.log(`error: ${error.message}`);
        resultados.push({ pagina, perfil, nombre: '-', puntajes: { performance: 0, accessibility: 0, 'best-practices': 0, seo: 0 }, metricas: {}, pendientes: [], fallos: [], error: error.message });
      }
    }
  }

  writeFileSync(path.join(carpeta, 'resumen.md'), resumenMarkdown({ base, fecha, resultados }));
  console.log(`\nInformes en ${path.relative(RAIZ, carpeta)}`);
  const incumplen = resultados.filter((r) => r.fallos.length || r.error);
  if (incumplen.length) {
    console.error(`${incumplen.length} medición(es) no cumplen los umbrales.`);
    process.exitCode = 1;
  } else {
    console.log('Todas las páginas cumplen los umbrales.');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
