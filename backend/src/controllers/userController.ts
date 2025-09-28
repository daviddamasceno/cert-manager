import { Router } from 'express';
import { userService } from '../services/container';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { CreateUserInput, UpdateUserInput } from '../services/userService';
import { resolveRequestActor } from '../utils/requestContext';

const parseCreateBody = (body: any): CreateUserInput => {
  const email = typeof body?.email === 'string' ? body.email : '';
  const name = typeof body?.name === 'string' ? body.name : '';
  const role = typeof body?.role === 'string' ? body.role : '';

  return { email, name, role: role as CreateUserInput['role'] };
};

const parseUpdateBody = (body: any): UpdateUserInput => {
  const update: UpdateUserInput = {};

  if (body && typeof body === 'object') {
    if (body.name !== undefined) {
      update.name = String(body.name);
    }
    if (body.role !== undefined) {
      update.role = String(body.role) as UpdateUserInput['role'];
    }
    if (body.status !== undefined) {
      update.status = String(body.status) as UpdateUserInput['status'];
    }
  }

  return update;
};

export const userController = Router();

userController.get('/', async (_req, res) => {
  const users = await userService.list();
  res.json(users);
});

userController.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = resolveRequestActor(req);
    const result = await userService.create(parseCreateBody(req.body), actor);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

userController.put('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = resolveRequestActor(req);
    const updated = await userService.update(req.params.id, parseUpdateBody(req.body), actor);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

userController.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = resolveRequestActor(req);
    await userService.disable(req.params.id, actor);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

userController.post('/:id/reset-password', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = resolveRequestActor(req);
    const result = await userService.resetPassword(req.params.id, actor);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});
