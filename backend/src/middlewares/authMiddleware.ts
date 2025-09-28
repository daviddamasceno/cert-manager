import { Request, Response, NextFunction } from 'express';
import { authService, userService } from '../services/container';
import { AuthenticatedUser } from '../services/authService';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const extractToken = (req: Request): string | undefined => {
  const cookieToken = req.cookies?.[authService.accessCookieName];
  if (cookieToken) {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return undefined;
  }
  const [scheme, value] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return undefined;
  }
  return value;
};

export const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ message: 'Não autenticado' });
      return;
    }

    const payload = authService.verifyAccessToken(token);
    const user = await userService.getById(payload.sub);
    if (!user || user.status !== 'active') {
      res.status(401).json({ message: 'Sessão inválida' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      mfaEnabled: user.mfaEnabled
    };

    next();
  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
};
