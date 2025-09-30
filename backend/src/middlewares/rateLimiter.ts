import rateLimit from 'express-rate-limit';
import config from '../config/config';

const sensitiveRoutePattern = /\/(test|send)(?:[/?]|$)/;

export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimits.globalWindowMs,
  max: config.rateLimits.globalMax,
  standardHeaders: true,
  legacyHeaders: false
});

export const channelTestRateLimiter = rateLimit({
  windowMs: config.rateLimits.testChannelWindowMs,
  max: config.rateLimits.testChannelMax,
  standardHeaders: true,
  legacyHeaders: false
});

export const sensitiveRouteRateLimiter = rateLimit({
  windowMs: config.rateLimits.sensitiveRouteWindowMs,
  max: config.rateLimits.sensitiveRouteMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const path = req.originalUrl || req.url || '';
    return !sensitiveRoutePattern.test(path);
  }
});
