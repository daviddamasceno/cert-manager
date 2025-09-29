process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH || '$2a$10$2RBGwcZmKLg7NLRuEdERxOTNLdbDGVOZADccqv2wBDwtYTu4TM.K2';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 =
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || Buffer.from('{}').toString('base64');
process.env.SHEETS_SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID || 'dummy-sheet';
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || Buffer.from('test-encryption-key-32bytes!!').toString('base64');
process.env.RATE_LIMIT_TEST_WINDOW_MS = process.env.RATE_LIMIT_TEST_WINDOW_MS || '60000';
process.env.RATE_LIMIT_TEST_MAX = process.env.RATE_LIMIT_TEST_MAX || '5';
process.env.TZ = process.env.TZ || 'America/Fortaleza';

import assert from 'assert';
import { DateTime } from 'luxon';
import { AlertSchedulerJob } from '../src/jobs/alertScheduler';
import { AlertModel, Certificate } from '../src/domain/types';

(async () => {
  const timeModule = await import('../src/utils/time');
  const originalNow = timeModule.now;

  const zone = process.env.TZ || 'America/Fortaleza';

  const certificates: Certificate[] = [
    {
      id: 'cert-1',
      name: 'Certificado Principal',
      ownerEmail: 'owner@example.com',
      issuedAt: '2024-06-01',
      expiresAt: '2024-07-01',
      status: 'active',
      alertModelId: 'model-1',
      notes: undefined,
      channelIds: ['channel-1']
    }
  ];

  const alertModels: AlertModel[] = [
    {
      id: 'model-1',
      name: 'Modelo diário',
      offsetDaysBefore: 0,
      offsetDaysAfter: undefined,
      repeatEveryDays: undefined,
      templateSubject: 'subject',
      templateBody: 'body',
      scheduleType: 'daily',
      scheduleTime: '23:41',
      enabled: true
    }
  ];

  let sentCount = 0;

  const certificateService = {
    list: async () => certificates
  } as unknown as import('../src/services/certificateService').CertificateService;

  const alertModelService = {
    list: async () => alertModels
  } as unknown as import('../src/services/alertModelService').AlertModelService;

  const notificationService = {
    sendAlerts: async () => {
      sentCount += 1;
    }
  } as unknown as import('../src/services/notificationService').NotificationService;

  const job = new AlertSchedulerJob(certificateService, alertModelService, notificationService);

  const firstTick = DateTime.fromISO('2024-07-01T23:41:15', { zone });
  (timeModule as unknown as { now: () => DateTime }).now = () => firstTick;

  await job.run();
  assert.strictEqual(sentCount, 1, 'Should send notification when daily schedule matches');

  await job.run();
  assert.strictEqual(sentCount, 1, 'Should not send twice during the same scheduled minute');

  certificates[0].expiresAt = '2024-07-02';
  const secondTick = firstTick.plus({ days: 1 });
  (timeModule as unknown as { now: () => DateTime }).now = () => secondTick;

  await job.run();
  assert.strictEqual(sentCount, 2, 'Should send again on the next day at the configured time');

  alertModels[0] = {
    ...alertModels[0],
    scheduleType: 'hourly',
    scheduleTime: null
  };

  const hourlyTick = DateTime.fromISO('2024-07-02T12:00:05', { zone });
  (timeModule as unknown as { now: () => DateTime }).now = () => hourlyTick;

  await job.run();
  assert.strictEqual(sentCount, 3, 'Should send at the start of the hour for hourly schedules');

  const repeatedHourTick = DateTime.fromISO('2024-07-02T12:00:45', { zone });
  (timeModule as unknown as { now: () => DateTime }).now = () => repeatedHourTick;

  await job.run();
  assert.strictEqual(sentCount, 3, 'Should not send twice within the same hour even if multiple ticks land on minute 0');

  const midHourTick = hourlyTick.plus({ minutes: 30 });
  (timeModule as unknown as { now: () => DateTime }).now = () => midHourTick;

  await job.run();
  assert.strictEqual(sentCount, 3, 'Should not re-send within the same hour for hourly schedules');

  (timeModule as unknown as { now: () => DateTime }).now = originalNow;

  console.log('alertScheduler.test.ts passed');
})();
