import { api } from './apiClient';
import { ChannelSummary } from '../types';

export interface ChannelPayload {
  name?: string;
  type?: string;
  enabled?: boolean;
  params?: Record<string, string>;
  secrets?: Record<string, string | null>;
}

export const listChannels = async (): Promise<ChannelSummary[]> => {
  const { data } = await api.get<ChannelSummary[]>('/channels');
  return data;
};

export const createChannel = async (payload: ChannelPayload): Promise<ChannelSummary> => {
  const { data } = await api.post<ChannelSummary>('/channels', payload);
  return data;
};

export const updateChannel = async (id: string, payload: ChannelPayload): Promise<ChannelSummary> => {
  const { data } = await api.put<ChannelSummary>(`/channels/${id}`, payload);
  return data;
};

export const disableChannel = async (id: string): Promise<void> => {
  await api.delete(`/channels/${id}`);
};

export interface ChannelTestResult {
  success: boolean;
  error?: string;
}

export const testChannel = async (id: string, payload: Record<string, unknown> = {}): Promise<ChannelTestResult> => {
  const { data } = await api.post<ChannelTestResult>(`/channels/${id}/test`, payload);
  return data;
};
