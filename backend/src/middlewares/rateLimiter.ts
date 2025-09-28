import rateLimit from 'express-rate-limit';
import config from '../config/env';

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

export const channelTestRateLimiter = rateLimit({
  windowMs: config.rateLimits.testChannelWindowMs,
  max: config.rateLimits.testChannelMax,
  standardHeaders: true,
  legacyHeaders: false
});
