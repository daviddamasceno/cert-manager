process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_ACCESS_TTL_MIN = '5';
process.env.JWT_REFRESH_TTL_DAYS = '1';
process.env.PASSWORD_HASHER = 'argon2id';
process.env.PASSWORD_MIN_LENGTH = '10';
process.env.ARGON2_TIME = '2';
process.env.ARGON2_MEMORY = '4096';
process.env.ARGON2_THREADS = '2';
process.env.LOGIN_MAX_ATTEMPTS = '5';
process.env.LOGIN_LOCK_MINUTES = '15';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from('{}').toString('base64');
process.env.SHEETS_SPREADSHEET_ID = 'dummy-sheet';
process.env.ENCRYPTION_KEY = Buffer.from('test-encryption-key-32bytes!!').toString('base64');

import assert from 'assert';
import { UserRepository, AuditLogRepository } from '../src/repositories/interfaces';
import { RefreshTokenRecord, User, UserCredentials, AuditLog } from '../src/domain/types';
import { AuditService } from '../src/services/auditService';
import { UserService } from '../src/services/userService';
import { AuthService } from '../src/services/authService';
import { hashSecret } from '../src/utils/passwordHasher';

class InMemoryAuditRepository implements AuditLogRepository {
  public logs: AuditLog[] = [];
  async appendAuditLog(entry: AuditLog): Promise<void> {
    this.logs.push(entry);
  }
  async listAuditLogs(): Promise<AuditLog[]> {
    return this.logs;
  }
}

class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();
  private credentials = new Map<string, UserCredentials>();
  private refreshTokens = new Map<string, RefreshTokenRecord>();

  async getUserByEmail(email: string): Promise<User | null> {
    const match = [...this.users.values()].find((user) => user.email === email.toLowerCase());
    return match ?? null;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async createUser(user: User, credentials: UserCredentials): Promise<void> {
    this.users.set(user.id, { ...user });
    this.credentials.set(credentials.userId, { ...credentials });
  }

  async updateUser(user: User): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  async listUsers(): Promise<User[]> {
    return [...this.users.values()].map((user) => ({ ...user }));
  }

  async saveUserCredentials(credentials: UserCredentials): Promise<void> {
    this.credentials.set(credentials.userId, { ...credentials });
  }

  async getUserCredentials(userId: string): Promise<UserCredentials | null> {
    const stored = this.credentials.get(userId);
    return stored ? { ...stored } : null;
  }

  async listRefreshTokens(userId: string): Promise<RefreshTokenRecord[]> {
    return [...this.refreshTokens.values()].filter((token) => token.userId === userId).map((token) => ({ ...token }));
  }

  async storeRefreshToken(record: RefreshTokenRecord): Promise<void> {
    this.refreshTokens.set(record.id, { ...record });
  }

  async revokeRefreshToken(id: string): Promise<void> {
    const record = this.refreshTokens.get(id);
    if (record) {
      record.revoked = true;
      this.refreshTokens.set(id, { ...record });
    }
  }

  async revokeTokensByUser(userId: string): Promise<void> {
    for (const token of this.refreshTokens.values()) {
      if (token.userId === userId) {
        token.revoked = true;
      }
    }
  }

  async findRefreshToken(id: string): Promise<RefreshTokenRecord | null> {
    const record = this.refreshTokens.get(id);
    return record ? { ...record } : null;
  }
}

(async () => {
  const auditRepository = new InMemoryAuditRepository();
  const userRepository = new InMemoryUserRepository();
  const auditService = new AuditService(auditRepository);
  const userService = new UserService(userRepository, auditService);
  const authService = new AuthService(userRepository, userService, auditService);

  const now = new Date().toISOString();
  const passwordHash = await hashSecret('SecurePass123!');
  const user: User = {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin Test',
    role: 'admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: undefined,
    mfaEnabled: false
  };
  const credentials: UserCredentials = {
    userId: user.id,
    passwordHash,
    passwordUpdatedAt: now,
    passwordNeedsReset: false
  };
  await userRepository.createUser(user, credentials);

  const loginResult = await authService.login('admin@example.com', 'SecurePass123!', {
    ip: '127.0.0.1',
    userAgent: 'jest'
  });
  assert.strictEqual(loginResult.user.email, 'admin@example.com');
  assert.ok(loginResult.access.token.length > 10, 'Access token should be issued');

  const refreshResult = await authService.refresh(loginResult.refresh.token, {
    ip: '127.0.0.1',
    userAgent: 'jest'
  });
  assert.notStrictEqual(refreshResult.access.token, loginResult.access.token, 'Refresh should rotate access token');

  await authService.logout(refreshResult.refresh.token, loginResult.user, {
    ip: '127.0.0.1',
    userAgent: 'jest'
  });

  const payload = authService.verifyAccessToken(refreshResult.access.token);
  assert.strictEqual(payload.email, 'admin@example.com');

  console.log('authService.test.ts passed');
})();
