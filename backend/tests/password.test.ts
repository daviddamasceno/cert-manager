process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_ACCESS_TTL_MIN = process.env.JWT_ACCESS_TTL_MIN || '15';
process.env.JWT_REFRESH_TTL_DAYS = process.env.JWT_REFRESH_TTL_DAYS || '14';
process.env.PASSWORD_HASHER = 'argon2id';
process.env.PASSWORD_MIN_LENGTH = '10';
process.env.ARGON2_TIME = '2';
process.env.ARGON2_MEMORY = '4096';
process.env.ARGON2_THREADS = '2';
process.env.LOGIN_MAX_ATTEMPTS = '5';
process.env.LOGIN_LOCK_MINUTES = '15';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from('{}').toString('base64');
process.env.SHEETS_SPREADSHEET_ID = 'dummy-sheet';
process.env.ENCRYPTION_KEY = Buffer.from('test-encryption-key-32bytes!!').toString('base64');

import assert from 'assert';

(async () => {
  const { hashSecret, verifySecret } = await import('../src/utils/passwordHasher');

  const password = 'strong-password-value';
  const hash = await hashSecret(password);
  assert.notStrictEqual(hash, password, 'Hash should not match original password');

  const valid = await verifySecret(password, hash);
  assert.strictEqual(valid, true, 'Hash verification should succeed for matching password');

  const invalid = await verifySecret('wrong-password', hash);
  assert.strictEqual(invalid, false, 'Hash verification should fail for different password');

  console.log('password.test.ts passed');
})();
