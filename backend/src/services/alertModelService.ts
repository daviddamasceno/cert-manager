import { v4 as uuid } from 'uuid';
import { AlertModel, AuditActor } from '../domain/types';
import { AlertModelRepository } from '../repositories/interfaces';
import { AuditService } from './auditService';
import { sanitizeString } from '../utils/validators';

export interface AlertModelInput {
  name: string;
  offsetDaysBefore: number;
  offsetDaysAfter?: number;
  repeatEveryDays?: number;
  templateSubject: string;
  templateBody: string;
  scheduleType?: 'hourly' | 'daily';
  scheduleTime?: string | null;
  enabled?: boolean;
}

export class AlertModelService {
  constructor(
    private readonly repository: AlertModelRepository,
    private readonly auditService: AuditService
  ) {}

  private parseScheduleType(value: unknown, fallback: 'hourly' | 'daily' = 'hourly'): 'hourly' | 'daily' {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    const normalized = sanitizeString(typeof value === 'string' ? value : String(value)).toLowerCase();
    if (normalized === 'hourly' || normalized === 'daily') {
      return normalized;
    }

    throw new Error('schedule_type deve ser "hourly" ou "daily".');
  }

  private parseScheduleTime(
    scheduleType: 'hourly' | 'daily',
    value: unknown,
    { optional }: { optional?: boolean } = {}
  ): string | null {
    if (scheduleType === 'hourly') {
      return null;
    }

    if (value === undefined || value === null || value === '') {
      if (optional) {
        return null;
      }
      throw new Error('schedule_time é obrigatório quando o agendamento diário está habilitado.');
    }

    const normalized = sanitizeString(typeof value === 'string' ? value : String(value));
    const matches = /^([01]\d|2[0-3]):([0-5]\d)$/.test(normalized);
    if (!matches) {
      throw new Error('schedule_time deve estar no formato HH:mm (00:00 - 23:59).');
    }

    return normalized;
  }

  private parseEnabled(value: unknown, fallback = true): boolean {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = sanitizeString(String(value)).toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }

    return fallback;
  }

  async list(): Promise<AlertModel[]> {
    return this.repository.listAlertModels();
  }

  async get(id: string): Promise<AlertModel | null> {
    return this.repository.getAlertModel(id);
  }

  async create(input: AlertModelInput, actor: AuditActor): Promise<AlertModel> {
    const scheduleType = this.parseScheduleType(input.scheduleType, 'hourly');
    const scheduleTime = this.parseScheduleTime(scheduleType, input.scheduleTime, { optional: false });
    const enabled = this.parseEnabled(input.enabled, true);

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
      input.scheduleType !== undefined ? this.parseScheduleType(input.scheduleType, current.scheduleType) : undefined;
    const effectiveScheduleType = scheduleType ?? current.scheduleType;

    let scheduleTime: string | null | undefined;
    if (input.scheduleType !== undefined || input.scheduleTime !== undefined) {
      const rawTime = input.scheduleTime !== undefined ? input.scheduleTime : current.scheduleTime;
      scheduleTime = this.parseScheduleTime(effectiveScheduleType, rawTime, {
        optional: rawTime === undefined || rawTime === null || rawTime === ''
      });
      if (effectiveScheduleType === 'daily' && !scheduleTime) {
        throw new Error('Defina um horário válido para o agendamento diário.');
      }
    }

    const enabled = input.enabled !== undefined ? this.parseEnabled(input.enabled, current.enabled) : undefined;

    const updated = await this.repository.updateAlertModel(id, {
      ...input,
      scheduleType,
      scheduleTime,
      enabled
    });
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
    if (scheduleType !== undefined && scheduleType !== current.scheduleType) {
      diff.scheduleType = { old: current.scheduleType, new: updated.scheduleType };
    }
    if (scheduleTime !== undefined && scheduleTime !== current.scheduleTime) {
      diff.scheduleTime = { old: current.scheduleTime, new: updated.scheduleTime };
    }
    if (enabled !== undefined && enabled !== current.enabled) {
      diff.enabled = { old: current.enabled, new: updated.enabled };
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
