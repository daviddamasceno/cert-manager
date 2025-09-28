import { Request, Response, NextFunction } from 'express';
import { trackRequest } from '../utils/metrics';

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e9;
    trackRequest(
      {
        method: req.method,
        route: req.route?.path || req.path,
        status: String(res.statusCode)
      },
      duration
    );
  });
  next();
};
