import { api } from './apiClient';
import { CreateUserRequest, ManagedUser, UpdateUserRequest, UserRole, UserStatus } from '../types';

export interface UserFilters {
  role?: UserRole;
  status?: UserStatus;
  query?: string;
}

export interface CreateUserResponse {
  user: ManagedUser;
  temporaryPassword: string;
}

export interface UpdateUserResponse {
  user: ManagedUser;
  temporaryPassword?: string;
}

export const listUsers = async (filters: UserFilters = {}): Promise<ManagedUser[]> => {
  const params = new URLSearchParams();
  if (filters.role) {
    params.append('role', filters.role);
  }
  if (filters.status) {
    params.append('status', filters.status);
  }
  if (filters.query) {
    params.append('q', filters.query);
  }
  const query = params.toString();
  const { data } = await api.get<ManagedUser[]>(`/users${query ? `?${query}` : ''}`);
  return data;
};

export const createUser = async (payload: CreateUserRequest): Promise<CreateUserResponse> => {
  const { data } = await api.post<CreateUserResponse>('/users', payload);
  return data;
};

export const updateUser = async (id: string, payload: UpdateUserRequest): Promise<UpdateUserResponse> => {
  const { data } = await api.put<UpdateUserResponse>(`/users/${id}`, payload);
  return data;
};

export const disableUser = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}`);
};
