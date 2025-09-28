process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD_HASH = '$2a$10$2RBGwcZmKLg7NLRuEdERxOTNLdbDGVOZADccqv2wBDwtYTu4TM.K2';
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
