import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { User, UserStatus } from '../domain/types';
import { UserCredentialsRepository, UserRepository } from '../repositories/interfaces';
import { AuditService } from './auditService';
import { assertValidEmail, sanitizeString } from '../utils/validators';

export interface CreateUserInput {
  email: string;
  name: string;
  role: User['role'];
}

export interface UpdateUserInput {
  name?: string;
  role?: User['role'];
  status?: UserStatus;
}

const PASSWORD_BCRYPT_ROUNDS = 12;

const isValidRole = (value: string): value is User['role'] =>
  value === 'admin' || value === 'editor' || value === 'viewer';

const isValidStatus = (value: string): value is Exclude<UserStatus, 'inactive'> =>
  value === 'active' || value === 'disabled';

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly credentials: UserCredentialsRepository,
    private readonly audit: AuditService
  ) {}

  async list(): Promise<User[]> {
    return this.users.listUsers();
  }

  async create(
    input: CreateUserInput,
    actor: { id: string; email: string }
  ): Promise<{ user: User; temporaryPassword: string }> {
    const email = this.normalizeEmail(input.email);
    const name = this.normalizeName(input.name);
    const role = this.normalizeRole(input.role);

    const existing = await this.users.getUserByEmail(email);
    if (existing) {
      throw new Error('E-mail já cadastrado.');
    }

    const now = new Date().toISOString();
    const user: User = {
      id: uuid(),
      email,
      name,
      role,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, PASSWORD_BCRYPT_ROUNDS);

    await this.users.createUser(user);
    await this.credentials.setUserCredentials({
      userId: user.id,
      passwordHash,
      passwordUpdatedAt: now,
      passwordNeedsReset: true
    });

    await this.audit.record({
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
      }
    });

    return { user, temporaryPassword };
  }

  async update(id: string, input: UpdateUserInput, actor: { id: string; email: string }): Promise<User> {
    const user = await this.users.getUserById(id);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    const updates: Partial<User> = {};
    const diff: Record<string, { old?: unknown; new?: unknown }> = {};
    const now = new Date().toISOString();

    if (input.name !== undefined) {
      const name = this.normalizeName(input.name);
      if (name !== user.name) {
        updates.name = name;
        diff.name = { old: user.name, new: name };
      }
    }

    if (input.role !== undefined) {
      const role = this.normalizeRole(input.role);
      if (role !== user.role) {
        await this.ensureAdminSurvives(user, { role });
        updates.role = role;
        diff.role = { old: user.role, new: role };
      }
    }

    if (input.status !== undefined) {
      const status = this.normalizeStatus(input.status);
      if (status !== user.status) {
        await this.ensureAdminSurvives(user, { status });
        updates.status = status;
        diff.status = { old: user.status, new: status };
      }
    }

    if (Object.keys(updates).length === 0) {
      return user;
    }

    updates.updatedAt = now;

    const updated = await this.users.updateUser(id, updates);

    await this.audit.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'user',
      entityId: id,
      action: 'user_update',
      diff
    });

    return updated;
  }

  async disable(id: string, actor: { id: string; email: string }): Promise<void> {
    const user = await this.users.getUserById(id);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    if (user.status === 'disabled') {
      return;
    }

    await this.ensureAdminSurvives(user, { status: 'disabled' });

    const now = new Date().toISOString();
    await this.users.updateUser(id, { status: 'disabled', updatedAt: now });

    await this.audit.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'user',
      entityId: id,
      action: 'user_disable',
      diff: {
        status: { old: user.status, new: 'disabled' }
      }
    });
  }

  private normalizeEmail(value: string): string {
    const email = sanitizeString(value).toLowerCase();
    if (!email) {
      throw new Error('E-mail é obrigatório.');
    }
    assertValidEmail(email, 'email');
    return email;
  }

  private normalizeName(value: string): string {
    const name = sanitizeString(value);
    if (!name) {
      throw new Error('Nome é obrigatório.');
    }
    return name;
  }

  private normalizeRole(value: string): User['role'] {
    if (!isValidRole(value)) {
      throw new Error('Perfil de usuário inválido.');
    }
    return value;
  }

  private normalizeStatus(value: string): UserStatus {
    if (!isValidStatus(value)) {
      throw new Error('Status de usuário inválido.');
    }
    return value;
  }

  private generateTemporaryPassword(): string {
    let password = '';
    while (password.length < 12) {
      password += randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    }
    return password.slice(0, 12);
  }

  private async ensureAdminSurvives(
    current: User,
    change: { role?: User['role']; status?: UserStatus }
  ): Promise<void> {
    const isCurrentlyActiveAdmin = current.role === 'admin' && current.status === 'active';
    if (!isCurrentlyActiveAdmin) {
      return;
    }

    const roleAfter = change.role ?? current.role;
    const statusAfter = change.status ?? current.status;

    const remainsAdmin = roleAfter === 'admin';
    const remainsActive = statusAfter === 'active';

    if (remainsAdmin && remainsActive) {
      return;
    }

    const users = await this.users.listUsers();
    const otherActiveAdmins = users.filter(
      (user) => user.id !== current.id && user.role === 'admin' && user.status === 'active'
    );

    if (otherActiveAdmins.length === 0) {
      throw new Error('Não é possível remover o último administrador.');
    }
  }
}
