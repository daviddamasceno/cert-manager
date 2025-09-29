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
  scheduleType?: 'hourly' | 'daily';
  scheduleTime?: string;
  enabled?: boolean;
}

const HH_MM_REGEX = /^(\d{2}):(\d{2})$/;

const normalizeScheduleType = (value?: string): 'hourly' | 'daily' => {
  if (value === 'hourly' || value === 'daily') {
    return value;
  }
  return 'hourly';
};

const normalizeScheduleTime = (type: 'hourly' | 'daily', value?: string): string | undefined => {
  if (type === 'hourly') {
    return undefined;
  }

  if (!value) {
    throw new Error('Informe o horário no formato HH:mm.');
  }

  const match = HH_MM_REGEX.exec(value.trim());
  if (!match) {
    throw new Error('O horário deve estar no formato HH:mm.');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('O horário deve ser válido entre 00:00 e 23:59.');
  }

  return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
};

const normalizeEnabled = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  return Boolean(value);
};

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
    const scheduleType = normalizeScheduleType(input.scheduleType);
    const scheduleTime = normalizeScheduleTime(scheduleType, input.scheduleTime);
    const enabled = normalizeEnabled(input.enabled, true);

    const model: AlertModel = {
      id: uuid(),
      ...input,
      scheduleType,
      scheduleTime,
      enabled
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
        templateBody: { new: model.templateBody },
        scheduleType: { new: model.scheduleType },
        scheduleTime: { new: model.scheduleTime },
        enabled: { new: model.enabled }
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

    const scheduleType =
      input.scheduleType !== undefined ? normalizeScheduleType(input.scheduleType) : current.scheduleType;
    const scheduleTime =
      input.scheduleTime !== undefined ? normalizeScheduleTime(scheduleType, input.scheduleTime) : current.scheduleTime;
    const enabled = normalizeEnabled(input.enabled, current.enabled);

    const payload: Partial<AlertModel> = {
      ...input,
      scheduleType,
      scheduleTime,
      enabled
    };

    const updated = await this.repository.updateAlertModel(id, payload);
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
    if (scheduleType !== current.scheduleType) {
      diff.scheduleType = { old: current.scheduleType, new: scheduleType };
    }
    if (scheduleTime !== current.scheduleTime) {
      diff.scheduleTime = { old: current.scheduleTime, new: scheduleTime };
    }
    if (enabled !== current.enabled) {
      diff.enabled = { old: current.enabled, new: enabled };
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
