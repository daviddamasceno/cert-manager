import { api } from './apiClient';

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export const changePassword = async (payload: ChangePasswordPayload): Promise<void> => {
  await api.post('/auth/change-password', payload);
};
