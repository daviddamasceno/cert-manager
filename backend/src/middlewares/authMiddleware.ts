import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/container';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: 'admin' | 'viewer';
  };
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ message: 'Não autenticado' });
    return;
  }

  const [, token] = authHeader.split(' ');
  if (!token) {
    res.status(401).json({ message: 'Token ausente' });
    return;
  }

  try {
    const payload = authService.verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
};
