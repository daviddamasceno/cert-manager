import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction): void => {
  logger.error({ err }, 'Unhandled error');
  res.status(err.status || 500).json({ message: err.message || 'Erro interno' });
};
