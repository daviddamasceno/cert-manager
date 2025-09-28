import bcrypt from 'bcryptjs';
import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import config from '../config/env';

interface TokenPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

class AuthService {
  async login(email: string, password: string): Promise<LoginResult> {
    if (email.toLowerCase() !== config.adminEmail.toLowerCase()) {
      throw new Error('Credenciais inválidas');
    }

    const isValid = await bcrypt.compare(password, config.adminPasswordHash);
    if (!isValid) {
      throw new Error('Credenciais inválidas');
    }

    const accessToken = this.generateToken(email, 'access', config.jwtExpiresIn);
    const refreshToken = this.generateToken(email, 'refresh', config.jwtRefreshExpiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseDurationToSeconds(config.jwtExpiresIn)
    };
  }

  refresh(refreshToken: string): LoginResult {
    const payload = this.verifyToken(refreshToken, 'refresh');

    const accessToken = this.generateToken(payload.email, 'access', config.jwtExpiresIn);
    const newRefreshToken = this.generateToken(payload.email, 'refresh', config.jwtRefreshExpiresIn);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.parseDurationToSeconds(config.jwtExpiresIn)
    };
  }

  verifyToken(token: string, type: 'access' | 'refresh' = 'access'): TokenPayload {
    const decoded = jwt.verify(token, config.jwtSecret as Secret) as TokenPayload;
    if (decoded.type !== type) {
      throw new Error('Tipo de token inválido');
    }
    return decoded;
  }

  private generateToken(email: string, type: 'access' | 'refresh', expiresIn: string): string {
    const payload: TokenPayload = {
      sub: email,
      email,
      type
    };

    const options: SignOptions = { expiresIn: expiresIn as SignOptions['expiresIn'] };
    return jwt.sign(payload, config.jwtSecret as Secret, options);
  }

  private parseDurationToSeconds(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 0;
    }
    const value = Number(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400
    };

    return value * multipliers[unit];
  }
}

export const authService = new AuthService();
