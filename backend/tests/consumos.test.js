import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, crearFinca, sesionDe, UUID_INEXISTENTE } from './helpers.js';

const bogota = (desplazamientoDias = 0) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + desplazamientoDias);
  return d.toISOString().slice(0, 10);
};
const HOY = () => bogota();
const AYER = () => bogota(-1);
const FUTURA = () => bogota(2);

const TIPOS = [
  {
    nombre: 'vacunos',
    ruta: '/api/consumos/vacunos',
    campo: 'vacunoId',
    objeto: 'vacuno',
    maximo: 200000,
    async crearAnimal(bearer, fincaId, nombre = 'Lucero') {
      const res = await request(app).post('/api/vacunos').set(bearer).send({
        fincaId, nombre, sexo: 'HEMBRA', raza: 'Holstein', edadMeses: 24, peso: 400, fechaLlegada: '2026-01-01', proposito: 'ENGORDE',
      });
      expect(res.status).toBe(201);
      return res.body;
    },
    rutaAnimal: '/api/vacunos',
  },
  {
    nombre: 'lotes',
    ruta: '/api/consumos/lotes',
    campo: 'loteId',
    objeto: 'lote',
    maximo: 10000000,
    async crearAnimal(bearer, fincaId, nombre = 'Lote Uno') {
      const res = await request(app).post('/api/lotes').set(bearer).send({
        fincaId, nombre, edadMinSemanas: 1, edadMaxSemanas: 10, cantidad: 100, proposito: 'PRODUCCION',
      });
      expect(res.status).toBe(201);
      return res.body;
    },
    rutaAnimal: '/api/lotes',
  },
];

async function crearAlimento(bearer, fincaId, extra = {}) {
  const res = await request(app).post('/api/alimentos').set(bearer).send({
    fincaId, nombre: 'Concentrado', tipo: 'CONCENTRADO', stockInicialGramos: 100000, ...extra,
  });
  expect(res.status).toBe(201);
  return res.body;
}
const stockDe = async (bearer, id) => (await request(app).get(`/api/alimentos/${id}`).set(bearer).expect(200)).body.stockGramos;

describe.each(TIPOS)('consumos de $nombre', (T) => {
  const cuerpo = (animal, alimento, extra = {}) => ({
    [T.campo]: animal.id, alimentoId: alimento.id, cantidadGramos: 1000, jornada: 'MANANA', fecha: HOY(), ...extra,
  });
  const crear = (bearer, animal, alimento, extra) => request(app).post(T.ruta).set(bearer).send(cuerpo(animal, alimento, extra));

  /** Finca con veterinario, ayudante, un animal y un alimento con 100 000 g. */
  async function base() {
    const finca = await crearFinca('Finca A');
    const vet = await sesionDe('VETERINARIO', [finca.id]);
    const ayu = await sesionDe('AYUDANTE', [finca.id]);
    const animal = await T.crearAnimal(vet.bearer, finca.id);
    const alimento = await crearAlimento(vet.bearer, finca.id);
    return { finca, vet, ayu, animal, alimento };
  }

  describe('crear', () => {
    it('crea, descuenta stock y responde con el estado posterior del alimento', async () => {
      const { finca, vet, animal, alimento } = await base();
      const res = await crear(vet.bearer, animal, alimento, { cantidadGramos: 2500, observaciones: 'Todo' }).expect(201);
      expect(res.body).toMatchObject({
        cantidadGramos: 2500,
        jornada: 'MANANA',
        fecha: HOY(),
        observaciones: 'Todo',
        [T.objeto]: { id: animal.id, nombre: animal.nombre },
        alimento: { id: alimento.id, nombre: 'Concentrado', stockGramos: 97500, bajoStock: false },
        finca: { id: finca.id, nombre: 'Finca A' },
        registradoPor: { id: vet.usuario.id },
      });
      expect(res.body.id).toBeTruthy();
      expect(await stockDe(vet.bearer, alimento.id)).toBe(97500);
      const get = await request(app).get(`${T.ruta}/${res.body.id}`).set(vet.bearer).expect(200);
      expect(get.body).toMatchObject({ id: res.body.id, cantidadGramos: 2500, fecha: HOY() });
    });

    it('el administrador y el ayudante pueden crear', async () => {
      const { finca, vet, ayu, animal, alimento } = await base();
      const admin = await sesionDe('ADMINISTRADOR');
      await crear(admin.bearer, animal, alimento, { jornada: 'TARDE' }).expect(201);
      const res = await crear(ayu.bearer, animal, alimento, { jornada: 'NOCHE' }).expect(201);
      expect(res.body.registradoPor.id).toBe(ayu.usuario.id);
      expect(res.body.finca.id).toBe(finca.id);
      expect(await stockDe(vet.bearer, alimento.id)).toBe(98000);
    });

    it('acepta el consumo de hoy y de fechas pasadas, y valores límite', async () => {
      const { vet, animal, alimento } = await base();
      await crear(vet.bearer, animal, alimento, { cantidadGramos: 1, fecha: '2026-01-02' }).expect(201);
      await crear(vet.bearer, animal, alimento, { cantidadGramos: T.maximo, jornada: 'NOCHE' }).expect(201);
    });

    it('el stock puede quedar negativo y bajoStock es true', async () => {
      const { vet, animal, alimento } = await base();
      const res = await crear(vet.bearer, animal, alimento, { cantidadGramos: 150000 > T.maximo ? T.maximo : 150000 });
      expect(res.status).toBe(201);
      const esperado = 100000 - res.body.cantidadGramos;
      expect(res.body.alimento).toMatchObject({ stockGramos: esperado, bajoStock: true });
      const f2 = await crear(vet.bearer, animal, alimento, { jornada: 'TARDE', cantidadGramos: 1000 }).expect(201);
      expect(f2.body.alimento.stockGramos).toBe(esperado - 1000);
      expect(f2.body.alimento.bajoStock).toBe(true);
      expect(await stockDe(vet.bearer, alimento.id)).toBe(esperado - 1000);
    });

    it('bajoStock es true al llegar justo al mínimo', async () => {
      const finca = await crearFinca('A');
      const vet = await sesionDe('VETERINARIO', [finca.id]);
      const animal = await T.crearAnimal(vet.bearer, finca.id);
      const alimento = await crearAlimento(vet.bearer, finca.id, { stockInicialGramos: 5000, stockMinimoGramos: 3000 });
      const r1 = await crear(vet.bearer, animal, alimento, { cantidadGramos: 1999 }).expect(201);
      expect(r1.body.alimento).toMatchObject({ stockGramos: 3001, bajoStock: false });
      const r2 = await crear(vet.bearer, animal, alimento, { cantidadGramos: 1, jornada: 'TARDE' }).expect(201);
      expect(r2.body.alimento).toMatchObject({ stockGramos: 3000, bajoStock: true });
    });
  });

  describe('validaciones', () => {
    const casos = [
      ['sin cantidad', { cantidadGramos: undefined }],
      ['cantidad cero', { cantidadGramos: 0 }],
      ['cantidad negativa', { cantidadGramos: -1 }],
      ['cantidad decimal', { cantidadGramos: 10.5 }],
      ['cantidad no numérica', { cantidadGramos: 'abc' }],
      ['cantidad sobre el máximo', { cantidadGramos: T.maximo + 1 }],
      ['sin jornada', { jornada: undefined }],
      ['jornada inválida', { jornada: 'MEDIODIA' }],
      ['sin fecha', { fecha: undefined }],
      ['fecha futura', { fecha: FUTURA() }],
      ['fecha malformada', { fecha: '15/01/2026' }],
      ['observaciones muy largas', { observaciones: 'x'.repeat(501) }],
      ['sin alimentoId', { alimentoId: undefined }],
      [`sin ${T.campo}`, { [T.campo]: undefined }],
    ];
    it.each(casos)('400 VALIDACION: %s', async (_t, extra) => {
      const { vet, animal, alimento } = await base();
      const res = await crear(vet.bearer, animal, alimento, extra).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
      expect(await stockDe(vet.bearer, alimento.id)).toBe(100000);
    });

    it('animal inactivo → 400 y no descuenta', async () => {
      const { vet, animal, alimento } = await base();
      await request(app).patch(`${T.rutaAnimal}/${animal.id}/estado`).set(vet.bearer).send({ estado: 'INACTIVO', motivoBaja: 'x' }).expect(200);
      const res = await crear(vet.bearer, animal, alimento).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
      expect(await stockDe(vet.bearer, alimento.id)).toBe(100000);
    });

    it('alimento inactivo → 400 y no descuenta', async () => {
      const { vet, animal, alimento } = await base();
      await request(app).patch(`/api/alimentos/${alimento.id}/estado`).set(vet.bearer).send({ estado: 'INACTIVO', motivoBaja: 'x' }).expect(200);
      const res = await crear(vet.bearer, animal, alimento).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
      expect(await stockDe(vet.bearer, alimento.id)).toBe(100000);
    });

    it('animal y alimento de fincas distintas → 400', async () => {
      const b = await crearFinca('B');
      const { finca, vet, animal } = await base();
      const admin = await sesionDe('ADMINISTRADOR');
      const alimentoB = await crearAlimento(admin.bearer, b.id, { nombre: 'De B' });
      const res = await crear(admin.bearer, animal, alimentoB).expect(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
      expect(finca.id).not.toBe(b.id);
      expect(await stockDe(vet.bearer, (await crearAlimento(vet.bearer, finca.id, { nombre: 'Otro' })).id)).toBe(100000);
      expect(await stockDe(admin.bearer, alimentoB.id)).toBe(100000);
    });

    it('animal o alimento inexistente → 404', async () => {
      const { vet, animal, alimento } = await base();
      await crear(vet.bearer, { id: UUID_INEXISTENTE }, alimento).expect(404);
      await crear(vet.bearer, animal, { id: UUID_INEXISTENTE }).expect(404);
    });
  });

  describe('duplicados', () => {
    it('409 DUPLICADO con el mismo animal, alimento, fecha y jornada', async () => {
      const { vet, animal, alimento } = await base();
      await crear(vet.bearer, animal, alimento).expect(201);
      const res = await crear(vet.bearer, animal, alimento, { cantidadGramos: 500 }).expect(409);
      expect(res.body.error.codigo).toBe('DUPLICADO');
      expect(await stockDe(vet.bearer, alimento.id)).toBe(99000);
    });

    it('con otra jornada, otra fecha u otro alimento se permite', async () => {
      const { finca, vet, animal, alimento } = await base();
      await crear(vet.bearer, animal, alimento).expect(201);
      await crear(vet.bearer, animal, alimento, { jornada: 'TARDE' }).expect(201);
      await crear(vet.bearer, animal, alimento, { fecha: AYER() }).expect(201);
      const otro = await crearAlimento(vet.bearer, finca.id, { nombre: 'Heno' });
      await crear(vet.bearer, animal, otro).expect(201);
    });

    it('el PATCH que choca con otro consumo da 409 y no altera el stock', async () => {
      const { vet, animal, alimento } = await base();
      await crear(vet.bearer, animal, alimento, { jornada: 'MANANA' }).expect(201);
      const c2 = (await crear(vet.bearer, animal, alimento, { jornada: 'TARDE' }).expect(201)).body;
      const res = await request(app).patch(`${T.ruta}/${c2.id}`).set(vet.bearer).send({ jornada: 'MANANA' }).expect(409);
      expect(res.body.error.codigo).toBe('DUPLICADO');
      expect(await stockDe(vet.bearer, alimento.id)).toBe(98000);
    });
  });

  describe('editar y borrar (stock)', () => {
    it('PATCH de cantidad ajusta la diferencia', async () => {
      const { vet, animal, alimento } = await base();
      const c = (await crear(vet.bearer, animal, alimento, { cantidadGramos: 1000 }).expect(201)).body;
      const sube = await request(app).patch(`${T.ruta}/${c.id}`).set(vet.bearer).send({ cantidadGramos: 4000 }).expect(200);
      expect(sube.body).toMatchObject({ cantidadGramos: 4000, alimento: { stockGramos: 96000 } });
      expect(await stockDe(vet.bearer, alimento.id)).toBe(96000);
      const baja = await request(app).patch(`${T.ruta}/${c.id}`).set(vet.bearer).send({ cantidadGramos: 500 }).expect(200);
      expect(baja.body.alimento.stockGramos).toBe(99500);
      expect(await stockDe(vet.bearer, alimento.id)).toBe(99500);
    });

    it('PATCH parcial sin cantidad no toca el stock y no cambia el animal', async () => {
      const { vet, animal, alimento } = await base();
      const c = (await crear(vet.bearer, animal, alimento).expect(201)).body;
      const res = await request(app).patch(`${T.ruta}/${c.id}`).set(vet.bearer).send({ jornada: 'NOCHE', observaciones: 'Cambio' }).expect(200);
      expect(res.body).toMatchObject({ jornada: 'NOCHE', observaciones: 'Cambio', cantidadGramos: 1000, [T.objeto]: { id: animal.id } });
      expect(await stockDe(vet.bearer, alimento.id)).toBe(99000);
    });

    it('PATCH que cambia de alimento devuelve al anterior y descuenta del nuevo', async () => {
      const { finca, vet, animal, alimento } = await base();
      const otro = await crearAlimento(vet.bearer, finca.id, { nombre: 'Heno', stockInicialGramos: 3000 });
      const c = (await crear(vet.bearer, animal, alimento, { cantidadGramos: 1000 }).expect(201)).body;
      const res = await request(app).patch(`${T.ruta}/${c.id}`).set(vet.bearer).send({ alimentoId: otro.id }).expect(200);
      expect(res.body.alimento).toMatchObject({ id: otro.id, stockGramos: 2000 });
      expect(await stockDe(vet.bearer, alimento.id)).toBe(100000);
      expect(await stockDe(vet.bearer, otro.id)).toBe(2000);
      const res2 = await request(app).patch(`${T.ruta}/${c.id}`).set(vet.bearer).send({ alimentoId: alimento.id, cantidadGramos: 1500 }).expect(200);
      expect(res2.body.alimento.stockGramos).toBe(98500);
      expect(await stockDe(vet.bearer, otro.id)).toBe(3000);
    });

    it('PATCH a un alimento de otra finca o inactivo da 400 sin alterar stock', async () => {
      const b = await crearFinca('B');
      const { finca, vet, animal, alimento } = await base();
      const admin = await sesionDe('ADMINISTRADOR');
      const deB = await crearAlimento(admin.bearer, b.id, { nombre: 'De B' });
      const inactivo = await crearAlimento(vet.bearer, finca.id, { nombre: 'Viejo' });
      await request(app).patch(`/api/alimentos/${inactivo.id}/estado`).set(vet.bearer).send({ estado: 'INACTIVO', motivoBaja: 'x' }).expect(200);
      const c = (await crear(vet.bearer, animal, alimento).expect(201)).body;
      await request(app).patch(`${T.ruta}/${c.id}`).set(admin.bearer).send({ alimentoId: deB.id }).expect(400);
      await request(app).patch(`${T.ruta}/${c.id}`).set(vet.bearer).send({ alimentoId: inactivo.id }).expect(400);
      expect(await stockDe(vet.bearer, alimento.id)).toBe(99000);
      expect(await stockDe(admin.bearer, deB.id)).toBe(100000);
      expect(await stockDe(vet.bearer, inactivo.id)).toBe(100000);
    });

    it('el PATCH valida', async () => {
      const { vet, animal, alimento } = await base();
      const c = (await crear(vet.bearer, animal, alimento).expect(201)).body;
      const malos = [{ cantidadGramos: 0 }, { cantidadGramos: T.maximo + 1 }, { jornada: 'X' }, { fecha: FUTURA() }, { observaciones: 'x'.repeat(501) }];
      for (const m of malos) {
        const res = await request(app).patch(`${T.ruta}/${c.id}`).set(vet.bearer).send(m).expect(400);
        expect(res.body.error.codigo).toBe('VALIDACION');
      }
      expect(await stockDe(vet.bearer, alimento.id)).toBe(99000);
    });

    it('DELETE devuelve el stock (204) y el consumo deja de existir', async () => {
      const { vet, animal, alimento } = await base();
      const c = (await crear(vet.bearer, animal, alimento, { cantidadGramos: 7000 }).expect(201)).body;
      expect(await stockDe(vet.bearer, alimento.id)).toBe(93000);
      await request(app).delete(`${T.ruta}/${c.id}`).set(vet.bearer).expect(204);
      expect(await stockDe(vet.bearer, alimento.id)).toBe(100000);
      await request(app).get(`${T.ruta}/${c.id}`).set(vet.bearer).expect(404);
      await request(app).delete(`${T.ruta}/${c.id}`).set(vet.bearer).expect(404);
      // La clave única queda libre.
      await crear(vet.bearer, animal, alimento, { cantidadGramos: 7000 }).expect(201);
    });
  });

  describe('regla del ayudante', () => {
    it('edita y borra un consumo suyo de hoy', async () => {
      const { vet, ayu, animal, alimento } = await base();
      const c = (await crear(ayu.bearer, animal, alimento, { cantidadGramos: 1000 }).expect(201)).body;
      const res = await request(app).patch(`${T.ruta}/${c.id}`).set(ayu.bearer).send({ cantidadGramos: 2000 }).expect(200);
      expect(res.body.alimento.stockGramos).toBe(98000);
      await request(app).delete(`${T.ruta}/${c.id}`).set(ayu.bearer).expect(204);
      expect(await stockDe(vet.bearer, alimento.id)).toBe(100000);
    });

    it('403 con un consumo suyo de ayer (editar y borrar), sin alterar nada', async () => {
      const { vet, ayu, animal, alimento } = await base();
      const c = (await crear(ayu.bearer, animal, alimento, { fecha: AYER() }).expect(201)).body;
      await request(app).patch(`${T.ruta}/${c.id}`).set(ayu.bearer).send({ cantidadGramos: 5 }).expect(403);
      await request(app).delete(`${T.ruta}/${c.id}`).set(ayu.bearer).expect(403);
      expect(await stockDe(vet.bearer, alimento.id)).toBe(99000);
      const get = await request(app).get(`${T.ruta}/${c.id}`).set(ayu.bearer).expect(200);
      expect(get.body.cantidadGramos).toBe(1000);
    });

    it('403 con el consumo de otro usuario, aunque sea de hoy', async () => {
      const { vet, ayu, animal, alimento } = await base();
      const c = (await crear(vet.bearer, animal, alimento).expect(201)).body;
      await request(app).patch(`${T.ruta}/${c.id}`).set(ayu.bearer).send({ cantidadGramos: 5 }).expect(403);
      await request(app).delete(`${T.ruta}/${c.id}`).set(ayu.bearer).expect(403);
      const otroAyu = await sesionDe('AYUDANTE', [(await request(app).get(`${T.ruta}/${c.id}`).set(vet.bearer)).body.finca.id]);
      await request(app).patch(`${T.ruta}/${c.id}`).set(otroAyu.bearer).send({ cantidadGramos: 5 }).expect(403);
      expect(await stockDe(vet.bearer, alimento.id)).toBe(99000);
    });

    it('403 al mover su consumo de hoy a otra fecha', async () => {
      const { vet, ayu, animal, alimento } = await base();
      const c = (await crear(ayu.bearer, animal, alimento).expect(201)).body;
      await request(app).patch(`${T.ruta}/${c.id}`).set(ayu.bearer).send({ fecha: AYER() }).expect(403);
      const get = await request(app).get(`${T.ruta}/${c.id}`).set(ayu.bearer).expect(200);
      expect(get.body.fecha).toBe(HOY());
      expect(await stockDe(vet.bearer, alimento.id)).toBe(99000);
    });

    it('el veterinario edita y borra cualquier consumo de su finca', async () => {
      const { vet, ayu, animal, alimento } = await base();
      const ayer = (await crear(ayu.bearer, animal, alimento, { fecha: AYER() }).expect(201)).body;
      const hoy = (await crear(ayu.bearer, animal, alimento, { jornada: 'TARDE' }).expect(201)).body;
      await request(app).patch(`${T.ruta}/${ayer.id}`).set(vet.bearer).send({ cantidadGramos: 3000 }).expect(200);
      await request(app).patch(`${T.ruta}/${hoy.id}`).set(vet.bearer).send({ fecha: AYER() }).expect(200);
      await request(app).delete(`${T.ruta}/${ayer.id}`).set(vet.bearer).expect(204);
      expect(await stockDe(vet.bearer, alimento.id)).toBe(99000);
    });
  });

  describe('permisos y alcance', () => {
    it('sin token responde 401', async () => {
      await request(app).get(T.ruta).expect(401);
      await request(app).post(T.ruta).send({}).expect(401);
      await request(app).get(`${T.ruta}/${UUID_INEXISTENTE}`).expect(401);
      await request(app).patch(`${T.ruta}/${UUID_INEXISTENTE}`).send({}).expect(401);
      await request(app).delete(`${T.ruta}/${UUID_INEXISTENTE}`).expect(401);
    });

    it('usuario de la finca A no ve ni modifica consumos de la finca B (404)', async () => {
      const [a, b] = [await crearFinca('A'), await crearFinca('B')];
      const admin = await sesionDe('ADMINISTRADOR');
      const animalB = await T.crearAnimal(admin.bearer, b.id);
      const alimentoB = await crearAlimento(admin.bearer, b.id);
      const animalA = await T.crearAnimal(admin.bearer, a.id);
      const alimentoA = await crearAlimento(admin.bearer, a.id);
      const ajeno = (await crear(admin.bearer, animalB, alimentoB).expect(201)).body;
      const propio = (await crear(admin.bearer, animalA, alimentoA).expect(201)).body;
      const { bearer } = await sesionDe('VETERINARIO', [a.id]);

      const lista = await request(app).get(T.ruta).set(bearer).expect(200);
      expect(lista.body.map((x) => x.id)).toEqual([propio.id]);
      const inexistente = await request(app).get(`${T.ruta}/${UUID_INEXISTENTE}`).set(bearer).expect(404);
      const get = await request(app).get(`${T.ruta}/${ajeno.id}`).set(bearer).expect(404);
      expect(get.body).toEqual(inexistente.body);
      await request(app).patch(`${T.ruta}/${ajeno.id}`).set(bearer).send({ cantidadGramos: 5 }).expect(404);
      await request(app).delete(`${T.ruta}/${ajeno.id}`).set(bearer).expect(404);
      // Crear con animal o alimento ajeno.
      await crear(bearer, animalB, alimentoB).expect(404);
      await crear(bearer, animalA, alimentoB, { jornada: 'TARDE' }).expect(404);
      await crear(bearer, animalB, alimentoA, { jornada: 'TARDE' }).expect(404);
      expect(await stockDe(admin.bearer, alimentoB.id)).toBe(99000);
      expect(await stockDe(admin.bearer, alimentoA.id)).toBe(99000);
    });

    it('el administrador ve todo e id no uuid da 404', async () => {
      const [a, b] = [await crearFinca('A'), await crearFinca('B')];
      const admin = await sesionDe('ADMINISTRADOR');
      for (const f of [a, b]) {
        await crear(admin.bearer, await T.crearAnimal(admin.bearer, f.id), await crearAlimento(admin.bearer, f.id)).expect(201);
      }
      expect((await request(app).get(T.ruta).set(admin.bearer).expect(200)).body).toHaveLength(2);
      await request(app).get(`${T.ruta}/no-es-uuid`).set(admin.bearer).expect(404);
      await request(app).patch(`${T.ruta}/no-es-uuid`).set(admin.bearer).send({ cantidadGramos: 5 }).expect(404);
      await request(app).delete(`${T.ruta}/no-es-uuid`).set(admin.bearer).expect(404);
    });
  });

  describe('listado', () => {
    async function escenario() {
      const { finca, vet, ayu, animal, alimento } = await base();
      const animal2 = await T.crearAnimal(vet.bearer, finca.id, 'Zeta Segundo');
      const heno = await crearAlimento(vet.bearer, finca.id, { nombre: 'Heno' });
      const ids = {};
      const registrar = async (clave, an, al, jornada, fecha) => {
        ids[clave] = (await crear(vet.bearer, an, al, { jornada, fecha, cantidadGramos: 100 }).expect(201)).body.id;
      };
      await registrar('hoyManana', animal, alimento, 'MANANA', HOY());
      await registrar('hoyNoche', animal, alimento, 'NOCHE', HOY());
      await registrar('hoyTarde', animal, alimento, 'TARDE', HOY());
      await registrar('hoyTardeB', animal2, alimento, 'TARDE', HOY());
      await registrar('ayerManana', animal, heno, 'MANANA', AYER());
      await registrar('hace5', animal, alimento, 'MANANA', bogota(-5));
      return { finca, vet, ayu, animal, animal2, alimento, heno, ids };
    }
    const orden = (res) => res.body.map((x) => x.id);

    it('ordena por fecha desc, jornada (NOCHE, TARDE, MANANA) y nombre', async () => {
      const { vet, ids } = await escenario();
      const res = await request(app).get(T.ruta).set(vet.bearer).expect(200);
      expect(orden(res)).toEqual([ids.hoyNoche, ids.hoyTarde, ids.hoyTardeB, ids.hoyManana, ids.ayerManana, ids.hace5]);
    });

    it('filtra por desde y hasta, ambos inclusivos', async () => {
      const { vet, ids } = await escenario();
      const r1 = await request(app).get(`${T.ruta}?desde=${AYER()}&hasta=${AYER()}`).set(vet.bearer).expect(200);
      expect(orden(r1)).toEqual([ids.ayerManana]);
      const r2 = await request(app).get(`${T.ruta}?desde=${HOY()}`).set(vet.bearer).expect(200);
      expect(r2.body).toHaveLength(4);
      const r3 = await request(app).get(`${T.ruta}?hasta=${bogota(-5)}`).set(vet.bearer).expect(200);
      expect(orden(r3)).toEqual([ids.hace5]);
      const r4 = await request(app).get(`${T.ruta}?desde=${bogota(-5)}&hasta=${AYER()}`).set(vet.bearer).expect(200);
      expect(orden(r4)).toEqual([ids.ayerManana, ids.hace5]);
    });

    it('filtra por jornada', async () => {
      const { vet, ids } = await escenario();
      const res = await request(app).get(`${T.ruta}?jornada=TARDE`).set(vet.bearer).expect(200);
      expect(orden(res)).toEqual([ids.hoyTarde, ids.hoyTardeB]);
    });

    it(`filtra por ${T.campo}`, async () => {
      const { vet, animal2, ids } = await escenario();
      const res = await request(app).get(`${T.ruta}?${T.campo}=${animal2.id}`).set(vet.bearer).expect(200);
      expect(orden(res)).toEqual([ids.hoyTardeB]);
    });

    it('filtra por alimentoId y fincaId', async () => {
      const { finca, vet, heno, ids } = await escenario();
      const res = await request(app).get(`${T.ruta}?alimentoId=${heno.id}`).set(vet.bearer).expect(200);
      expect(orden(res)).toEqual([ids.ayerManana]);
      const rf = await request(app).get(`${T.ruta}?fincaId=${finca.id}`).set(vet.bearer).expect(200);
      expect(rf.body).toHaveLength(6);
    });

    it('el ayudante puede consultar', async () => {
      const { ayu } = await escenario();
      const res = await request(app).get(T.ruta).set(ayu.bearer).expect(200);
      expect(res.body).toHaveLength(6);
      expect(res.body[0]).toMatchObject({ fecha: HOY(), alimento: { nombre: expect.any(String), stockGramos: expect.any(Number) } });
    });
  });

  describe('consistencia', () => {
    it('stockGramos == stock inicial + entradas − consumos vigentes tras varias operaciones', async () => {
      const { finca, vet, ayu, animal, alimento } = await base();
      const otroAnimal = await T.crearAnimal(vet.bearer, finca.id, 'Segundo');
      const heno = await crearAlimento(vet.bearer, finca.id, { nombre: 'Heno', stockInicialGramos: 20000 });
      await request(app).post(`/api/alimentos/${alimento.id}/entradas`).set(vet.bearer).send({ cantidadGramos: 30000 }).expect(201);
      const c1 = (await crear(vet.bearer, animal, alimento, { cantidadGramos: 4000, jornada: 'MANANA' }).expect(201)).body;
      const c2 = (await crear(ayu.bearer, otroAnimal, alimento, { cantidadGramos: 2500, jornada: 'TARDE' }).expect(201)).body;
      const c3 = (await crear(vet.bearer, animal, alimento, { cantidadGramos: 1500, jornada: 'NOCHE', fecha: AYER() }).expect(201)).body;
      await request(app).patch(`${T.ruta}/${c1.id}`).set(vet.bearer).send({ cantidadGramos: 6000 }).expect(200);
      await request(app).patch(`${T.ruta}/${c2.id}`).set(ayu.bearer).send({ alimentoId: heno.id }).expect(200);
      await request(app).delete(`${T.ruta}/${c3.id}`).set(vet.bearer).expect(204);
      await crear(vet.bearer, animal, heno, { cantidadGramos: 500 }).expect(201);
      await crear(vet.bearer, animal, alimento, { cantidadGramos: 999, jornada: 'MANANA' }).expect(409);

      // Vigentes: alimento = 6000 (c1); heno = 2500 (c2) + 500.
      expect(await stockDe(vet.bearer, alimento.id)).toBe(100000 + 30000 - 6000);
      expect(await stockDe(vet.bearer, heno.id)).toBe(20000 - 2500 - 500);

      for (const [al, inicial, entradas] of [[alimento, 100000, 30000], [heno, 20000, 0]]) {
        const movs = (await request(app).get(`/api/alimentos/${al.id}/movimientos`).set(vet.bearer).expect(200)).body;
        const suma = movs.reduce((s, m) => s + m.cantidadGramos, 0);
        expect(suma).toBe(await stockDe(vet.bearer, al.id));
        expect(movs.filter((m) => m.tipo === 'ENTRADA').reduce((s, m) => s + m.cantidadGramos, 0)).toBe(inicial + entradas);
      }
    });
  });
});

describe('consumos - los dos recursos comparten alimento', () => {
  it('consumos de vacunos y lotes descuentan del mismo stock y salen en movimientos', async () => {
    const finca = await crearFinca('A');
    const vet = await sesionDe('VETERINARIO', [finca.id]);
    const [V, L] = TIPOS;
    const vacuno = await V.crearAnimal(vet.bearer, finca.id);
    const lote = await L.crearAnimal(vet.bearer, finca.id);
    const alimento = await crearAlimento(vet.bearer, finca.id, { stockInicialGramos: 50000 });
    await request(app).post(V.ruta).set(vet.bearer).send({ vacunoId: vacuno.id, alimentoId: alimento.id, cantidadGramos: 3000, jornada: 'MANANA', fecha: HOY() }).expect(201);
    await request(app).post(L.ruta).set(vet.bearer).send({ loteId: lote.id, alimentoId: alimento.id, cantidadGramos: 8000, jornada: 'MANANA', fecha: HOY() }).expect(201);
    expect(await stockDe(vet.bearer, alimento.id)).toBe(39000);
    const movs = (await request(app).get(`/api/alimentos/${alimento.id}/movimientos`).set(vet.bearer).expect(200)).body;
    expect(movs.map((m) => m.tipo).sort()).toEqual(['CONSUMO_LOTE', 'CONSUMO_VACUNO', 'ENTRADA']);
  });

  it('un vacunoId no sirve en la ruta de lotes y viceversa (404 o 400)', async () => {
    const finca = await crearFinca('A');
    const vet = await sesionDe('VETERINARIO', [finca.id]);
    const [V, L] = TIPOS;
    const vacuno = await V.crearAnimal(vet.bearer, finca.id);
    const alimento = await crearAlimento(vet.bearer, finca.id);
    const r = await request(app).post(L.ruta).set(vet.bearer).send({ loteId: vacuno.id, alimentoId: alimento.id, cantidadGramos: 100, jornada: 'MANANA', fecha: HOY() });
    expect([400, 404]).toContain(r.status);
    expect(await stockDe(vet.bearer, alimento.id)).toBe(100000);
  });
});
