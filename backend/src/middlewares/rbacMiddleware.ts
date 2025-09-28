import { NextFunction, Response } from 'express';
import { UserRole } from '../domain/types';
import { AuthenticatedRequest } from './authMiddleware';

export const requireRoles = (...roles: UserRole[]) => {
  const allowed = new Set<UserRole>(roles);

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
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
