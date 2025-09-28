import { Router } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { certificateService, alertModelService, notificationService } from '../services/container';
import type { CertificateInput } from '../services/certificateService';
import { parseDate, now } from '../utils/time';
import { sanitizeString } from '../utils/validators';
import { channelTestRateLimiter } from '../middlewares/rateLimiter';
import { requireRole } from '../middlewares/roleMiddleware';

const extractChannelIds = (source: Record<string, unknown>): string[] => {
  if (Array.isArray(source.channelIds)) {
    return source.channelIds.map((value) => sanitizeString(value)).filter((value) => value.length > 0);
  }
  if (Array.isArray(source.channels)) {
    return source.channels.map((value) => sanitizeString(value)).filter((value) => value.length > 0);
  }
  return [];
};

const parseCertificateCreatePayload = (body: unknown): CertificateInput => {
  if (!body || typeof body !== 'object') {
    throw new Error('Payload inválido para certificado');
  }
  const source = body as Record<string, unknown>;
  const channelIds = extractChannelIds(source);

  const statusValue = sanitizeString(source.status);
  return {
    name: sanitizeString(source.name),
    ownerEmail: sanitizeString(source.ownerEmail),
    issuedAt: sanitizeString(source.issuedAt),
    expiresAt: sanitizeString(source.expiresAt),
    status: statusValue ? (statusValue as CertificateInput['status']) : undefined,
    alertModelId: (() => {
      const value = sanitizeString(source.alertModelId);
      return value || undefined;
    })(),
    notes: (() => {
      const value = sanitizeString(source.notes);
      return value || undefined;
    })(),
    channelIds
  };
};

const parseCertificateUpdatePayload = (body: unknown): Partial<CertificateInput> => {
  if (!body || typeof body !== 'object') {
    return {};
  }

  const source = body as Record<string, unknown>;
  const result: Partial<CertificateInput> = {};

  if (source.name !== undefined) {
    result.name = sanitizeString(source.name);
  }
  if (source.ownerEmail !== undefined) {
    result.ownerEmail = sanitizeString(source.ownerEmail);
  }
  if (source.issuedAt !== undefined) {
    result.issuedAt = sanitizeString(source.issuedAt);
  }
  if (source.expiresAt !== undefined) {
    result.expiresAt = sanitizeString(source.expiresAt);
  }
  if (source.status !== undefined) {
    const status = sanitizeString(source.status);
    if (status) {
      result.status = status as CertificateInput['status'];
    }
  }
  if (source.alertModelId !== undefined) {
    const alertModelId = sanitizeString(source.alertModelId);
    result.alertModelId = alertModelId || undefined;
  }
  if (source.notes !== undefined) {
    const notes = sanitizeString(source.notes);
    result.notes = notes || undefined;
  }
  if (source.channelIds !== undefined || source.channels !== undefined) {
    result.channelIds = extractChannelIds(source);
  }

  return result;
};

const sanitizeQueryString = (value: unknown): string | undefined => {
  const normalized = sanitizeString(value);
  return normalized || undefined;
};

export const certificateController = Router();

certificateController.get('/', async (req, res) => {
  const statusFilter = sanitizeQueryString(req.query.status);
  const nameFilter = sanitizeQueryString(req.query.name)?.toLowerCase();
  const expiresBefore = sanitizeQueryString(req.query.expiresBefore);
  const expiresAfter = sanitizeQueryString(req.query.expiresAfter);

  const certificates = await certificateService.list();

  const filtered = certificates.filter((certificate) => {
    if (statusFilter && certificate.status !== statusFilter) {
      return false;
    }
    if (nameFilter && !certificate.name.toLowerCase().includes(nameFilter)) {
      return false;
    }
    const expiration = parseDate(certificate.expiresAt);
    if (expiresBefore) {
      const before = parseDate(expiresBefore);
      if (expiration.toMillis() > before.toMillis()) {
        return false;
      }
    }
    if (expiresAfter) {
      const after = parseDate(expiresAfter);
      if (expiration.toMillis() < after.toMillis()) {
        return false;
      }
    }
    return true;
  });

  res.json(filtered);
});

certificateController.post('/', requireRole(['editor']), async (req: AuthenticatedRequest, res) => {
  try {
    const actor = req.user ?? { id: 'system', email: 'system@local' };
    const payload = parseCertificateCreatePayload(req.body);
    const created = await certificateService.create(payload, actor);
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

certificateController.put('/:id', requireRole(['editor']), async (req: AuthenticatedRequest, res) => {
  try {
    const actor = req.user ?? { id: 'system', email: 'system@local' };
    const payload = parseCertificateUpdatePayload(req.body);
    const updated = await certificateService.update(req.params.id, payload, actor);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

certificateController.delete('/:id', requireRole(['editor']), async (req: AuthenticatedRequest, res) => {
  const actor = req.user ?? { id: 'system', email: 'system@local' };
  await certificateService.delete(req.params.id, actor);
  res.status(204).send();
});

certificateController.get('/:id/channels', async (req, res) => {
  const links = await certificateService.getChannelLinks(req.params.id);
  res.json(links);
});

certificateController.post('/:id/channels', requireRole(['editor']), async (req: AuthenticatedRequest, res) => {
  const actor = req.user ?? { id: 'system', email: 'system@local' };
  const source = (req.body ?? {}) as Record<string, unknown>;
  const channelIds = extractChannelIds(source);
  await certificateService.setChannelLinks(req.params.id, channelIds, actor);
  res.json({ channelIds });
});

certificateController.post(
  '/:id/test-notification',
  requireRole(['editor']),
  channelTestRateLimiter,
  async (req, res) => {
    const certificate = await certificateService.get(req.params.id);
    if (!certificate) {
      res.status(404).json({ message: 'Certificado não encontrado' });
      return;
    }

    if (!certificate.alertModelId) {
      res.status(400).json({ message: 'Certificado sem modelo de alerta vinculado' });
      return;
    }

    const alertModel = await alertModelService.get(certificate.alertModelId);
    if (!alertModel) {
      res.status(400).json({ message: 'Modelo de alerta não encontrado' });
      return;
    }

    const daysLeft = Math.floor(parseDate(certificate.expiresAt).diff(now(), 'days').days);

    const actor = (req as AuthenticatedRequest).user ?? { id: 'system', email: 'system@local' };

    try {
      await notificationService.sendAlerts(certificate, alertModel, daysLeft, actor);
      res.json({ message: 'Notificação de teste enviada' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao enviar notificações';
      res.status(500).json({ message });
    }
  }
);
