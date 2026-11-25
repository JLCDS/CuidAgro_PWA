import { Router } from 'express';
import { idRecurso } from '../../lib/registros.js';
import { requireAuth, requirePermiso } from '../../middleware/auth.js';
import { esquemasConsumo } from './consumos.schemas.js';
import { CONFIG_LOTES, CONFIG_VACUNOS, servicioConsumos } from './consumos.service.js';

const registrar = requirePermiso('consumos:registrar');

function routerConsumos(cfg) {
  const servicio = servicioConsumos(cfg);
  const esquemas = esquemasConsumo(cfg);
  const idConsumo = (valor) => idRecurso(valor, 'Consumo');
  const router = Router();

  router.get('/', registrar, async (req, res) => {
    res.json(await servicio.listar(req.actor, esquemas.query.parse(req.query)));
  });
  router.get('/:id', registrar, async (req, res) => {
    res.json(await servicio.obtener(req.actor, idConsumo(req.params.id)));
  });
  router.post('/', registrar, async (req, res) => {
    const { registro, creado } = await servicio.crear(req.actor, esquemas.create.parse(req.body));
    res.status(creado ? 201 : 200).json(registro);
  });
  router.patch('/:id', registrar, async (req, res) => {
    res.json(await servicio.actualizar(req.actor, idConsumo(req.params.id), esquemas.update.parse(req.body)));
  });
  router.delete('/:id', registrar, async (req, res) => {
    await servicio.eliminar(req.actor, idConsumo(req.params.id));
    res.status(204).end();
  });
  return router;
}

export const consumosRouter = Router();
consumosRouter.use(requireAuth);
consumosRouter.use('/vacunos', routerConsumos(CONFIG_VACUNOS));
consumosRouter.use('/lotes', routerConsumos(CONFIG_LOTES));
