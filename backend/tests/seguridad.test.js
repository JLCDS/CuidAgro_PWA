import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { app } from './helpers.js';

const dir = mkdtempSync(path.join(os.tmpdir(), 'cuidagro-front-'));
writeFileSync(
  path.join(dir, 'index.html'),
  '<!doctype html><html><body><app-root ngcspnonce="__CSP_NONCE__"></app-root><link rel="modulepreload" nonce="__CSP_NONCE__" href="a.js"><link rel="modulepreload" nonce="__CSP_NONCE__" href="b.js"><link rel="stylesheet" nonce="__CSP_NONCE__" href="s.css"><script type="module" nonce="__CSP_NONCE__"></script></body></html>',
);
writeFileSync(path.join(dir, 'manifest.webmanifest'), '{}');
const conFrontend = createApp({ dirFrontend: dir });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const estilos = (res) => res.headers['content-security-policy'].match(/(?:^|;)style-src ([^;]*)/)[1];

describe('Fase 11 - encabezados de seguridad', () => {
  it('envía Permissions-Policy en todas las respuestas', async () => {
    for (const res of [await request(app).get('/api/health'), await request(app).get('/api/inexistente'), await request(conFrontend).get('/')]) {
      const pp = res.headers['permissions-policy'];
      expect(pp).toContain('camera=(self)');
      expect(pp).toContain('geolocation=(self)');
      expect(pp).toContain('microphone=()');
      expect(pp).toContain('browsing-topics=()');
    }
  });

  it('las respuestas que no son index.html tienen style-src sin unsafe-inline ni nonce', async () => {
    for (const res of [await request(app).get('/api/health'), await request(conFrontend).get('/manifest.webmanifest')]) {
      expect(estilos(res)).toBe("'self'");
      expect(res.headers['content-security-policy']).not.toContain('unsafe-inline');
    }
  });

  it('index.html lleva un nonce nuevo en cada petición, igual en el HTML y en la CSP', async () => {
    const nonces = new Set();
    for (const ruta of ['/', '/index.html', '/vacunos/profundo/ruta', '/']) {
      const res = await request(conFrontend).get(ruta).set('Accept', 'text/html').expect(200);
      const nonce = res.text.match(/<app-root ngcspnonce="([^"]+)"/)[1];
      expect(nonce).not.toBe('__CSP_NONCE__');
      expect(res.text).not.toContain('__CSP_NONCE__');
      expect(res.text.match(/nonce="[^"]+"/g)).toHaveLength(5);
      expect(res.text.match(/nonce="[^"]+"/g).every((a) => a === `nonce="${nonce}"`)).toBe(true);
      expect(res.text.match(/ nonce="([^"]+)"/g).every((a) => a === ` nonce="${nonce}"`)).toBe(true);
      expect(estilos(res)).toBe(`'self' 'nonce-${nonce}'`);
      expect(res.headers['content-security-policy']).not.toContain('unsafe-inline');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['content-type']).toMatch(/text\/html/);
      nonces.add(nonce);
    }
    expect(nonces.size).toBe(4);
  });

  it('las rutas de la API no reciben el HTML ni el nonce', async () => {
    const res = await request(conFrontend).get('/api/inexistente').expect(404);
    expect(estilos(res)).toBe("'self'");
  });
});
