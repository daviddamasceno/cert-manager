import pinoHttp from 'pino-http';
import logger from '../utils/logger';

export const requestLogger = pinoHttp({
  logger: logger as any,
  customSuccessMessage: (_req: any, res: any) => `Completed ${res.statusCode}`
} as any);
