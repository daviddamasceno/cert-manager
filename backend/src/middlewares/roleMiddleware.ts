import { RequestHandler } from 'express';
import { User } from '../domain/types';
import { AuthenticatedRequest } from './authMiddleware';

type Role = User['role'];

export const requireRole = (roles: Role[]): RequestHandler => {
  const allowed = new Set<Role>(roles);

  return (req: AuthenticatedRequest, res, next) => {
    const role = req.user?.role;
    if (!role) {
      res.status(403).json({ message: 'Acesso negado' });
      return;
    }

    if (role === 'admin' || allowed.has(role)) {
      next();
      return;
    }

    res.status(403).json({ message: 'Acesso negado' });
  };
};

export const requireAnyRole = (): RequestHandler => requireRole(['viewer', 'editor']);
