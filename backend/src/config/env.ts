import dotenv from 'dotenv';
import { assertValidHttpUrl } from '../utils/validators';

dotenv.config();

export type SupportedPasswordHasher = 'argon2id' | 'bcrypt';

export interface AppConfig {
  port: number;
  env: string;
  appBaseUrl: string;
  jwt: {
    secret: string;
    algorithm: 'HS256';
    accessTtlMinutes: number;
    refreshTtlDays: number;
  };
  password: {
    hasher: SupportedPasswordHasher;
    minLength: number;
    bcryptCost: number;
    argon2: {
      timeCost: number;
      memoryCost: number;
      parallelism: number;
    };
  };
  auth: {
    loginMaxAttempts: number;
    loginLockMinutes: number;
  };
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

const normalizePasswordHasher = (value: string | undefined): SupportedPasswordHasher => {
  const normalized = (value || 'argon2id').toLowerCase();
  if (normalized !== 'argon2id' && normalized !== 'bcrypt') {
    throw new Error(`Unsupported PASSWORD_HASHER value: ${value}`);
  }
  return normalized as SupportedPasswordHasher;
};

const config: AppConfig = {
  port: numeric(process.env.PORT, 8080),
  env: process.env.NODE_ENV || 'development',
  appBaseUrl: normalizeAppBaseUrl(required(process.env.APP_BASE_URL, 'APP_BASE_URL')),
  jwt: {
    secret: required(process.env.JWT_SECRET, 'JWT_SECRET'),
    algorithm: 'HS256',
    accessTtlMinutes: numeric(process.env.JWT_ACCESS_TTL_MIN, 15),
    refreshTtlDays: numeric(process.env.JWT_REFRESH_TTL_DAYS, 14)
  },
  password: {
    hasher: normalizePasswordHasher(process.env.PASSWORD_HASHER),
    minLength: numeric(process.env.PASSWORD_MIN_LENGTH, 10),
    bcryptCost: numeric(process.env.BCRYPT_COST, 12),
    argon2: {
      timeCost: numeric(process.env.ARGON2_TIME, 3),
      memoryCost: numeric(process.env.ARGON2_MEMORY, 65536),
      parallelism: numeric(process.env.ARGON2_THREADS, 2)
    }
  },
  auth: {
    loginMaxAttempts: numeric(process.env.LOGIN_MAX_ATTEMPTS, 5),
    loginLockMinutes: numeric(process.env.LOGIN_LOCK_MINUTES, 15)
  },
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
    testChannelWindowMs: numeric(process.env.RATE_LIMIT_TEST_WINDOW_MS, 60000),
    testChannelMax: numeric(process.env.RATE_LIMIT_TEST_MAX, 5),
    sensitiveRouteWindowMs: numeric(process.env.RATE_LIMIT_SENSITIVE_WINDOW_MS, 60000),
    sensitiveRouteMax: numeric(process.env.RATE_LIMIT_SENSITIVE_MAX, 10)
  }
};

export default config;
