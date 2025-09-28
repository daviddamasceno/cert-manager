import { api } from './apiClient';
import { User, UserRole, UserStatus } from '../types';

export interface CreateUserPayload {
  email: string;
  name: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  name?: string;
  role?: UserRole;
  status?: UserStatus;
}

export const listUsers = async (): Promise<User[]> => {
  const { data } = await api.get<User[]>('/users');
  return data;
};

export const createUser = async (
  payload: CreateUserPayload
): Promise<{ user: User; temporaryPassword: string }> => {
  const { data } = await api.post<{ user: User; temporaryPassword: string }>('/users', payload);
  return data;
};

export const updateUser = async (id: string, payload: UpdateUserPayload): Promise<User> => {
  const { data } = await api.put<User>(`/users/${id}`, payload);
  return data;
};

export const disableUser = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}`);
};

export const activateUser = async (id: string): Promise<User> => {
  return updateUser(id, { status: 'active' });
};

export const resetUserPassword = async (
  id: string
): Promise<{ temporaryPassword: string }> => {
  const { data } = await api.post<{ temporaryPassword: string }>(`/users/${id}/reset-password`);
  return data;
};
