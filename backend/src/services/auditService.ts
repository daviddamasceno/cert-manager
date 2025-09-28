import { AuditAction, AuditLog } from '../domain/types';
import { AuditLogRepository } from '../repositories/interfaces';

export interface AuditRecordInput {
  actorUserId: string;
  actorEmail: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  diff: Record<string, { old?: unknown; new?: unknown }>;
  note?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditQuery {
  limit?: number;
  entity?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  query?: string;
}

export class AuditService {
  constructor(private readonly repository: AuditLogRepository) {}

  async record(input: AuditRecordInput): Promise<void> {
    const entry: AuditLog = {
      timestamp: new Date().toISOString(),
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      diffJson: JSON.stringify(input.diff ?? {}),
      ip: input.ip,
      userAgent: input.userAgent,
      note: input.note
    };
    await this.repository.appendAuditLog(entry);
  }

  async list(query: AuditQuery): Promise<AuditLog[]> {
    return this.repository.listAuditLogs(query);
  }
}
