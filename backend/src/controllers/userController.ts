import { Router } from 'express';
import { authorizeRoles } from '../middlewares/authorizeRoles';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { userService } from '../services/container';
import { UserFilters, UpdateUserInput } from '../services/userService';
import { UserRole, UserStatus } from '../domain/types';
import { sanitizeString } from '../utils/validators';

const parseRole = (value: unknown): UserRole | undefined => {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'admin' || normalized === 'editor' || normalized === 'viewer') {
    return normalized as UserRole;
  }
  throw new Error('Role inválida.');
};

const parseStatus = (value: unknown): UserStatus | undefined => {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'active' || normalized === 'disabled') {
    return normalized as UserStatus;
  }
  throw new Error('Status inválido.');
};

export const userController = Router();

userController.use(authorizeRoles('admin'));

userController.get('/', async (req, res) => {
  try {
    const filters: UserFilters = {};
    const { status, role, q } = req.query;
    const parsedStatus = parseStatus(status);
    const parsedRole = parseRole(role);
    if (parsedStatus) {
      filters.status = parsedStatus;
    }
    if (parsedRole) {
      filters.role = parsedRole;
    }
    if (typeof q === 'string' && q.trim().length) {
      filters.query = q.trim();
    }

    const users = await userService.list(filters);
    res.json(users);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Parâmetros inválidos.' });
  }
});

userController.post('/', async (req: AuthenticatedRequest, res) => {
  const { email, name, role, status } = req.body ?? {};
  if (typeof email !== 'string' || typeof name !== 'string') {
    res.status(400).json({ message: 'E-mail e nome são obrigatórios.' });
    return;
  }

  try {
    const actor = req.user!;
    const result = await userService.create(
      {
        email: sanitizeString(email),
        name: name.trim(),
        role: parseRole(role) ?? 'viewer',
        status: parseStatus(status) ?? 'active'
      },
      actor,
      { ip: req.ip, userAgent: req.get('user-agent') }
    );

    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao criar usuário.' });
  }
});

userController.put('/:id', async (req: AuthenticatedRequest, res) => {
  const { name, role, status, resetPassword } = req.body ?? {};
  const input: UpdateUserInput = {};
  if (typeof name === 'string') {
    input.name = name.trim();
  }
  if (role !== undefined) {
    input.role = parseRole(role);
  }
  if (status !== undefined) {
    input.status = parseStatus(status);
  }
  if (resetPassword !== undefined) {
    input.resetPassword = Boolean(resetPassword);
  }

  try {
    const actor = req.user!;
    const result = await userService.update(req.params.id, input, actor, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao atualizar usuário.' });
  }
});

userController.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = req.user!;
    await userService.disable(req.params.id, actor, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao desativar usuário.' });
  }
});
