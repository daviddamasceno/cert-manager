import * as bcrypt from 'bcryptjs';
import config from '../config/env';
import logger from './logger';

type Argon2Module = {
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

let argon2: Argon2Module | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const candidate = require('argon2') as Argon2Module | undefined;
  if (candidate && typeof candidate.hash === 'function' && typeof candidate.verify === 'function') {
    argon2 = candidate;
  } else if (config.password.hasher === 'argon2id') {
    logger.warn('argon2 package is installed but does not expose hash/verify; falling back to bcrypt');
  }
} catch (error) {
  if (config.password.hasher === 'argon2id') {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      'argon2 package unavailable; falling back to bcrypt password hashing'
    );
  } else {
    logger.debug('argon2 package unavailable; bcrypt hashing remains active');
  }
}

const resolveArgon2 = (): Argon2Module | null =>
  config.password.hasher === 'argon2id' && argon2 ? argon2 : null;

const hashWithBcrypt = (secret: string): Promise<string> => bcrypt.hash(secret, config.password.bcryptCost);

const getArgon2Type = (module: Argon2Module): number => {
  if (typeof module.argon2id === 'number') {
    return module.argon2id;
  }
  // Fallback to the numeric value for argon2id as defined by the argon2 package.
  return 2;
};

export const hashSecret = async (secret: string): Promise<string> => {
  const argon2Module = resolveArgon2();
  if (argon2Module) {
    return argon2Module.hash(secret, {
      type: getArgon2Type(argon2Module),
      timeCost: config.password.argon2.timeCost,
      memoryCost: config.password.argon2.memoryCost,
      parallelism: config.password.argon2.parallelism
    });
  }
  return hashWithBcrypt(secret);
};

export const verifySecret = async (secret: string, hash: string): Promise<boolean> => {
  const argon2Module = resolveArgon2();
  if (argon2Module) {
    try {
      return argon2Module.verify(hash, secret);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error)
        },
        'argon2 password verification failed; treating as mismatch'
      );
      return false;
    }
  }
  return bcrypt.compare(secret, hash);
};
