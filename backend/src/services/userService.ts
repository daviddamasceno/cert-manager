import crypto from 'crypto';
import { DateTime } from 'luxon';
import { AuditService } from './auditService';
import { UserRepository } from '../repositories/interfaces';
import { RefreshTokenRecord, User, UserCredentials, UserRole, UserStatus } from '../domain/types';
import { hashSecret, verifySecret } from '../utils/passwordHasher';
import config from '../config/env';
import { ServiceActor, RequestMetadata } from './types';

export interface UserFilters {
  status?: UserStatus;
  role?: UserRole;
  query?: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  role: UserRole;
  status?: UserStatus;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  status?: UserStatus;
  resetPassword?: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserResult {
  user: User;
  temporaryPassword: string;
}

export interface ResetPasswordResult {
  user: User;
  temporaryPassword: string;
}

export interface UpdateUserResult {
  user: User;
  temporaryPassword?: string;
}

const nowIso = (): string => DateTime.utc().toISO();

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const randomPassword = (): string => crypto.randomBytes(16).toString('base64url');

const validatePasswordStrength = (password: string): void => {
  if (password.length < config.password.minLength) {
    throw new Error(`A senha deve ter pelo menos ${config.password.minLength} caracteres.`);
  }
};

const buildDiff = (
  before: Partial<User>,
  after: Partial<User>,
  fields: Array<keyof User>
): Record<string, { old?: unknown; new?: unknown }> => {
  const diff: Record<string, { old?: unknown; new?: unknown }> = {};
  fields.forEach((field) => {
    if (before[field] !== after[field]) {
      diff[field as string] = { old: before[field], new: after[field] };
    }
  });
  return diff;
};

export class UserService {
  constructor(private readonly repository: UserRepository, private readonly auditService: AuditService) {}

  async list(filters: UserFilters = {}): Promise<User[]> {
    const users = await this.repository.listUsers();
    const query = filters.query?.toLowerCase();

    return users.filter((user) => {
      if (filters.status && user.status !== filters.status) {
        return false;
      }
      if (filters.role && user.role !== filters.role) {
        return false;
      }
      if (query) {
        const haystack = `${user.email} ${user.name}`.toLowerCase();
        return haystack.includes(query);
      }
      return true;
    });
  }

  async getById(id: string): Promise<User | null> {
    return this.repository.getUserById(id);
  }

  async create(input: CreateUserInput, actor: ServiceActor, metadata: RequestMetadata): Promise<CreateUserResult> {
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new Error('E-mail inválido.');
    }
    if (!input.name.trim()) {
      throw new Error('Nome é obrigatório.');
    }
    const existing = await this.repository.getUserByEmail(email);
    if (existing) {
      throw new Error('Já existe um usuário com este e-mail.');
    }

    const timestamp = nowIso();
    const user: User = {
      id: crypto.randomUUID(),
      email,
      name: input.name.trim(),
      role: input.role,
      status: input.status ?? 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: undefined,
      mfaEnabled: false
    };

    const temporaryPassword = randomPassword();
    const credentials: UserCredentials = {
      userId: user.id,
      passwordHash: await hashSecret(temporaryPassword),
      passwordUpdatedAt: timestamp,
      passwordNeedsReset: true
    };

    await this.repository.createUser(user, credentials);

    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'user',
      entityId: user.id,
      action: 'user_create',
      diff: {
        email: { new: user.email },
        name: { new: user.name },
        role: { new: user.role },
        status: { new: user.status }
      },
      ip: metadata.ip,
      userAgent: metadata.userAgent
    });

    return { user, temporaryPassword };
  }

  async update(
    id: string,
    input: UpdateUserInput,
    actor: ServiceActor,
    metadata: RequestMetadata
  ): Promise<UpdateUserResult> {
    const user = await this.repository.getUserById(id);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    const before = { ...user };

    if (input.name !== undefined) {
      user.name = input.name.trim();
    }
    if (input.role !== undefined) {
      user.role = input.role;
    }
    if (input.status !== undefined) {
      user.status = input.status;
    }

    await this.ensureAdminAvailability(user.id, user.role, user.status);

    user.updatedAt = nowIso();

    await this.repository.updateUser(user);

    const diff = buildDiff(before, user, ['name', 'role', 'status']);

    if (input.resetPassword) {
      const reset = await this.resetPasswordInternal(user, actor, metadata, false);
      diff['password'] = { old: '***', new: '*** (reset)' };
      const hasOtherChanges = Object.keys(diff).some((key) => key !== 'password');
      if (hasOtherChanges) {
        await this.auditService.record({
          actorUserId: actor.id,
          actorEmail: actor.email,
          entity: 'user',
          entityId: user.id,
          action: 'user_update',
          diff: Object.fromEntries(
            Object.entries(diff).filter(([key]) => key !== 'password')
          ),
          ip: metadata.ip,
          userAgent: metadata.userAgent
        });
      }
      await this.auditService.record({
        actorUserId: actor.id,
        actorEmail: actor.email,
        entity: 'user',
        entityId: user.id,
        action: 'user_reset_password',
        diff: {},
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        note: 'Senha redefinida pelo administrador.'
      });
      return { user: reset.user, temporaryPassword: reset.temporaryPassword };
    }

    if (Object.keys(diff).length > 0) {
      await this.auditService.record({
        actorUserId: actor.id,
        actorEmail: actor.email,
        entity: 'user',
        entityId: user.id,
        action: 'user_update',
        diff,
        ip: metadata.ip,
        userAgent: metadata.userAgent
      });
    }

    return { user };
  }

  async disable(id: string, actor: ServiceActor, metadata: RequestMetadata): Promise<User> {
    const user = await this.repository.getUserById(id);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    const previousStatus = user.status;
    user.status = 'disabled';
    user.updatedAt = nowIso();

    await this.ensureAdminAvailability(user.id, user.role, user.status);

    await this.repository.updateUser(user);

    await this.repository.revokeTokensByUser(user.id);

    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'user',
      entityId: user.id,
      action: 'user_disable',
      diff: { status: { old: previousStatus, new: 'disabled' } },
      ip: metadata.ip,
      userAgent: metadata.userAgent
    });

    return user;
  }

  async resetPassword(
    id: string,
    actor: ServiceActor,
    metadata: RequestMetadata
  ): Promise<ResetPasswordResult> {
    const user = await this.repository.getUserById(id);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    return this.resetPasswordInternal(user, actor, metadata, true);
  }

  private async resetPasswordInternal(
    user: User,
    actor: ServiceActor,
    metadata: RequestMetadata,
    logAudit: boolean
  ): Promise<ResetPasswordResult> {
    const timestamp = nowIso();
    const temporaryPassword = randomPassword();
    const credentials: UserCredentials = {
      userId: user.id,
      passwordHash: await hashSecret(temporaryPassword),
      passwordUpdatedAt: timestamp,
      passwordNeedsReset: true
    };

    await this.repository.saveUserCredentials(credentials);
    await this.repository.revokeTokensByUser(user.id);

    if (logAudit) {
      await this.auditService.record({
        actorUserId: actor.id,
        actorEmail: actor.email,
        entity: 'user',
        entityId: user.id,
        action: 'user_reset_password',
        diff: {},
        ip: metadata.ip,
        userAgent: metadata.userAgent
      });
    }

    return { user, temporaryPassword };
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    actor: ServiceActor,
    metadata: RequestMetadata
  ): Promise<void> {
    const user = await this.repository.getUserById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    const credentials = await this.repository.getUserCredentials(user.id);
    if (!credentials) {
      throw new Error('Credenciais não configuradas.');
    }

    const valid = await verifySecret(input.currentPassword, credentials.passwordHash);
    if (!valid) {
      throw new Error('Senha atual inválida.');
    }

    validatePasswordStrength(input.newPassword);

    const timestamp = nowIso();

    const updated: UserCredentials = {
      userId: user.id,
      passwordHash: await hashSecret(input.newPassword),
      passwordUpdatedAt: timestamp,
      passwordNeedsReset: false
    };

    await this.repository.saveUserCredentials(updated);
    await this.repository.revokeTokensByUser(user.id);

    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'user',
      entityId: user.id,
      action: 'user_update',
      diff: { password: { old: '***', new: '***' } },
      ip: metadata.ip,
      userAgent: metadata.userAgent
    });
  }

  async setPasswordFromResetToken(
    user: User,
    newPassword: string,
    metadata: RequestMetadata
  ): Promise<void> {
    validatePasswordStrength(newPassword);
    const timestamp = nowIso();
    const updated: UserCredentials = {
      userId: user.id,
      passwordHash: await hashSecret(newPassword),
      passwordUpdatedAt: timestamp,
      passwordNeedsReset: false
    };
    await this.repository.saveUserCredentials(updated);
    await this.repository.revokeTokensByUser(user.id);

    await this.auditService.record({
      actorUserId: user.id,
      actorEmail: user.email,
      entity: 'user',
      entityId: user.id,
      action: 'user_update',
      diff: { password: { old: '***', new: '***' } },
      ip: metadata.ip,
      userAgent: metadata.userAgent,
      note: 'Senha redefinida via token de recuperação.'
    });
  }

  async ensureAdminAvailability(userId: string, role: UserRole, status: UserStatus): Promise<void> {
    const users = await this.repository.listUsers();
    const admins = users.filter((user) => user.role === 'admin' && user.status === 'active');
    const isTargetAdmin = admins.some((admin) => admin.id === userId);

    if (admins.length <= 1 && isTargetAdmin) {
      if (role !== 'admin' || status !== 'active') {
        throw new Error('Não é possível remover o último administrador ativo.');
      }
    }
  }

  async updateLastLogin(user: User): Promise<void> {
    user.lastLoginAt = nowIso();
    user.updatedAt = nowIso();
    await this.repository.updateUser(user);
  }

  async getCredentials(userId: string): Promise<UserCredentials | null> {
    return this.repository.getUserCredentials(userId);
  }

  async revokeRefreshToken(token: RefreshTokenRecord): Promise<void> {
    await this.repository.revokeRefreshToken(token.id);
  }
}
