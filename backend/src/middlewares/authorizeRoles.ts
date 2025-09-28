import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from './authMiddleware';
import { UserRole } from '../domain/types';

export const authorizeRoles = (...allowed: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Não autenticado' });
      return;
    }
    if (!allowed.includes(user.role)) {
      res.status(403).json({ message: 'Permissão negada' });
      return;
    }
    next();
  };
};
