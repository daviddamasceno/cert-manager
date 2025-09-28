import { api } from './apiClient';
import { AuditLog } from '../types';

export const listAuditLogs = async (limit = 100): Promise<AuditLog[]> => {
  const { data } = await api.get<AuditLog[]>('/audit-logs', { params: { limit } });
  return data;
};
