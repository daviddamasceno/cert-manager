import assert from 'assert';
import { AlertModel } from '../src/domain/types';
import { AlertModelRepository, AuditLogRepository } from '../src/repositories/interfaces';
import { AuditLog } from '../src/domain/types';
import { AuditService } from '../src/services/auditService';
import { AlertModelService } from '../src/services/alertModelService';
import { SYSTEM_ACTOR } from '../src/services/types';

class InMemoryAuditRepository implements AuditLogRepository {
  public logs: AuditLog[] = [];

  async appendAuditLog(entry: AuditLog): Promise<void> {
    this.logs.push(entry);
  }

  async listAuditLogs(): Promise<AuditLog[]> {
    return this.logs;
  }
}

class InMemoryAlertModelRepository implements AlertModelRepository {
  private storage = new Map<string, AlertModel>();

  async listAlertModels(): Promise<AlertModel[]> {
    return [...this.storage.values()].map((model) => ({ ...model }));
  }

  async getAlertModel(id: string): Promise<AlertModel | null> {
    const model = this.storage.get(id);
    return model ? { ...model } : null;
  }

  async createAlertModel(model: AlertModel): Promise<void> {
    this.storage.set(model.id, { ...model });
  }

  async updateAlertModel(id: string, input: Partial<AlertModel>): Promise<AlertModel> {
    const current = this.storage.get(id);
    if (!current) {
      throw new Error('Alert model not found');
    }
    const updated: AlertModel = {
      ...current,
      ...input
    };
    this.storage.set(id, { ...updated });
    return { ...updated };
  }

  async deleteAlertModel(id: string): Promise<void> {
    this.storage.delete(id);
  }
}

(async () => {
  const auditRepository = new InMemoryAuditRepository();
  const alertModelRepository = new InMemoryAlertModelRepository();
  const auditService = new AuditService(auditRepository);
  const service = new AlertModelService(alertModelRepository, auditService);

  const created = await service.create(
    {
      name: 'Expirações 30 dias',
      offsetDaysBefore: 30,
      offsetDaysAfter: 5,
      repeatEveryDays: 7,
      templateSubject: 'Teste',
      templateBody: 'Body'
    },
    SYSTEM_ACTOR,
    { ip: '127.0.0.1', userAgent: 'jest' }
  );

  assert.ok(created.id, 'Model id should be defined');
  assert.strictEqual(auditRepository.logs.length, 1, 'Create should be audited');
  const createDiff = JSON.parse(auditRepository.logs[0].diffJson);
  assert.strictEqual(createDiff.name.new, 'Expirações 30 dias');
  assert.strictEqual(auditRepository.logs[0].ip, '127.0.0.1');

  const updated = await service.update(
    created.id,
    { repeatEveryDays: 10, name: 'Expirações 60 dias' },
    SYSTEM_ACTOR,
    { ip: '127.0.0.2', userAgent: 'jest' }
  );

  assert.strictEqual(updated.repeatEveryDays, 10);
  assert.strictEqual(auditRepository.logs.length, 2, 'Update should be audited');
  const updateDiff = JSON.parse(auditRepository.logs[1].diffJson);
  assert.strictEqual(updateDiff.repeatEveryDays.old, 7);
  assert.strictEqual(updateDiff.repeatEveryDays.new, 10);
  assert.strictEqual(auditRepository.logs[1].ip, '127.0.0.2');

  await service.delete(created.id, SYSTEM_ACTOR, { ip: '127.0.0.3', userAgent: 'jest' });
  assert.strictEqual(auditRepository.logs.length, 3, 'Delete should be audited');
  const deleteDiff = JSON.parse(auditRepository.logs[2].diffJson);
  assert.strictEqual(deleteDiff.name.old, 'Expirações 60 dias');
  assert.strictEqual(auditRepository.logs[2].ip, '127.0.0.3');

  const remaining = await alertModelRepository.getAlertModel(created.id);
  assert.strictEqual(remaining, null, 'Model should be deleted');

  console.log('alertModelService.test.ts passed');
})();
