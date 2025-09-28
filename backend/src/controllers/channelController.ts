import { Router } from 'express';
import { channelService } from '../services/container';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { ChannelType } from '../domain/types';
import { channelTestRateLimiter } from '../middlewares/rateLimiter';
import { resolveRequestActor } from '../utils/requestContext';

const isValidType = (value: unknown): value is ChannelType =>
  typeof value === 'string' &&
  ['email_smtp', 'telegram_bot', 'slack_webhook', 'googlechat_webhook'].includes(value);

const parseBody = (body: any, { requireName, requireType }: { requireName: boolean; requireType: boolean }) => {
  const result: any = {};

  if (requireType || body.type !== undefined) {
    if (!isValidType(body.type)) {
      throw new Error(`Unsupported channel type: ${body.type}`);
    }
    result.type = body.type as ChannelType;
  }

  if (requireName || body.name !== undefined) {
    if (!body.name) {
      throw new Error('Channel name is required');
    }
    result.name = String(body.name);
  }

  if (body.enabled !== undefined) {
    result.enabled = Boolean(body.enabled);
  }

  if (body.params && typeof body.params === 'object') {
    result.params = body.params;
  }

  if (body.secrets && typeof body.secrets === 'object') {
    result.secrets = body.secrets;
  }

  return result;
};

export const channelController = Router();

channelController.get('/', async (_req, res) => {
  const channels = await channelService.list();
  res.json(channels);
});

channelController.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = resolveRequestActor(req);
    const created = await channelService.create(
      parseBody(req.body, { requireName: true, requireType: true }),
      actor
    );
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

channelController.put('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const actor = resolveRequestActor(req);
    const updated = await channelService.update(
      req.params.id,
      parseBody(req.body, { requireName: false, requireType: false }),
      actor
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

channelController.post(
  '/:id/test',
  channelTestRateLimiter,
  async (req: AuthenticatedRequest, res) => {
    const actor = resolveRequestActor(req);
    try {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await channelService.testChannel(req.params.id, payload, actor);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: String(error) });
    }
  }
);

channelController.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const actor = resolveRequestActor(req);
  try {
    await channelService.softDelete(req.params.id, actor);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});
