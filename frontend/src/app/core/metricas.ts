import { inject, Injectable, isDevMode } from '@angular/core';
import { ActivatedRouteSnapshot, Router } from '@angular/router';

export type NombreMetrica = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
export type Dispositivo = 'MOVIL' | 'ESCRITORIO';

export interface MetricaEnvio {
  nombre: NombreMetrica;
  valor: number;
  ruta: string;
  dispositivo: Dispositivo;
  conexion?: string;
  version?: string;
}

/** El servidor acepta hasta 10 métricas por envío. */
export const MAX_POR_ENVIO = 10;
const ANCHO_MOVIL = 720;
const URL_ENVIO = '/api/metricas';
const NOMBRES: string[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

export function dispositivoDe(ancho: number): Dispositivo {
  return ancho < ANCHO_MOVIL ? 'MOVIL' : 'ESCRITORIO';
}

/** Patrón de la ruta activa (por ejemplo `/vacunos`), nunca la URL con ids. */
export function rutaPatron(raiz: ActivatedRouteSnapshot): string {
  const partes: string[] = [];
  let actual: ActivatedRouteSnapshot | null = raiz;
  while (actual) {
    const camino = actual.routeConfig?.path;
    if (camino) partes.push(camino);
    actual = actual.firstChild;
  }
  const texto = partes.join('/');
  if (texto.includes('**')) return '/no-encontrada';
  // Los parámetros (:id) se reemplazan: el servidor solo acepta minúsculas, números, "/" y "-".
  const limpio = texto
    .split('/')
    .map((p) => (p.startsWith(':') ? 'id' : p))
    .join('/')
    .toLowerCase()
    .replace(/[^a-z0-9/-]/g, '');
  return ('/' + limpio).slice(0, 80);
}

/** Valores que el servidor rechazaría (negativos o por encima del máximo) se ajustan al límite. */
export function valorValido(nombre: NombreMetrica, valor: number): number {
  const maximo = nombre === 'CLS' ? 100 : 600000;
  return Math.min(Math.max(valor, 0), maximo);
}

/** Parte la lista en envíos de hasta 10 métricas. */
export function agruparEnvios<T>(metricas: T[], tamano = MAX_POR_ENVIO): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < metricas.length; i += tamano) grupos.push(metricas.slice(i, i + tamano));
  return grupos;
}

/**
 * Envía con `sendBeacon` (sobrevive al cierre de la página). Sin conexión descarta todo.
 * Devuelve cuántos envíos se pidieron al navegador.
 */
export function enviarMetricas(
  metricas: MetricaEnvio[],
  enLinea: boolean,
  beacon: (url: string, datos: Blob) => boolean,
): number {
  if (!enLinea || metricas.length === 0) return 0;
  let enviados = 0;
  for (const grupo of agruparEnvios(metricas)) {
    // text/plain: es lo que el servidor espera de sendBeacon, que no permite encabezados propios.
    const cuerpo = new Blob([JSON.stringify({ metricas: grupo })], { type: 'text/plain' });
    if (beacon(URL_ENVIO, cuerpo)) enviados++;
  }
  return enviados;
}

interface MetricaWeb {
  name: string;
  value: number;
  id: string;
}

/** Mide Core Web Vitals en los dispositivos reales (solo en el build de producción). */
@Injectable({ providedIn: 'root' })
export class Metricas {
  private readonly router = inject(Router);
  private pendientes = new Map<string, MetricaEnvio>();
  private version: string | undefined;
  private iniciada = false;

  iniciar(): void {
    if (this.iniciada || isDevMode() || typeof window === 'undefined') return;
    this.iniciada = true;
    void this.registrar();
  }

  private async registrar(): Promise<void> {
    let vitals: typeof import('web-vitals');
    try {
      vitals = await import('web-vitals');
    } catch {
      return; // sin la biblioteca no se mide; la app sigue igual
    }
    const alMedir = (m: MetricaWeb) => this.agregar(m);
    vitals.onLCP(alMedir);
    vitals.onINP(alMedir);
    vitals.onCLS(alMedir);
    vitals.onFCP(alMedir);
    vitals.onTTFB(alMedir);
    void this.pedirVersion();
    // Se registra después de web-vitals, que también reporta al ocultarse la página.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.vaciar();
    });
    window.addEventListener('pagehide', () => this.vaciar());
  }

  private agregar(m: MetricaWeb): void {
    if (!NOMBRES.includes(m.name)) return;
    const nombre = m.name as NombreMetrica;
    const conexion = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
    this.pendientes.set(m.id, {
      nombre,
      valor: Math.round(valorValido(nombre, m.value) * 10000) / 10000,
      ruta: rutaPatron(this.router.routerState.snapshot.root),
      dispositivo: dispositivoDe(window.innerWidth),
      ...(conexion ? { conexion: conexion.slice(0, 10) } : {}),
      ...(this.version ? { version: this.version } : {}),
    });
  }

  private vaciar(): void {
    const lista = [...this.pendientes.values()];
    this.pendientes = new Map();
    enviarMetricas(lista, navigator.onLine, (url, datos) => navigator.sendBeacon(url, datos));
  }

  /** Versión del service worker activo (opcional: si no responde en medio segundo, se omite). */
  private async pedirVersion(): Promise<void> {
    const controlador = navigator.serviceWorker?.controller;
    if (!controlador) return;
    this.version = await new Promise<string | undefined>((resolver) => {
      const canal = new MessageChannel();
      const espera = setTimeout(() => resolver(undefined), 500);
      canal.port1.onmessage = (e) => {
        clearTimeout(espera);
        resolver(typeof e.data === 'string' ? e.data.slice(0, 20) : undefined);
      };
      controlador.postMessage({ tipo: 'VERSION' }, [canal.port2]);
    });
  }
}
