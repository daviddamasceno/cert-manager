import assert from 'assert';
import { NotificationService } from '../src/services/notificationService';
import type { AuditRecordInput } from '../src/services/auditService';
import type { AlertModel, Certificate } from '../src/domain/types';

(async () => {
  const auditRecords: AuditRecordInput[] = [];
  const auditService = {
    record: async (input: AuditRecordInput) => {
      auditRecords.push(input);
    }
  } as unknown as import('../src/services/auditService').AuditService;

  const notifiedChannelIds: string[] = [];
  const channelService = {
    notifyChannel: async (channelId: string) => {
      notifiedChannelIds.push(channelId);
      return {
        channel: {
          id: channelId,
          name: `Channel ${channelId}`,
          type: 'slack_webhook',
          enabled: true,
          deleted: false,
          createdAt: '2024-06-01T00:00:00.000Z',
          updatedAt: '2024-06-01T00:00:00.000Z'
        },
        destination: `slack:${channelId}`
      };
    }
  } as unknown as import('../src/services/channelService').ChannelService;

  const service = new NotificationService(auditService, channelService);

  const certificate: Certificate = {
    id: 'cert-duplicate',
    name: 'Certificate with duplicate channels',
    ownerEmail: 'owner@example.com',
    issuedAt: '2024-01-01',
    expiresAt: '2024-12-31',
    status: 'active',
    alertModelId: 'alert-1',
    notes: undefined,
    channelIds: ['channel-1', 'channel-1', 'channel-2', 'channel-2']
  };

  const alertModel: AlertModel = {
    id: 'alert-1',
    name: 'Modelo de alerta',
    offsetDaysBefore: 3,
    offsetDaysAfter: undefined,
    repeatEveryDays: undefined,
    templateSubject: 'subject',
    templateBody: 'Olá, {{name}}',
    scheduleType: 'daily',
    scheduleTime: '08:00',
    enabled: true
  };

  const actor = {
    id: 'system',
    email: 'system@example.com',
    ip: 'scheduler',
    userAgent: 'tests'
  };

  await service.sendAlerts(certificate, alertModel, 3, actor);

  assert.deepStrictEqual(
    notifiedChannelIds,
    ['channel-1', 'channel-2'],
    'Should notify each unique channel only once'
  );

  const certificateAuditEntries = auditRecords.filter(
    (entry) => entry.entity === 'certificate' && entry.action === 'notification_sent'
  );
  assert.strictEqual(certificateAuditEntries.length, 1, 'Should record a single certificate audit log');
  assert.deepStrictEqual(
    certificateAuditEntries[0].diff.channelIds?.new,
    ['channel-1', 'channel-2'],
    'Audit diff should contain the unique channel identifiers'
  );

  console.log('notificationService.test.ts passed');
})();
