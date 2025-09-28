import { Router } from 'express';
import { channelService } from '../services/container';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

export const channelController = Router();

channelController.get('/', async (_req, res) => {
  const channels = await channelService.list();
  res.json(channels);
});

channelController.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = req.user ?? { id: 'system', email: 'system@local' };
    const created = await channelService.create(req.body, actor);
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

channelController.put('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = req.user ?? { id: 'system', email: 'system@local' };
    const updated = await channelService.update(req.params.id, req.body, actor);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

channelController.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const actor = req.user ?? { id: 'system', email: 'system@local' };
  await channelService.softDelete(req.params.id, actor);
  res.status(204).send();
});
