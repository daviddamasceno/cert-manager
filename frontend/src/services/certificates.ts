import { api } from './apiClient';
import { Certificate } from '../types';

export const listCertificates = async (): Promise<Certificate[]> => {
  const { data } = await api.get<Certificate[]>('/certificates');
  return data;
};

export const createCertificate = async (payload: Partial<Certificate>): Promise<Certificate> => {
  const body = { ...payload, channelIds: payload.channelIds ?? [] };
  const { data } = await api.post<Certificate>('/certificates', body);
  return data;
};

export const updateCertificate = async (id: string, payload: Partial<Certificate>): Promise<Certificate> => {
  const body = { ...payload, channelIds: payload.channelIds ?? [] };
  const { data } = await api.put<Certificate>(`/certificates/${id}`, body);
  return data;
};

export const deleteCertificate = async (id: string): Promise<void> => {
  await api.delete(`/certificates/${id}`);
};

export const sendTestNotification = async (id: string): Promise<void> => {
  await api.post(`/certificates/${id}/test-notification`, {});
};
