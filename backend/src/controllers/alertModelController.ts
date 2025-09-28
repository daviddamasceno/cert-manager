import { Router } from 'express';
import { alertModelService } from '../services/container';
import { authorizeRoles } from '../middlewares/authorizeRoles';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { RequestMetadata, ServiceActor, SYSTEM_ACTOR } from '../services/types';

const resolveActor = (req: AuthenticatedRequest): ServiceActor => {
  const user = req.user;
  if (!user) {
    return SYSTEM_ACTOR;
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name
  };
};

const buildMetadata = (req: AuthenticatedRequest): RequestMetadata => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? undefined
});

export const alertModelController = Router();

alertModelController.get('/', async (_req, res) => {
  const models = await alertModelService.list();
  res.json(models);
});

alertModelController.post('/', authorizeRoles('admin', 'editor'), async (req: AuthenticatedRequest, res) => {
  try {
    const created = await alertModelService.create(req.body, resolveActor(req), buildMetadata(req));
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

alertModelController.put(
  '/:id',
  authorizeRoles('admin', 'editor'),
  async (req: AuthenticatedRequest, res) => {
  try {
    const updated = await alertModelService.update(
      req.params.id,
      req.body,
      resolveActor(req),
      buildMetadata(req)
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
  }
);

alertModelController.delete(
  '/:id',
  authorizeRoles('admin', 'editor'),
  async (req: AuthenticatedRequest, res) => {
    await alertModelService.delete(req.params.id, resolveActor(req), buildMetadata(req));
  res.status(204).send();
  }
);
