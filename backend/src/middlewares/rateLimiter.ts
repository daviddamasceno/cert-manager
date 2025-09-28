import rateLimit from 'express-rate-limit';
import config from '../config/env';

const sensitiveRoutePattern = /\/(test|send)(?:[/?]|$)/;
const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AUTH_RATE_LIMIT_MAX = 5;

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

export const authRateLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
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
