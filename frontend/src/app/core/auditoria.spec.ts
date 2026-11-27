import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot } from '@angular/router';
import { CampoPassword } from '../compartido/campo-password';
import { ETIQUETA_CALIFICACION, formatearPorcentaje, formatearValor, ordenarMetricas, totalMuestras } from './calidad';
import {
  agruparEnvios,
  dispositivoDe,
  enviarMetricas,
  MetricaEnvio,
  rutaPatron,
  valorValido,
} from './metricas';
import { mensajeSincronizacion } from './offline-logica';

@Component({
  imports: [CampoPassword],
  template: `
    <form (submit)="$event.preventDefault()">
      <app-campo-password><input id="p" type="password" autocomplete="new-password" /></app-campo-password>
      <button id="enviar" type="submit">Enviar</button>
    </form>
  `,
})
class Anfitrion {}

describe('campo de contraseña', () => {
  async function crear() {
    const fixture = TestBed.createComponent(Anfitrion);
    fixture.detectChanges();
    await fixture.whenStable(); // el campo se engancha al formulario en una microtarea
    const raiz = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      entrada: raiz.querySelector<HTMLInputElement>('#p')!,
      boton: raiz.querySelector<HTMLButtonElement>('button.ojo')!,
      enviar: raiz.querySelector<HTMLButtonElement>('#enviar')!,
    };
  }

  it('empieza oculto, con nombre accesible y aria-pressed en falso', async () => {
    const { entrada, boton } = await crear();
    expect(entrada.type).toBe('password');
    expect(boton.type).toBe('button');
    expect(boton.getAttribute('aria-label')).toBe('Mostrar contraseña');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
  });

  it('alterna el tipo, actualiza aria-pressed y conserva el valor y el autocomplete', async () => {
    const { fixture, entrada, boton } = await crear();
    entrada.value = 'secreta123';
    boton.click();
    fixture.detectChanges();
    expect(entrada.type).toBe('text');
    expect(entrada.value).toBe('secreta123');
    expect(entrada.getAttribute('autocomplete')).toBe('new-password');
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    expect(boton.getAttribute('aria-label')).toBe('Ocultar contraseña');
    boton.click();
    fixture.detectChanges();
    expect(entrada.type).toBe('password');
    expect(entrada.value).toBe('secreta123');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
  });

  it('vuelve a ocultar la contraseña al enviar el formulario', async () => {
    const { fixture, entrada, boton, enviar } = await crear();
    boton.click();
    fixture.detectChanges();
    expect(entrada.type).toBe('text');
    enviar.click();
    fixture.detectChanges();
    expect(entrada.type).toBe('password');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('aviso de sincronización', () => {
  it('no avisa si no se envió nada', () => {
    expect(mensajeSincronizacion(0, 0)).toBeNull();
    expect(mensajeSincronizacion(0, 3)).toBeNull();
  });

  it('avisa en singular y plural cuando la cola quedó vacía', () => {
    expect(mensajeSincronizacion(1, 0)).toBe('Se envió 1 registro pendiente.');
    expect(mensajeSincronizacion(3, 0)).toBe('Se enviaron 3 registros pendientes.');
  });

  it('avisa cuántos quedan si alguno falló', () => {
    expect(mensajeSincronizacion(2, 1)).toBe('Se enviaron 2; queda 1 pendiente.');
    expect(mensajeSincronizacion(1, 4)).toBe('Se envió 1; quedan 4 pendientes.');
  });
});

describe('envío de métricas', () => {
  const metrica = (n: number): MetricaEnvio => ({
    nombre: 'LCP',
    valor: n,
    ruta: '/vacunos',
    dispositivo: 'MOVIL',
  });

  it('agrupa en envíos de a 10', () => {
    const lista = Array.from({ length: 23 }, (_, i) => i);
    expect(agruparEnvios(lista).map((g) => g.length)).toEqual([10, 10, 3]);
  });

  it('usa sendBeacon con texto plano y el cuerpo { metricas }', async () => {
    const llamadas: { url: string; datos: Blob }[] = [];
    const enviados = enviarMetricas([metrica(1), metrica(2)], true, (url, datos) => {
      llamadas.push({ url, datos });
      return true;
    });
    expect(enviados).toBe(1);
    expect(llamadas[0].url).toBe('/api/metricas');
    expect(llamadas[0].datos.type).toBe('text/plain');
    const cuerpo = JSON.parse(await llamadas[0].datos.text());
    expect(cuerpo.metricas.length).toBe(2);
    expect(cuerpo.metricas[0]).toEqual(metrica(1));
  });

  it('parte en varios envíos si hay más de 10', () => {
    let veces = 0;
    const enviados = enviarMetricas(Array.from({ length: 12 }, (_, i) => metrica(i)), true, () => ++veces > 0);
    expect(enviados).toBe(2);
    expect(veces).toBe(2);
  });

  it('no envía nada sin conexión ni sin métricas', () => {
    let veces = 0;
    const beacon = () => ++veces > 0;
    expect(enviarMetricas([metrica(1)], false, beacon)).toBe(0);
    expect(enviarMetricas([], true, beacon)).toBe(0);
    expect(veces).toBe(0);
  });

  it('clasifica el dispositivo por el ancho', () => {
    expect(dispositivoDe(375)).toBe('MOVIL');
    expect(dispositivoDe(719)).toBe('MOVIL');
    expect(dispositivoDe(720)).toBe('ESCRITORIO');
  });

  it('ajusta valores fuera del rango que acepta el servidor', () => {
    expect(valorValido('LCP', -5)).toBe(0);
    expect(valorValido('LCP', 700000)).toBe(600000);
    expect(valorValido('CLS', 250)).toBe(100);
    expect(valorValido('CLS', 0.12)).toBe(0.12);
  });
});

describe('ruta de las métricas', () => {
  const nodo = (path: string | undefined, hijo: ActivatedRouteSnapshot | null = null) =>
    ({ routeConfig: path === undefined ? null : { path }, firstChild: hijo }) as unknown as ActivatedRouteSnapshot;

  it('une los tramos del patrón de la ruta activa', () => {
    expect(rutaPatron(nodo(undefined, nodo('', nodo('vacunos'))))).toBe('/vacunos');
  });

  it('la raíz queda como /', () => {
    expect(rutaPatron(nodo(undefined, nodo('', nodo(''))))).toBe('/');
  });

  it('no deja ids ni comodines', () => {
    expect(rutaPatron(nodo(undefined, nodo('lotes', nodo(':id'))))).toBe('/lotes/id');
    expect(rutaPatron(nodo(undefined, nodo('**')))).toBe('/no-encontrada');
  });
});

describe('formato de la pantalla Calidad', () => {
  it('muestra milisegundos, segundos y CLS sin unidad', () => {
    expect(formatearValor('TTFB', 820)).toBe('820 ms');
    expect(formatearValor('LCP', 1820.5)).toContain('s');
    expect(formatearValor('LCP', 1820.5)).not.toContain('ms');
    expect(formatearValor('CLS', 0.1)).not.toContain('ms');
  });

  it('redondea porcentajes y ordena las métricas', () => {
    expect(formatearPorcentaje(0.914)).toBe('91 %');
    expect(ordenarMetricas([{ nombre: 'TTFB' }, { nombre: 'LCP' }, { nombre: 'CLS' }]).map((m) => m.nombre)).toEqual([
      'LCP',
      'CLS',
      'TTFB',
    ]);
  });

  it('cuenta las muestras y tiene texto para cada calificación', () => {
    expect(totalMuestras(null)).toBe(0);
    expect(ETIQUETA_CALIFICACION.MALA).toBe('Mala');
    const g = { p75: 0, buenas: 1, mejorables: 0, malas: 0, calificacionP75: 'BUENA' as const };
    expect(
      totalMuestras({
        dias: 7,
        dispositivo: null,
        porRuta: [],
        general: [
          { nombre: 'LCP', muestras: 3, ...g },
          { nombre: 'INP', muestras: 4, ...g },
        ],
      }),
    ).toBe(7);
  });
});
