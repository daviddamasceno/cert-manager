import { api } from './apiClient';
import { SettingsResponse } from '../types';

export const fetchSettings = async (): Promise<SettingsResponse> => {
  const { data } = await api.get<SettingsResponse>('/settings');
  return data;
};
