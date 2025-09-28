import dotenv from 'dotenv';
import { assertValidHttpUrl } from '../utils/validators';

dotenv.config();

export interface AppConfig {
  port: number;
  env: string;
  appBaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  jwtCookieSameSite: 'lax' | 'strict';
  adminEmail: string;
  adminPasswordHash: string;
  googleServiceAccountJson: string;
  googleSheetsId: string;
  cacheTtlSeconds: number;
  timezone: string;
  encryptionKey: string;
  scheduler: {
    enabled: boolean;
    hourlyCron: string;
    dailyCron: string;
  };
  metrics: {
    enabled: boolean;
  };
  logLevel: string;
  rateLimits: {
    globalWindowMs: number;
    globalMax: number;
    testChannelWindowMs: number;
    testChannelMax: number;
    sensitiveRouteWindowMs: number;
    sensitiveRouteMax: number;
  };
}

const required = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const numeric = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const decodeBase64 = (value: string): string => {
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch (error) {
    throw new Error('Failed to decode GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 – ensure it is valid base64 JSON');
  }
};

const normalizeAppBaseUrl = (value: string): string => {
  assertValidHttpUrl(value, 'APP_BASE_URL');
  const parsed = new URL(value);
  return parsed.origin;
};

const parseSameSite = (value: string | undefined): 'lax' | 'strict' => {
  if (!value) {
    return 'lax';
  }
  const normalized = value.toLowerCase();
  if (normalized === 'lax' || normalized === 'strict') {
    return normalized;
  }
  throw new Error('JWT_COOKIE_SAMESITE must be either "lax" or "strict"');
};

const config: AppConfig = {
  port: numeric(process.env.PORT, 8080),
  env: process.env.NODE_ENV || 'development',
  appBaseUrl: normalizeAppBaseUrl(required(process.env.APP_BASE_URL, 'APP_BASE_URL')),
  jwtSecret: required(process.env.JWT_SECRET, 'JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '14d',
  jwtCookieSameSite: parseSameSite(process.env.JWT_COOKIE_SAMESITE),
  adminEmail: required(process.env.ADMIN_EMAIL, 'ADMIN_EMAIL'),
  adminPasswordHash: required(process.env.ADMIN_PASSWORD_HASH, 'ADMIN_PASSWORD_HASH'),
  googleServiceAccountJson: decodeBase64(
    required(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64')
  ),
  googleSheetsId: required(process.env.SHEETS_SPREADSHEET_ID, 'SHEETS_SPREADSHEET_ID'),
  cacheTtlSeconds: numeric(process.env.CACHE_TTL_SECONDS, 60),
  timezone: process.env.TZ || 'America/Fortaleza',
  encryptionKey: required(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY'),
  scheduler: {
    enabled: (process.env.SCHEDULER_ENABLED || 'false').toLowerCase() === 'true',
    hourlyCron: process.env.SCHEDULER_HOURLY_CRON || '0 * * * *',
    dailyCron: process.env.SCHEDULER_DAILY_CRON || '0 6 * * *'
  },
  metrics: {
    enabled: (process.env.METRICS_ENABLED || 'true').toLowerCase() === 'true'
  },
  logLevel: process.env.LOG_LEVEL || 'info',
  rateLimits: {
    globalWindowMs: numeric(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS, 60000),
    globalMax: numeric(process.env.RATE_LIMIT_GLOBAL_MAX, 300),
    testChannelWindowMs: numeric(process.env.RATE_LIMIT_TEST_WINDOW_MS, 60000),
    testChannelMax: numeric(process.env.RATE_LIMIT_TEST_MAX, 5),
    sensitiveRouteWindowMs: numeric(process.env.RATE_LIMIT_SENSITIVE_WINDOW_MS, 60000),
    sensitiveRouteMax: numeric(process.env.RATE_LIMIT_SENSITIVE_MAX, 10)
  }
};

export default config;
