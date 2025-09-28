import { Router } from 'express';
import { alertModelService } from '../services/container';
import { requireRole } from '../middlewares/roleMiddleware';

export const alertModelController = Router();

alertModelController.get('/', async (_req, res) => {
  const models = await alertModelService.list();
  res.json(models);
});

alertModelController.post('/', requireRole(['editor']), async (req, res) => {
  try {
    const created = await alertModelService.create(req.body);
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

alertModelController.put('/:id', requireRole(['editor']), async (req, res) => {
  try {
    const updated = await alertModelService.update(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

alertModelController.delete('/:id', requireRole(['editor']), async (req, res) => {
  await alertModelService.delete(req.params.id);
  res.status(204).send();
});
