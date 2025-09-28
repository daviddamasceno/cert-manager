import crypto from 'crypto';
import config from '../config/env';

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const getKey = (): Buffer => {
  const base64 = config.encryptionKey;
  try {
    const decoded = Buffer.from(base64, 'base64');
    if (decoded.length === KEY_LENGTH) {
      return decoded;
    }
  } catch (error) {
    // ignore and fall back to hash below
  }
  return crypto.createHash('sha256').update(config.encryptionKey, 'utf8').digest();
};

const KEY = getKey();

export const encryptSecret = (plainText: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

export const decryptSecret = (cipherText: string): string => {
  const payload = Buffer.from(cipherText, 'base64');
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
};
