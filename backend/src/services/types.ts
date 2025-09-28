import { UserRole } from '../domain/types';

export interface ServiceActor {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
}

export interface RequestMetadata {
  ip?: string;
  userAgent?: string;
}

export const SYSTEM_ACTOR: ServiceActor = {
  id: 'system',
  email: 'system@local',
  role: 'admin',
  name: 'System'
};
