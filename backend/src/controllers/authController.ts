import { Router, CookieOptions } from 'express';
import config from '../config/env';
import { authRateLimiter } from '../middlewares/rateLimiter';
import { authService } from '../services/container';
import {
  AccountLockedError,
  InvalidCredentialsError,
  InvalidTokenError
} from '../services/authService';
import { parseDurationToMilliseconds } from '../utils/duration';
import logger from '../utils/logger';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

const buildCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: (config.env === 'production' ? 'none' : 'lax') as CookieOptions['sameSite'],
  secure: config.env === 'production',
  maxAge: parseDurationToMilliseconds(config.jwtRefreshExpiresIn),
  path: '/api/auth'
});

export const authController = Router();

authController.post('/login', authRateLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const context = {
    userAgent: req.get('user-agent') || undefined,
    ip: req.ip
  };

  try {
    const result = await authService.login(email, password, context);
    const cookieOptions = buildCookieOptions();
    res
      .cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, cookieOptions)
      .json({ accessToken: result.accessToken, expiresIn: result.expiresIn });
  } catch (error) {
    if (error instanceof AccountLockedError) {
      res.status(423).json({ message: error.message });
      return;
    }
    if (error instanceof InvalidCredentialsError) {
      res.status(401).json({ message: 'Credenciais inválidas' });
      return;
    }

    logger.error({ error }, 'Falha inesperada ao realizar login');
    res.status(500).json({ message: 'Erro ao efetuar login' });
  }
});

authController.post('/refresh', async (req, res) => {
  const cookieRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  const bodyRefreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  const refreshToken = cookieRefreshToken || bodyRefreshToken;

  if (!refreshToken) {
    res.status(400).json({ message: 'refreshToken ausente' });
    return;
  }

  try {
    const context = {
      userAgent: req.get('user-agent') || undefined,
      ip: req.ip
    };
    const result = await authService.refresh(refreshToken, context);
    const cookieOptions = buildCookieOptions();
    res
      .cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, cookieOptions)
      .json({ accessToken: result.accessToken, expiresIn: result.expiresIn });
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      res.status(401).json({ message: 'Token inválido' });
      return;
    }

    logger.error({ error }, 'Falha inesperada ao renovar token');
    res.status(500).json({ message: 'Erro ao renovar token' });
  }
});

authController.post('/logout', async (req, res) => {
  const cookieOptions = buildCookieOptions();
  const cookieRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  const bodyRefreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  const refreshToken = cookieRefreshToken || bodyRefreshToken;

  if (refreshToken) {
    try {
      await authService.logout(refreshToken);
    } catch (error) {
      logger.warn({ error }, 'Falha ao revogar refresh token durante logout');
    }
  }

  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).send();
});
