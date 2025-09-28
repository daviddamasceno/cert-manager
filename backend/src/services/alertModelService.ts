import { v4 as uuid } from 'uuid';
import { AlertModel, AuditActor } from '../domain/types';
import { AlertModelRepository } from '../repositories/interfaces';
import { AuditService } from './auditService';

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

  async create(input: AlertModelInput, actor: AuditActor): Promise<AlertModel> {
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
      diff: {
        name: { new: model.name },
        offsetDaysBefore: { new: model.offsetDaysBefore },
        offsetDaysAfter: { new: model.offsetDaysAfter },
        repeatEveryDays: { new: model.repeatEveryDays },
        templateSubject: { new: model.templateSubject },
        templateBody: { new: model.templateBody }
      },
      ip: actor.ip,
      userAgent: actor.userAgent
    });
    return model;
  }

  async update(id: string, input: Partial<AlertModelInput>, actor: AuditActor): Promise<AlertModel> {
    const current = await this.repository.getAlertModel(id);
    if (!current) {
      throw new Error('Modelo de alerta não encontrado.');
    }

    const updated = await this.repository.updateAlertModel(id, input);
    const diff: Record<string, { old?: unknown; new?: unknown }> = {};

    if (input.name !== undefined && input.name !== current.name) {
      diff.name = { old: current.name, new: updated.name };
    }
    if (
      input.offsetDaysBefore !== undefined &&
      input.offsetDaysBefore !== current.offsetDaysBefore
    ) {
      diff.offsetDaysBefore = { old: current.offsetDaysBefore, new: updated.offsetDaysBefore };
    }
    if (input.offsetDaysAfter !== undefined && input.offsetDaysAfter !== current.offsetDaysAfter) {
      diff.offsetDaysAfter = { old: current.offsetDaysAfter, new: updated.offsetDaysAfter };
    }
    if (
      input.repeatEveryDays !== undefined &&
      input.repeatEveryDays !== current.repeatEveryDays
    ) {
      diff.repeatEveryDays = { old: current.repeatEveryDays, new: updated.repeatEveryDays };
    }
    if (input.templateSubject !== undefined && input.templateSubject !== current.templateSubject) {
      diff.templateSubject = { old: current.templateSubject, new: updated.templateSubject };
    }
    if (input.templateBody !== undefined && input.templateBody !== current.templateBody) {
      diff.templateBody = { old: current.templateBody, new: updated.templateBody };
    }

    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'alert_model',
      entityId: id,
      action: 'update',
      diff,
      ip: actor.ip,
      userAgent: actor.userAgent
    });

    return updated;
  }

  async delete(id: string, actor: AuditActor): Promise<void> {
    const existing = await this.repository.getAlertModel(id);
    await this.repository.deleteAlertModel(id);

    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'alert_model',
      entityId: id,
      action: 'delete',
      diff: existing
        ? {
            name: { old: existing.name },
            templateSubject: { old: existing.templateSubject }
          }
        : {},
      ip: actor.ip,
      userAgent: actor.userAgent
    });
  }
}
