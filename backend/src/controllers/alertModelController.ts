import { Router } from 'express';
import { alertModelService } from '../services/container';
import { requireRole } from '../middlewares/roleMiddleware';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveRequestActor } from '../utils/requestContext';

export const alertModelController = Router();

alertModelController.get('/', async (_req, res) => {
  const models = await alertModelService.list();
  res.json(models);
});

alertModelController.post('/', requireRole(['editor']), async (req: AuthenticatedRequest, res) => {
  try {
    const actor = resolveRequestActor(req);
    const created = await alertModelService.create(req.body, actor);
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

alertModelController.put('/:id', requireRole(['editor']), async (req: AuthenticatedRequest, res) => {
  try {
    const actor = resolveRequestActor(req);
    const updated = await alertModelService.update(req.params.id, req.body, actor);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

alertModelController.delete('/:id', requireRole(['editor']), async (req: AuthenticatedRequest, res) => {
  const actor = resolveRequestActor(req);
  await alertModelService.delete(req.params.id, actor);
  res.status(204).send();
});
