import { v4 as uuid } from 'uuid';
import { AlertModel } from '../domain/types';
import { AlertModelRepository } from '../repositories/interfaces';
import { AuditService } from './auditService';
import { RequestMetadata, ServiceActor } from './types';

export interface AlertModelInput {
  name: string;
  offsetDaysBefore: number;
  offsetDaysAfter?: number;
  repeatEveryDays?: number;
  templateSubject: string;
  templateBody: string;
}

export class AlertModelService {
  constructor(
    private readonly repository: AlertModelRepository,
    private readonly auditService: AuditService
  ) {}

  async list(): Promise<AlertModel[]> {
    return this.repository.listAlertModels();
  }

  async get(id: string): Promise<AlertModel | null> {
    return this.repository.getAlertModel(id);
  }

  async create(
    input: AlertModelInput,
    actor: ServiceActor,
    metadata: RequestMetadata = {}
  ): Promise<AlertModel> {
    const model: AlertModel = {
      id: uuid(),
      ...input
    };

    await this.repository.createAlertModel(model);
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'alert_model',
      entityId: model.id,
      action: 'create',
      diff: this.buildCreateDiff(model),
      ip: metadata.ip,
      userAgent: metadata.userAgent
    });
    return model;
  }

  async update(
    id: string,
    input: Partial<AlertModelInput>,
    actor: ServiceActor,
    metadata: RequestMetadata = {}
  ): Promise<AlertModel> {
    const current = await this.repository.getAlertModel(id);
    if (!current) {
      throw new Error('Alert model not found');
    }

    const updated = await this.repository.updateAlertModel(id, input);
    const diff = this.buildDiff(current, updated);
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'alert_model',
      entityId: id,
      action: 'update',
      diff,
      ip: metadata.ip,
      userAgent: metadata.userAgent
    });
    return updated;
  }

  async delete(id: string, actor: ServiceActor, metadata: RequestMetadata = {}): Promise<void> {
    const existing = await this.repository.getAlertModel(id);
    if (!existing) {
      return;
    }
    await this.repository.deleteAlertModel(id);
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'alert_model',
      entityId: id,
      action: 'delete',
      diff: this.buildDeleteDiff(existing),
      ip: metadata.ip,
      userAgent: metadata.userAgent
    });
  }

  private buildCreateDiff(model: AlertModel): Record<string, { old?: unknown; new?: unknown }> {
    const diff: Record<string, { old?: unknown; new?: unknown }> = {
      name: { new: model.name },
      offsetDaysBefore: { new: model.offsetDaysBefore },
      templateSubject: { new: model.templateSubject },
      templateBody: { new: model.templateBody }
    };
    if (model.offsetDaysAfter !== undefined) {
      diff.offsetDaysAfter = { new: model.offsetDaysAfter };
    }
    if (model.repeatEveryDays !== undefined) {
      diff.repeatEveryDays = { new: model.repeatEveryDays };
    }
    return diff;
  }

  private buildDeleteDiff(model: AlertModel): Record<string, { old?: unknown; new?: unknown }> {
    const diff: Record<string, { old?: unknown; new?: unknown }> = {
      name: { old: model.name },
      offsetDaysBefore: { old: model.offsetDaysBefore },
      templateSubject: { old: model.templateSubject }
    };
    if (model.offsetDaysAfter !== undefined) {
      diff.offsetDaysAfter = { old: model.offsetDaysAfter };
    }
    if (model.repeatEveryDays !== undefined) {
      diff.repeatEveryDays = { old: model.repeatEveryDays };
    }
    diff.templateBody = { old: model.templateBody };
    return diff;
  }

  private buildDiff(
    before: AlertModel,
    after: AlertModel
  ): Record<string, { old?: unknown; new?: unknown }> {
    const diff: Record<string, { old?: unknown; new?: unknown }> = {};
    if (before.name !== after.name) {
      diff.name = { old: before.name, new: after.name };
    }
    if (before.offsetDaysBefore !== after.offsetDaysBefore) {
      diff.offsetDaysBefore = {
        old: before.offsetDaysBefore,
        new: after.offsetDaysBefore
      };
    }
    if (before.offsetDaysAfter !== after.offsetDaysAfter) {
      diff.offsetDaysAfter = {
        old: before.offsetDaysAfter,
        new: after.offsetDaysAfter
      };
    }
    if (before.repeatEveryDays !== after.repeatEveryDays) {
      diff.repeatEveryDays = {
        old: before.repeatEveryDays,
        new: after.repeatEveryDays
      };
    }
    if (before.templateSubject !== after.templateSubject) {
      diff.templateSubject = {
        old: before.templateSubject,
        new: after.templateSubject
      };
    }
    if (before.templateBody !== after.templateBody) {
      diff.templateBody = {
        old: before.templateBody,
        new: after.templateBody
      };
    }
    return diff;
  }
}
