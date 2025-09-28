import { api } from './apiClient';
import { AlertModel } from '../types';

export const listAlertModels = async (): Promise<AlertModel[]> => {
  const { data } = await api.get<AlertModel[]>('/alert-models');
  return data;
};

export const createAlertModel = async (payload: Partial<AlertModel>): Promise<AlertModel> => {
  const { data } = await api.post<AlertModel>('/alert-models', payload);
  return data;
};

export const updateAlertModel = async (id: string, payload: Partial<AlertModel>): Promise<AlertModel> => {
  const { data } = await api.put<AlertModel>(`/alert-models/${id}`, payload);
  return data;
};

export const deleteAlertModel = async (id: string): Promise<void> => {
  await api.delete(`/alert-models/${id}`);
};
