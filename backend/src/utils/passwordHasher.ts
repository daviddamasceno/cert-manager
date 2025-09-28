import argon2, { argon2id } from 'argon2';
import bcrypt from 'bcryptjs';
import config from '../config/env';

export const hashSecret = async (secret: string): Promise<string> => {
  if (config.password.hasher === 'argon2id') {
    return argon2.hash(secret, {
      type: argon2id,
      timeCost: config.password.argon2.timeCost,
      memoryCost: config.password.argon2.memoryCost,
      parallelism: config.password.argon2.parallelism
    });
  }
  return bcrypt.hash(secret, config.password.bcryptCost);
};

export const verifySecret = async (secret: string, hash: string): Promise<boolean> => {
  if (config.password.hasher === 'argon2id') {
    return argon2.verify(hash, secret);
  }
  return bcrypt.compare(secret, hash);
};
