import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload, SignOptions, Secret } from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import config from '../config/env';
import {
  RefreshTokenRepository,
  UserCredentialsRepository,
  UserRepository
} from '../repositories/interfaces';
import { RefreshTokenRecord, User } from '../domain/types';
import { parseDurationToMilliseconds, parseDurationToSeconds } from '../utils/duration';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthContext {
  ip?: string;
  userAgent?: string;
}

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  type: 'access';
}

const REFRESH_TOKEN_SEPARATOR = '.';
const REFRESH_TOKEN_BYTES = 48;
const REFRESH_TOKEN_BCRYPT_ROUNDS = 12;

const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 10;
const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

type LoginAttemptState = {
  attempts: number;
  windowStart: number;
  failures: number;
  lockUntil?: number;
};

export class AuthError extends Error {
  public readonly statusCode: number;
  public readonly retryAfterSeconds?: number;

  constructor(statusCode: number, message: string, retryAfterSeconds?: number) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AuthService {
  private readonly loginAttempts = new Map<string, LoginAttemptState>();

  constructor(
    private readonly users: UserRepository,
    private readonly userCredentials: UserCredentialsRepository,
    private readonly refreshTokens: RefreshTokenRepository
  ) {}

  async login(email: string, password: string, context: AuthContext = {}): Promise<LoginResult> {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new AuthError(400, 'Email e senha são obrigatórios');
    }

    const { key, state } = this.checkRateLimit(normalizedEmail, context.ip);

    let user = await this.users.getUserByEmail(normalizedEmail);
    if (!user) {
      user = await this.ensureDefaultAdminUser(normalizedEmail);
    }
    if (!user || user.status !== 'active') {
      this.registerFailure(key, state);
      throw new AuthError(401, 'Credenciais inválidas');
    }

    const isValid = await this.userCredentials.verifyUserPassword(user.id, password);
    if (!isValid) {
      this.registerFailure(key, state);
      throw new AuthError(401, 'Credenciais inválidas');
    }

    this.resetFailures(key, state);

    await this.updateLastLogin(user).catch(() => undefined);

    return this.issueSession(user, context);
  }

  async refresh(refreshToken: string, context: AuthContext = {}): Promise<LoginResult> {
    const parsed = this.parseRefreshToken(refreshToken);

    const stored = await this.refreshTokens.findRefreshTokenById(parsed.id);
    if (!stored || stored.revoked) {
      throw new AuthError(401, 'Token de atualização inválido');
    }

    const expiresAt = Date.parse(stored.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      await this.refreshTokens.revokeRefreshToken(stored.id).catch(() => undefined);
      throw new AuthError(401, 'Token de atualização expirado');
    }

    const matches = await bcrypt.compare(parsed.secret, stored.tokenHash);
    if (!matches) {
      await this.refreshTokens.revokeRefreshToken(stored.id).catch(() => undefined);
      throw new AuthError(401, 'Token de atualização inválido');
    }

    const user = await this.users.getUserById(stored.userId);
    if (!user || user.status !== 'active') {
      await this.refreshTokens.revokeRefreshToken(stored.id).catch(() => undefined);
      throw new AuthError(401, 'Token de atualização inválido');
    }

    await this.refreshTokens.revokeRefreshToken(stored.id).catch(() => undefined);

    return this.issueSession(user, context);
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const parsed = this.parseRefreshToken(refreshToken);
      await this.refreshTokens.revokeRefreshToken(parsed.id).catch(() => undefined);
    } catch (error) {
      // Silently ignore malformed tokens on logout
    }
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, config.jwtSecret as Secret) as AccessTokenPayload;
    if (!decoded || decoded.type !== 'access' || !decoded.sub || !decoded.email) {
      throw new AuthError(401, 'Token de acesso inválido');
    }
    return decoded;
  }

  private async issueSession(user: User, context: AuthContext): Promise<LoginResult> {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user, context);

    return {
      accessToken,
      refreshToken,
      expiresIn: parseDurationToSeconds(config.jwtExpiresIn)
    };
  }

  private generateAccessToken(user: User): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access'
    };

    const options: SignOptions = { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] };
    return jwt.sign(payload, config.jwtSecret as Secret, options);
  }

  private async generateRefreshToken(user: User, context: AuthContext): Promise<string> {
    const id = uuid();
    const secret = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const token = `${id}${REFRESH_TOKEN_SEPARATOR}${secret}`;

    const issuedAt = new Date();
    const expiresInMs = parseDurationToMilliseconds(config.jwtRefreshExpiresIn) || 14 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(issuedAt.getTime() + expiresInMs);

    const record: RefreshTokenRecord = {
      id,
      userId: user.id,
      tokenHash: await bcrypt.hash(secret, REFRESH_TOKEN_BCRYPT_ROUNDS),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      userAgent: this.sanitizeMetadata(context.userAgent),
      ip: this.sanitizeMetadata(context.ip),
      revoked: false
    };

    await this.refreshTokens.saveRefreshToken(record);

    return token;
  }

  private sanitizeMetadata(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.slice(0, 255);
  }

  private async ensureDefaultAdminUser(email: string): Promise<User | null> {
    if (!this.isDefaultAdminEmail(email)) {
      return null;
    }

    const normalizedAdminEmail = this.getDefaultAdminEmail();
    let user = await this.users.getUserByEmail(normalizedAdminEmail);

    if (!user) {
      const now = new Date().toISOString();
      const adminUser: User = {
        id: uuid(),
        email: config.adminEmail.trim(),
        name: 'Administrador',
        role: 'admin',
        status: 'active',
        createdAt: now,
        updatedAt: now
      };

      try {
        await this.users.createUser(adminUser);
        user = adminUser;
      } catch (error) {
        // If another process created the user concurrently, fall back to fetching it.
        user = await this.users.getUserByEmail(normalizedAdminEmail);
        if (!user) {
          throw error;
        }
      }
    }

    if (!user) {
      return null;
    }

    const credentials = await this.userCredentials.getUserCredentials(user.id);
    if (!credentials) {
      const now = new Date().toISOString();
      await this.userCredentials.setUserCredentials({
        userId: user.id,
        passwordHash: config.adminPasswordHash,
        passwordUpdatedAt: now,
        passwordNeedsReset: false
      });
    }

    return user;
  }

  private isDefaultAdminEmail(email: string): boolean {
    return email === this.getDefaultAdminEmail();
  }

  private getDefaultAdminEmail(): string {
    return config.adminEmail.trim().toLowerCase();
  }

  private parseRefreshToken(token: string): { id: string; secret: string } {
    const separatorIndex = token.indexOf(REFRESH_TOKEN_SEPARATOR);
    if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
      throw new AuthError(400, 'Formato de refresh token inválido');
    }
    const id = token.slice(0, separatorIndex);
    const secret = token.slice(separatorIndex + 1);
    if (!id || !secret) {
      throw new AuthError(400, 'Formato de refresh token inválido');
    }
    return { id, secret };
  }

  private async updateLastLogin(user: User): Promise<void> {
    const now = new Date().toISOString();
    await this.users.updateUser(user.id, { lastLoginAt: now, updatedAt: now });
  }

  private checkRateLimit(email: string, ip?: string): { key: string; state: LoginAttemptState } {
    const key = this.buildAttemptKey(email, ip);
    const now = Date.now();
    const state = this.loginAttempts.get(key) ?? {
      attempts: 0,
      windowStart: now,
      failures: 0
    };

    if (state.lockUntil && state.lockUntil <= now) {
      state.lockUntil = undefined;
      state.failures = 0;
    }

    if (state.lockUntil && state.lockUntil > now) {
      const remainingSeconds = Math.max(1, Math.ceil((state.lockUntil - now) / 1000));
      throw new AuthError(
        423,
        'Conta temporariamente bloqueada devido a múltiplas falhas. Tente novamente mais tarde.',
        remainingSeconds
      );
    }

    if (now - state.windowStart > LOGIN_RATE_LIMIT_WINDOW_MS) {
      state.windowStart = now;
      state.attempts = 0;
    }

    if (state.attempts >= LOGIN_RATE_LIMIT_MAX) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((state.windowStart + LOGIN_RATE_LIMIT_WINDOW_MS - now) / 1000)
      );
      throw new AuthError(429, 'Muitas tentativas de login. Aguarde antes de tentar novamente.', retryAfterSeconds);
    }

    state.attempts += 1;
    this.loginAttempts.set(key, state);
    return { key, state };
  }

  private registerFailure(key: string, state: LoginAttemptState): void {
    state.failures += 1;
    if (state.failures >= LOGIN_LOCK_THRESHOLD) {
      state.lockUntil = Date.now() + LOGIN_LOCK_DURATION_MS;
      state.failures = 0;
    }
    this.loginAttempts.set(key, state);
  }

  private resetFailures(key: string, state: LoginAttemptState): void {
    state.failures = 0;
    state.lockUntil = undefined;
    this.loginAttempts.set(key, state);
  }

  private buildAttemptKey(email: string, ip?: string): string {
    return `${email}|${ip ?? 'unknown'}`;
  }
}
