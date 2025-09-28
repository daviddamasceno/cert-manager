import crypto from 'crypto';
import jwt, { JwtPayload, Secret, SignOptions } from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import config from '../config/env';
import { parseDurationToSeconds } from '../utils/duration';
import logger from '../utils/logger';
import { RefreshTokenRepository, UserCredentialsRepository, UserRepository } from '../repositories/interfaces';
import { RefreshTokenRecord, User } from '../domain/types';

export interface TokenPayload extends JwtPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
  jti?: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenContext {
  userAgent?: string;
  ip?: string;
}

export class InvalidCredentialsError extends Error {
  constructor(message = 'Credenciais inválidas') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class AccountLockedError extends Error {
  constructor(message = 'Conta temporariamente bloqueada devido a múltiplas tentativas falhas.') {
    super(message);
    this.name = 'AccountLockedError';
  }
}

export class InvalidTokenError extends Error {
  constructor(message = 'Token inválido') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

interface LoginAttemptState {
  attempts: number;
  lockedUntil?: number;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export class AuthService {
  private readonly jwtSecret: Secret = config.jwtSecret as Secret;
  private readonly loginAttempts = new Map<string, LoginAttemptState>();

  constructor(
    private readonly userRepository: UserRepository,
    private readonly userCredentialsRepository: UserCredentialsRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository
  ) {}

  async login(email: string, password: string, context: TokenContext = {}): Promise<LoginResult> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail || !password) {
      this.recordFailedAttempt(normalizedEmail);
      throw new InvalidCredentialsError();
    }

    this.ensureNotLocked(normalizedEmail);

    const user = await this.userRepository.getUserByEmail(normalizedEmail);
    if (!user || user.status !== 'active') {
      this.recordFailedAttempt(normalizedEmail);
      throw new InvalidCredentialsError();
    }

    const isValidPassword = await this.userCredentialsRepository.verifyUserPassword(user.id, password);
    if (!isValidPassword) {
      this.recordFailedAttempt(normalizedEmail);
      throw new InvalidCredentialsError();
    }

    this.clearAttempts(normalizedEmail);
    await this.updateLastLogin(user.id);

    return this.issueTokens(user, context);
  }

  async refresh(refreshToken: string, context: TokenContext = {}): Promise<LoginResult> {
    if (!refreshToken) {
      throw new InvalidTokenError();
    }

    const payload = this.verifyToken(refreshToken, 'refresh');
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokenRepository.findRefreshTokenByHash(tokenHash);

    if (!stored || stored.revoked) {
      throw new InvalidTokenError();
    }

    if (new Date(stored.expiresAt).getTime() <= Date.now()) {
      await this.refreshTokenRepository.revokeRefreshToken(stored.id);
      throw new InvalidTokenError('Token expirado');
    }

    if (stored.userId !== payload.sub) {
      throw new InvalidTokenError();
    }

    const user = await this.userRepository.getUserById(stored.userId);
    if (!user || user.status !== 'active') {
      throw new InvalidTokenError();
    }

    await this.refreshTokenRepository.revokeRefreshToken(stored.id);

    return this.issueTokens(user, context);
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokenRepository.findRefreshTokenByHash(tokenHash);
    if (!stored) {
      return;
    }

    await this.refreshTokenRepository.revokeRefreshToken(stored.id);
  }

  verifyToken(token: string, type: 'access' | 'refresh' = 'access'): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      if (decoded.type !== type || typeof decoded.sub !== 'string') {
        throw new InvalidTokenError();
      }
      return decoded;
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw error;
      }
      throw new InvalidTokenError();
    }
  }

  private normalizeEmail(email?: string): string {
    return (email || '').trim().toLowerCase();
  }

  private recordFailedAttempt(email: string): void {
    if (!email) {
      return;
    }
    const current = this.loginAttempts.get(email) || { attempts: 0 };
    const attempts = current.attempts + 1;
    const nextState: LoginAttemptState = { attempts };

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      nextState.lockedUntil = Date.now() + LOCK_DURATION_MS;
    }

    this.loginAttempts.set(email, nextState);
  }

  private ensureNotLocked(email: string): void {
    const state = this.loginAttempts.get(email);
    if (!state || !state.lockedUntil) {
      return;
    }

    if (state.lockedUntil > Date.now()) {
      throw new AccountLockedError();
    }

    this.loginAttempts.delete(email);
  }

  private clearAttempts(email: string): void {
    this.loginAttempts.delete(email);
  }

  private async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.userRepository.updateUser(userId, { lastLoginAt: new Date().toISOString() });
    } catch (error) {
      logger.warn({ userId, error }, 'Failed to update last login');
    }
  }

  private async issueTokens(user: User, context: TokenContext): Promise<LoginResult> {
    const accessToken = this.generateAccessToken(user);
    const tokenId = uuid();
    const refreshToken = this.generateRefreshToken(user, tokenId);

    const now = new Date();
    const accessExpiresIn = parseDurationToSeconds(config.jwtExpiresIn) || 0;
    const refreshExpiresInSeconds = parseDurationToSeconds(config.jwtRefreshExpiresIn) || 0;
    const refreshExpiresAt = new Date(now.getTime() + refreshExpiresInSeconds * 1000);

    const record: RefreshTokenRecord = {
      id: tokenId,
      userId: user.id,
      tokenHash: this.hashToken(refreshToken),
      issuedAt: now.toISOString(),
      expiresAt: refreshExpiresAt.toISOString(),
      userAgent: context.userAgent,
      ip: context.ip,
      revoked: false
    };

    await this.refreshTokenRepository.saveRefreshToken(record);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn
    };
  }

  private generateAccessToken(user: User): string {
    const options: SignOptions = { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] };
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        type: 'access'
      },
      this.jwtSecret,
      options
    );
  }

  private generateRefreshToken(user: User, tokenId: string): string {
    const options: SignOptions = { expiresIn: config.jwtRefreshExpiresIn as SignOptions['expiresIn'] };
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        type: 'refresh',
        jti: tokenId
      },
      this.jwtSecret,
      options
    );
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
