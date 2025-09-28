import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { DateTime } from 'luxon';
import config from '../config/env';
import { AuditService } from './auditService';
import { UserService } from './userService';
import { RequestMetadata, ServiceActor } from './types';
import { User, UserRole } from '../domain/types';
import { UserRepository } from '../repositories/interfaces';
import { verifySecret } from '../utils/passwordHasher';

const ACCESS_COOKIE_NAME = 'access_token';
const REFRESH_COOKIE_NAME = 'refresh_token';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: User['status'];
  lastLoginAt?: string;
  mfaEnabled: boolean;
}

interface TokenMetadata {
  token: string;
  expiresAt: string;
  id: string;
}

export interface AuthResult {
  user: AuthenticatedUser;
  access: TokenMetadata;
  refresh: TokenMetadata;
  requiresPasswordReset: boolean;
}

export interface LoginMetadata extends RequestMetadata {
  userAgent?: string;
}

interface RefreshTokenPayload extends JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  jti: string;
}

interface AttemptState {
  attempts: number;
  lockedUntil?: number;
}

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex');

const ACCESS_TTL_SECONDS = config.jwt.accessTtlMinutes * 60;
const REFRESH_TTL_SECONDS = config.jwt.refreshTtlDays * 24 * 60 * 60;
const LOCK_DURATION_MS = config.auth.loginLockMinutes * 60 * 1000;

export class AuthService {
  private readonly loginAttempts = new Map<string, AttemptState>();

  constructor(
    private readonly userRepository: UserRepository,
    private readonly userService: UserService,
    private readonly auditService: AuditService
  ) {}

  get accessCookieName(): string {
    return ACCESS_COOKIE_NAME;
  }

  get refreshCookieName(): string {
    return REFRESH_COOKIE_NAME;
  }

  async login(email: string, password: string, metadata: LoginMetadata): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    this.assertNotLocked(normalizedEmail);

    const user = await this.userRepository.getUserByEmail(normalizedEmail);
    const credentials = user ? await this.userRepository.getUserCredentials(user.id) : null;

    if (!user || !credentials) {
      this.registerFailedAttempt(normalizedEmail);
      await this.auditService.record({
        actorUserId: user?.id ?? 'unknown',
        actorEmail: normalizedEmail,
        entity: 'auth',
        entityId: user?.id ?? normalizedEmail,
        action: 'login_failed',
        diff: {},
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        note: 'Usuário ou credenciais inválidas.'
      });
      throw new Error('Credenciais inválidas.');
    }

    if (user.status !== 'active') {
      this.registerFailedAttempt(normalizedEmail);
      await this.auditService.record({
        actorUserId: user.id,
        actorEmail: user.email,
        entity: 'auth',
        entityId: user.id,
        action: 'login_failed',
        diff: {},
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        note: 'Usuário desativado.'
      });
      throw new Error('Usuário desativado.');
    }

    const valid = await verifySecret(password, credentials.passwordHash);
    if (!valid) {
      this.registerFailedAttempt(normalizedEmail);
      await this.auditService.record({
        actorUserId: user.id,
        actorEmail: user.email,
        entity: 'auth',
        entityId: user.id,
        action: 'login_failed',
        diff: {},
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        note: 'Senha incorreta.'
      });
      throw new Error('Credenciais inválidas.');
    }

    this.clearAttempts(normalizedEmail);

    await this.userService.updateLastLogin(user);

    const tokens = await this.generateTokens(user, credentials.passwordNeedsReset, metadata);

    await this.auditService.record({
      actorUserId: user.id,
      actorEmail: user.email,
      entity: 'auth',
      entityId: user.id,
      action: 'login_success',
      diff: {},
      ip: metadata.ip,
      userAgent: metadata.userAgent
    });

    return tokens;
  }

  async refresh(refreshToken: string, metadata: LoginMetadata): Promise<AuthResult> {
    const payload = this.verifyToken(refreshToken, 'refresh');
    const record = await this.userRepository.findRefreshToken(payload.jti);
    if (!record || record.revoked) {
      throw new Error('Token inválido.');
    }

    const expectedHash = hashToken(refreshToken);
    if (record.tokenHash !== expectedHash) {
      await this.userRepository.revokeRefreshToken(record.id);
      throw new Error('Token inválido.');
    }

    const expiry = DateTime.fromISO(record.expiresAt);
    if (expiry < DateTime.utc()) {
      await this.userRepository.revokeRefreshToken(record.id);
      throw new Error('Token expirado.');
    }

    const user = await this.userRepository.getUserById(record.userId);
    if (!user || user.status !== 'active') {
      await this.userRepository.revokeRefreshToken(record.id);
      throw new Error('Usuário não autorizado.');
    }

    const credentials = await this.userRepository.getUserCredentials(user.id);
    if (!credentials) {
      await this.userRepository.revokeRefreshToken(record.id);
      throw new Error('Credenciais inválidas.');
    }

    await this.userRepository.revokeRefreshToken(record.id);

    const tokens = await this.generateTokens(user, credentials.passwordNeedsReset, metadata);

    await this.auditService.record({
      actorUserId: user.id,
      actorEmail: user.email,
      entity: 'auth',
      entityId: record.id,
      action: 'token_refresh',
      diff: {},
      ip: metadata.ip,
      userAgent: metadata.userAgent
    });

    return tokens;
  }

  async logout(refreshToken: string | undefined, actor: ServiceActor, metadata: LoginMetadata): Promise<void> {
    if (!refreshToken) {
      return;
    }
    try {
      const payload = this.verifyToken(refreshToken, 'refresh');
      const record = await this.userRepository.findRefreshToken(payload.jti);
      if (record) {
        await this.userRepository.revokeRefreshToken(record.id);
        await this.auditService.record({
          actorUserId: actor.id,
          actorEmail: actor.email,
          entity: 'auth',
          entityId: record.id,
          action: 'logout',
          diff: {},
          ip: metadata.ip,
          userAgent: metadata.userAgent
        });
      }
    } catch (error) {
      // ignore invalid token on logout
    }
  }

  verifyAccessToken(token: string): RefreshTokenPayload {
    return this.verifyToken(token, 'access');
  }

  private async generateTokens(
    user: User,
    passwordNeedsReset: boolean,
    metadata: RequestMetadata
  ): Promise<AuthResult> {
    const access = this.signToken(user, 'access', ACCESS_TTL_SECONDS);
    const refresh = this.signToken(user, 'refresh', REFRESH_TTL_SECONDS);

    await this.userRepository.storeRefreshToken({
      id: refresh.id,
      userId: user.id,
      tokenHash: hashToken(refresh.token),
      issuedAt: DateTime.utc().toISO(),
      expiresAt: refresh.expiresAt,
      userAgent: metadata.userAgent,
      ip: metadata.ip,
      revoked: false
    });

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      mfaEnabled: user.mfaEnabled
    };

    return {
      user: authUser,
      access,
      refresh,
      requiresPasswordReset: passwordNeedsReset
    };
  }

  private signToken(user: User, type: 'access' | 'refresh', expiresIn: number): TokenMetadata {
    const jwtId = crypto.randomUUID();
    const expiresAt = DateTime.utc().plus({ seconds: expiresIn }).toISO();
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        type
      },
      config.jwt.secret,
      {
        algorithm: config.jwt.algorithm,
        expiresIn,
        jwtid: jwtId
      }
    );

    return { token, expiresAt, id: jwtId };
  }

  private verifyToken(token: string, expectedType: 'access' | 'refresh'): RefreshTokenPayload {
    const payload = jwt.verify(token, config.jwt.secret, {
      algorithms: [config.jwt.algorithm]
    }) as RefreshTokenPayload;
    if (payload.type !== expectedType) {
      throw new Error('Tipo de token inválido.');
    }
    return payload;
  }

  private assertNotLocked(email: string): void {
    const state = this.loginAttempts.get(email);
    if (!state) {
      return;
    }
    if (state.lockedUntil && state.lockedUntil > Date.now()) {
      throw new Error('Muitas tentativas de login. Tente novamente mais tarde.');
    }
    if (state.lockedUntil && state.lockedUntil <= Date.now()) {
      this.loginAttempts.delete(email);
    }
  }

  private registerFailedAttempt(email: string): void {
    const state = this.loginAttempts.get(email) ?? { attempts: 0 };
    state.attempts += 1;

    if (state.attempts >= config.auth.loginMaxAttempts) {
      state.lockedUntil = Date.now() + LOCK_DURATION_MS;
    } else {
      const backoff = Math.min(LOCK_DURATION_MS, Math.pow(2, state.attempts - 1) * 1000);
      state.lockedUntil = Date.now() + backoff;
    }

    this.loginAttempts.set(email, state);
  }

  private clearAttempts(email: string): void {
    this.loginAttempts.delete(email);
  }
}
