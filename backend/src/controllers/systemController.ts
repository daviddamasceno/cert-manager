import { Router } from 'express';
import config from '../config/config';
import { register } from '../utils/metrics';

export const systemController = Router();

systemController.get('/health', (_req, res) => {
  res.json({ status: 'ok', environment: config.env });
});

systemController.get('/metrics', async (_req, res) => {
  if (!config.metrics.enabled) {
    res.status(404).send('metrics disabled');
    return;
  }
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});
