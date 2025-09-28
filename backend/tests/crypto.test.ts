process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_ACCESS_TTL_MIN = '15';
process.env.JWT_REFRESH_TTL_DAYS = '14';
process.env.PASSWORD_HASHER = 'argon2id';
process.env.PASSWORD_MIN_LENGTH = '10';
process.env.ARGON2_TIME = '2';
process.env.ARGON2_MEMORY = '4096';
process.env.ARGON2_THREADS = '2';
process.env.LOGIN_MAX_ATTEMPTS = '5';
process.env.LOGIN_LOCK_MINUTES = '15';
process.env.SEED_ADMIN_EMAIL = 'admin@example.com';
process.env.SEED_ADMIN_TEMP_PASSWORD = 'temporary';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from('{}').toString('base64');
process.env.SHEETS_SPREADSHEET_ID = 'dummy-sheet';
process.env.ENCRYPTION_KEY = Buffer.from('test-encryption-key-32bytes!!').toString('base64');
process.env.RATE_LIMIT_TEST_WINDOW_MS = '60000';
process.env.RATE_LIMIT_TEST_MAX = '5';

import assert from 'assert';

(async () => {
  const { encryptSecret, decryptSecret } = await import('../src/utils/crypto');

  const sample = 'super-secret-value';
  const cipher = encryptSecret(sample);
  assert.notStrictEqual(cipher, sample, 'Ciphertext should differ from plaintext');
  const restored = decryptSecret(cipher);
  assert.strictEqual(restored, sample, 'Decrypted value should match original');

  console.log('crypto.test.ts passed');
})();
