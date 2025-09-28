import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/container';
import { InvalidTokenError } from '../services/authService';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
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
    const payload = authService.verifyToken(token, 'access');
    req.user = { id: payload.sub || payload.email, email: payload.email };
    next();
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      res.status(401).json({ message: 'Token inválido' });
      return;
    }

    res.status(401).json({ message: 'Token inválido' });
  }
};
