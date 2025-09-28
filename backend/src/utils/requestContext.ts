import type { Request } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware';
import type { AuditActor } from '../domain/types';

const SYSTEM_ACTOR: AuditActor = { id: 'system', email: 'system@local' };

const pickHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.find((item) => item && item.trim().length > 0)?.trim();
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const extractClientIp = (req: Request): string | undefined => {
  const forwarded = pickHeaderValue(req.headers['x-forwarded-for']);
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || forwarded;
  }
  const ip = req.ip;
  if (ip && ip.trim().length > 0) {
    return ip.trim();
  }
  return undefined;
};

const extractUserAgent = (req: Request): string | undefined => {
  return pickHeaderValue(req.headers['user-agent']);
};

export const resolveRequestActor = (req: AuthenticatedRequest): AuditActor => {
  const base = req.user ? { id: req.user.id, email: req.user.email } : SYSTEM_ACTOR;

  return {
    ...base,
    ip: extractClientIp(req),
    userAgent: extractUserAgent(req)
  };
};
