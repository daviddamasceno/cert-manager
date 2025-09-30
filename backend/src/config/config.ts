import dotenv from 'dotenv';
import { assertValidHttpUrl } from '../utils/validators';

dotenv.config();

export const OPTIONAL_DEFAULTS = Object.freeze({
  port: 8080,
  nodeEnv: 'development',
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '14d',
  jwtCookieSameSite: 'lax' as const,
  cacheTtlSeconds: 60,
  timezone: 'America/Fortaleza',
  schedulerEnabled: false,
  schedulerIntervalMinutes: 1,
  metricsEnabled: true,
  logLevel: 'info',
  rateLimitGlobalWindowMs: 60_000,
  rateLimitGlobalMax: 300,
  rateLimitTestWindowMs: 60_000,
  rateLimitTestMax: 5,
  rateLimitSensitiveWindowMs: 60_000,
  rateLimitSensitiveMax: 10
});

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
    intervalMinutes: number;
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

const normalizeAppBaseUrl = (value: string, sourceName: string): string => {
  assertValidHttpUrl(value, sourceName);
  const parsed = new URL(value);
  return parsed.origin;
};

const resolveAppBaseUrl = (): string => {
  const rawValue = required(process.env.APP_BASE_URL, 'APP_BASE_URL');
  return normalizeAppBaseUrl(rawValue, 'APP_BASE_URL');
};

const parseSameSite = (value: string | undefined): 'lax' | 'strict' => {
  if (!value) {
    return OPTIONAL_DEFAULTS.jwtCookieSameSite;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'lax' || normalized === 'strict') {
    return normalized;
  }
  throw new Error('JWT_COOKIE_SAMESITE must be either "lax" or "strict"');
};

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  const normalized = (value ?? String(fallback)).toLowerCase();
  return normalized === 'true';
};

const config: AppConfig = {
  port: numeric(process.env.PORT, OPTIONAL_DEFAULTS.port),
  env: process.env.NODE_ENV || OPTIONAL_DEFAULTS.nodeEnv,
  appBaseUrl: resolveAppBaseUrl(),
  jwtSecret: required(process.env.JWT_SECRET, 'JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || OPTIONAL_DEFAULTS.jwtExpiresIn,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || OPTIONAL_DEFAULTS.jwtRefreshExpiresIn,
  jwtCookieSameSite: parseSameSite(process.env.JWT_COOKIE_SAMESITE),
  adminEmail: required(process.env.ADMIN_EMAIL, 'ADMIN_EMAIL'),
  adminPasswordHash: required(process.env.ADMIN_PASSWORD_HASH, 'ADMIN_PASSWORD_HASH'),
  googleServiceAccountJson: decodeBase64(
    required(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64')
  ),
  googleSheetsId: required(process.env.SHEETS_SPREADSHEET_ID, 'SHEETS_SPREADSHEET_ID'),
  cacheTtlSeconds: numeric(process.env.CACHE_TTL_SECONDS, OPTIONAL_DEFAULTS.cacheTtlSeconds),
  timezone: process.env.TZ || OPTIONAL_DEFAULTS.timezone,
  encryptionKey: required(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY'),
  scheduler: {
    enabled: toBoolean(process.env.SCHEDULER_ENABLED, OPTIONAL_DEFAULTS.schedulerEnabled),
    intervalMinutes: Math.max(
      1,
      numeric(process.env.SCHEDULER_INTERVAL_MINUTES, OPTIONAL_DEFAULTS.schedulerIntervalMinutes)
    )
  },
  metrics: {
    enabled: toBoolean(process.env.METRICS_ENABLED, OPTIONAL_DEFAULTS.metricsEnabled)
  },
  logLevel: process.env.LOG_LEVEL || OPTIONAL_DEFAULTS.logLevel,
  rateLimits: {
    globalWindowMs: numeric(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS, OPTIONAL_DEFAULTS.rateLimitGlobalWindowMs),
    globalMax: numeric(process.env.RATE_LIMIT_GLOBAL_MAX, OPTIONAL_DEFAULTS.rateLimitGlobalMax),
    testChannelWindowMs: numeric(process.env.RATE_LIMIT_TEST_WINDOW_MS, OPTIONAL_DEFAULTS.rateLimitTestWindowMs),
    testChannelMax: numeric(process.env.RATE_LIMIT_TEST_MAX, OPTIONAL_DEFAULTS.rateLimitTestMax),
    sensitiveRouteWindowMs: numeric(
      process.env.RATE_LIMIT_SENSITIVE_WINDOW_MS,
      OPTIONAL_DEFAULTS.rateLimitSensitiveWindowMs
    ),
    sensitiveRouteMax: numeric(process.env.RATE_LIMIT_SENSITIVE_MAX, OPTIONAL_DEFAULTS.rateLimitSensitiveMax)
  }
};

export default config;
