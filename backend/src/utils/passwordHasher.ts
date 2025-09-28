import * as bcrypt from 'bcryptjs';
import config from '../config/env';
import logger from './logger';

type Argon2Options = {
  timeCost: number;
  memoryCost: number;
  parallelism: number;
};

type Argon2Implementation = {
  name: 'argon2' | '@node-rs/argon2';
  hash: (secret: string, options: Argon2Options) => Promise<string>;
  verify: (hash: string, secret: string) => Promise<boolean>;
};

type NativeArgon2Module = {
  hash: (
    secret: string,
    options?: {
      type?: number;
      timeCost?: number;
      memoryCost?: number;
      parallelism?: number;
    }
  ) => Promise<string>;
  verify: (hash: string, secret: string) => Promise<boolean>;
  argon2id?: number;
};

type NodeRsArgon2Module = {
  hash: (
    secret: string,
    options?: {
      algorithm?: number;
      timeCost?: number;
      memoryCost?: number;
      parallelism?: number;
    }
  ) => Promise<string>;
  verify: (hash: string, secret: string) => Promise<boolean>;
  Algorithm?: { Argon2id?: number };
};

let argon2: Argon2Implementation | null = null;

const tryLoadNativeArgon2 = (): Argon2Implementation | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const candidate = require('argon2') as NativeArgon2Module | undefined;
    if (candidate && typeof candidate.hash === 'function' && typeof candidate.verify === 'function') {
      const type = typeof candidate.argon2id === 'number' ? candidate.argon2id : 2;
      return {
        name: 'argon2',
        hash: (secret, options) =>
          candidate.hash(secret, {
            type,
            timeCost: options.timeCost,
            memoryCost: options.memoryCost,
            parallelism: options.parallelism
          }),
        verify: (hash, secret) => candidate.verify(hash, secret)
      };
    }
    if (config.password.hasher === 'argon2id') {
      logger.warn('argon2 package is installed but does not expose hash/verify; falling back to alternatives');
    }
  } catch (error) {
    if (config.password.hasher === 'argon2id') {
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error)
        },
        'Native argon2 module could not be loaded'
      );
    }
  }
  return null;
};

const tryLoadNodeRsArgon2 = (): Argon2Implementation | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const candidate = require('@node-rs/argon2') as NodeRsArgon2Module | undefined;
    if (candidate && typeof candidate.hash === 'function' && typeof candidate.verify === 'function') {
      const algorithm = candidate.Algorithm?.Argon2id ?? 2;
      logger.info({ implementation: '@node-rs/argon2' }, 'Using @node-rs/argon2 for password hashing');
      return {
        name: '@node-rs/argon2',
        hash: (secret, options) =>
          candidate.hash(secret, {
            algorithm,
            timeCost: options.timeCost,
            memoryCost: options.memoryCost,
            parallelism: options.parallelism
          }),
        verify: (hash, secret) => candidate.verify(hash, secret)
      };
    }
  } catch (error) {
    if (config.password.hasher === 'argon2id') {
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error)
        },
        '@node-rs/argon2 module could not be loaded'
      );
    }
  }
  return null;
};

if (config.password.hasher === 'argon2id') {
  argon2 = tryLoadNativeArgon2() ?? tryLoadNodeRsArgon2();
  if (!argon2) {
    logger.warn('argon2 support unavailable; falling back to bcrypt password hashing');
  }
}

const hashWithBcrypt = (secret: string): Promise<string> => bcrypt.hash(secret, config.password.bcryptCost);

const buildArgon2Options = (): Argon2Options => ({
  timeCost: config.password.argon2.timeCost,
  memoryCost: config.password.argon2.memoryCost,
  parallelism: config.password.argon2.parallelism
});

export const hashSecret = async (secret: string): Promise<string> => {
  if (argon2) {
    return argon2.hash(secret, buildArgon2Options());
  }
  return hashWithBcrypt(secret);
};

export const verifySecret = async (secret: string, hash: string): Promise<boolean> => {
  if (argon2) {
    try {
      return await argon2.verify(hash, secret);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          implementation: argon2.name
        },
        'argon2 password verification failed; treating as mismatch'
      );
      return false;
    }
  }
  return bcrypt.compare(secret, hash);
};
