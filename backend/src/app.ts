import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config/env';
import { router } from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { requestLogger } from './middlewares/requestLogger';
import { apiRateLimiter } from './middlewares/rateLimiter';
import { metricsMiddleware } from './middlewares/metricsMiddleware';
import { initializeServices } from './services/container';

export const createApp = () => {
  initializeServices();

  const app = express();
  app.use(cors());
  app.use(helmet());
  app.use(express.json());
  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use('/api', apiRateLimiter, router);
  app.use(errorHandler);

  app.get('/', (_req, res) => {
    res.json({ name: 'Cert Manager API', version: '1.0.0', environment: config.env });
  });

  return app;
};
