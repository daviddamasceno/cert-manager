import { Router } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { certificateService } from '../services/container';
import { alertModelService } from '../services/container';
import { notificationService } from '../services/container';
import { parseDate, now } from '../utils/time';

export const certificateController = Router();

certificateController.get('/', async (req, res) => {
  const { status, name, expiresBefore, expiresAfter } = req.query;
  const certificates = await certificateService.list();

  const filtered = certificates.filter((certificate) => {
    if (status && certificate.status !== status) {
      return false;
    }
    if (name && !certificate.name.toLowerCase().includes(String(name).toLowerCase())) {
      return false;
    }
    const expiration = parseDate(certificate.expiresAt);
    if (expiresBefore) {
      const before = parseDate(String(expiresBefore));
      if (expiration.toMillis() > before.toMillis()) {
        return false;
      }
    }
    if (expiresAfter) {
      const after = parseDate(String(expiresAfter));
      if (expiration.toMillis() < after.toMillis()) {
        return false;
      }
    }
    return true;
  });

  res.json(filtered);
});

certificateController.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = req.user ?? { id: 'system', email: 'system@local' };
    const created = await certificateService.create(
      {
        ...req.body,
        channelIds: req.body.channelIds || req.body.channels || []
      },
      actor
    );
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

certificateController.put('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = req.user ?? { id: 'system', email: 'system@local' };
    const updated = await certificateService.update(
      req.params.id,
      {
        ...req.body,
        channelIds: req.body.channelIds || req.body.channels
      },
      actor
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

certificateController.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const actor = req.user ?? { id: 'system', email: 'system@local' };
  await certificateService.delete(req.params.id, actor);
  res.status(204).send();
});

certificateController.get('/:id/channels', async (req, res) => {
  const links = await certificateService.getChannelLinks(req.params.id);
  res.json(links);
});

certificateController.post('/:id/channels', async (req: AuthenticatedRequest, res) => {
  const actor = req.user ?? { id: 'system', email: 'system@local' };
  const channelIds: string[] = Array.isArray(req.body.channelIds) ? req.body.channelIds : [];
  await certificateService.setChannelLinks(req.params.id, channelIds, actor);
  res.json({ channelIds });
});

certificateController.post('/:id/test-notification', async (req, res) => {
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

  await notificationService.sendAlerts(certificate, alertModel, daysLeft);

  res.json({ message: 'Notificação de teste enviada' });
});
