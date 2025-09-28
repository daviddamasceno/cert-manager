import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import config from './config/env';
import { router } from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { requestLogger } from './middlewares/requestLogger';
import { apiRateLimiter, sensitiveRouteRateLimiter } from './middlewares/rateLimiter';
import { metricsMiddleware } from './middlewares/metricsMiddleware';
import { initializeServices } from './services/container';

export const createApp = () => {
  initializeServices();

  const app = express();
  const corsOptions: cors.CorsOptions = {
    origin: config.appBaseUrl,
    credentials: true
  };
  app.use(cors(corsOptions));
  app.use(cookieParser());
  app.use(helmet());
  app.use(express.json());
  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use('/api', apiRateLimiter, sensitiveRouteRateLimiter, router);
  app.use(errorHandler);

  app.get('/', (_req, res) => {
    res.json({ name: 'Cert Manager API', version: '1.0.0', environment: config.env });
  });

  return app;
};
