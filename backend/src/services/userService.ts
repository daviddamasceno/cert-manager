import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { AuditActor, User, UserStatus } from '../domain/types';
import { UserCredentialsRepository, UserRepository } from '../repositories/interfaces';
import { AuditService } from './auditService';
import { assertValidEmail, sanitizeString, isStrongPassword } from '../utils/validators';

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
const TEMP_PASSWORD_LENGTH = 12;
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{}<>?';
const ALL_PASSWORD_CHARS = `${UPPERCASE}${LOWERCASE}${NUMBERS}${SYMBOLS}`;

const randomChar = (charset: string): string => charset[randomInt(charset.length)];

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

  async create(input: CreateUserInput, actor: AuditActor): Promise<{ user: User; temporaryPassword: string }> {
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
      },
      ip: actor.ip,
      userAgent: actor.userAgent
    });

    return { user, temporaryPassword };
  }

  async update(id: string, input: UpdateUserInput, actor: AuditActor): Promise<User> {
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
      diff,
      ip: actor.ip,
      userAgent: actor.userAgent
    });

    return updated;
  }

  async disable(id: string, actor: AuditActor): Promise<void> {
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
      },
      ip: actor.ip,
      userAgent: actor.userAgent
    });
  }

  async resetPassword(id: string, actor: AuditActor): Promise<{ temporaryPassword: string }> {
    const user = await this.users.getUserById(id);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, PASSWORD_BCRYPT_ROUNDS);
    const now = new Date().toISOString();

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
      entityId: id,
      action: 'user_password_reset',
      diff: {
        passwordNeedsReset: { new: true }
      },
      ip: actor.ip,
      userAgent: actor.userAgent
    });

    return { temporaryPassword };
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
    const characters = [
      randomChar(UPPERCASE),
      randomChar(LOWERCASE),
      randomChar(NUMBERS),
      randomChar(SYMBOLS)
    ];

    while (characters.length < TEMP_PASSWORD_LENGTH) {
      characters.push(randomChar(ALL_PASSWORD_CHARS));
    }

    for (let index = characters.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      const tmp = characters[index];
      characters[index] = characters[swapIndex];
      characters[swapIndex] = tmp;
    }

    const password = characters.join('');
    return isStrongPassword(password) ? password : this.generateTemporaryPassword();
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
