import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import config from './config/env';
import { router } from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { requestLogger } from './middlewares/requestLogger';
import { globalRateLimiter, sensitiveRouteRateLimiter } from './middlewares/rateLimiter';
import { metricsMiddleware } from './middlewares/metricsMiddleware';
import { initializeServices } from './services/container';

export const createApp = () => {
  initializeServices();

  const app = express();
  app.set('trust proxy', 1);
  const corsOptions: cors.CorsOptions = {
    origin: config.appBaseUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
  app.use(cors(corsOptions));
  app.use(globalRateLimiter);
  app.use(cookieParser());
  app.use(helmet());
  app.use(express.json());
  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use('/api', sensitiveRouteRateLimiter, router);
  app.use(errorHandler);

  app.get('/', (_req, res) => {
    res.json({ name: 'Cert Manager API', version: '1.0.0', environment: config.env });
  });

  return app;
};
