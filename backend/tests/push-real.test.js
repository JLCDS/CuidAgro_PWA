import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { generateVAPIDKeys } from 'web-push';
import { env } from '../src/config/env.js';
import { configurarEnviador, esperarEnvios, revisarVencimientos } from '../src/lib/push.js';
import { prisma } from '../src/lib/prisma.js';
import { crearFinca, sesionDe } from './helpers.js';

// Estas pruebas NO sustituyen el enviador: comprueban que el módulo real de web-push se carga y se usa.
// (Vitest tolera imports por defecto que Node real rechaza, por eso también se carga con `node` de verdad.)

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

describe('módulo de push real', () => {
  afterAll(() => {
    delete env.VAPID_PUBLIC_KEY;
    delete env.VAPID_PRIVATE_KEY;
    configurarEnviador(null);
  });

  it('carga en Node puro (sin Vitest), con y sin claves VAPID', () => {
    const claves = generateVAPIDKeys();
    for (const extra of [{}, { VAPID_PUBLIC_KEY: claves.publicKey, VAPID_PRIVATE_KEY: claves.privateKey }]) {
      const salida = execFileSync(
        process.execPath,
        ['--input-type=module', '-e', "const m = await import('./src/lib/push.js'); console.log(typeof m.revisarVencimientos, typeof m.pushHabilitado());"],
        { cwd: RAIZ, env: { ...process.env, ...extra }, encoding: 'utf8' },
      );
      expect(salida.trim()).toBe('function boolean');
    }
  });

  it('el enviador real configura VAPID y un fallo de red o de cifrado no rompe nada ni borra la suscripción', async () => {
    const claves = generateVAPIDKeys();
    env.VAPID_PUBLIC_KEY = claves.publicKey;
    env.VAPID_PRIVATE_KEY = claves.privateKey;
    configurarEnviador(null); // enviador real de web-push

    const finca = await crearFinca();
    const vet = await sesionDe('VETERINARIO', [finca.id]);
    await prisma.suscripcionPush.create({
      data: { usuarioId: vet.usuario.id, endpoint: 'https://127.0.0.1:9/inalcanzable', p256dh: 'no-es-una-clave', auth: 'x' },
    });
    await prisma.medicamento.create({
      data: {
        fincaId: finca.id, nombre: 'X', tipo: 'VITAMINA', unidad: 'ML', stock: 5, stockMinimo: 1,
        fechaVencimiento: new Date('2020-01-01T00:00:00Z'), creadoPorId: vet.usuario.id,
      },
    });
    await expect(revisarVencimientos()).resolves.toBeUndefined();
    await esperarEnvios();
    expect(await prisma.suscripcionPush.count()).toBe(1);
  });
});
