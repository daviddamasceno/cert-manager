import { api } from './apiClient';
import { AuditLog } from '../types';

export interface AuditLogFilters {
  limit?: number;
  actor?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
  query?: string;
}

export const listAuditLogs = async (filters: AuditLogFilters = {}): Promise<AuditLog[]> => {
  const params: Record<string, string | number> = {};

  if (filters.limit !== undefined) {
    params.limit = filters.limit;
  }
  if (filters.actor) {
    params.actor = filters.actor;
  }
  if (filters.entity) {
    params.entity = filters.entity;
  }
  if (filters.entityId) {
    params.entity_id = filters.entityId;
  }
  if (filters.action) {
    params.action = filters.action;
  }
  if (filters.from) {
    params.from = filters.from;
  }
  if (filters.to) {
    params.to = filters.to;
  }
  if (filters.query) {
    params.q = filters.query;
  }

  const { data } = await api.get<AuditLog[]>('/audit-logs', { params });
  return data;
};
