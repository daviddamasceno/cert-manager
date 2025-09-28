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
  status?: Exclude<UserStatus, 'inactive'>;
}

export interface CreateUserResponse {
  user: User;
  temporaryPassword: string;
}

export interface ResetPasswordResponse {
  temporaryPassword: string;
}

export const listUsers = async (): Promise<User[]> => {
  const { data } = await api.get<User[]>('/users');
  return data;
};

export const createUser = async (payload: CreateUserPayload): Promise<CreateUserResponse> => {
  const { data } = await api.post<CreateUserResponse>('/users', payload);
  return data;
};

export const updateUser = async (id: string, payload: UpdateUserPayload): Promise<User> => {
  const { data } = await api.put<User>(`/users/${id}`, payload);
  return data;
};

export const disableUser = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}`);
};

export const resetUserPassword = async (id: string): Promise<ResetPasswordResponse> => {
  const { data } = await api.post<ResetPasswordResponse>(`/users/${id}/reset-password`);
  return data;
};
