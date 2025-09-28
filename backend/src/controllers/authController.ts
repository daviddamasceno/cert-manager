import { Router, CookieOptions } from 'express';
import config from '../config/env';
import { authService } from '../services/authService';
import { parseDurationToMilliseconds } from '../utils/duration';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

const buildCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: (config.env === 'production' ? 'none' : 'lax') as CookieOptions['sameSite'],
  secure: config.env === 'production',
  maxAge: parseDurationToMilliseconds(config.jwtRefreshExpiresIn),
  path: '/api/auth'
});

export const authController = Router();

authController.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await authService.login(email, password);
    const cookieOptions = buildCookieOptions();
    res
      .cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, cookieOptions)
      .json({ accessToken: result.accessToken, expiresIn: result.expiresIn });
  } catch (error) {
    res.status(401).json({ message: 'Credenciais inválidas' });
  }
});

authController.post('/refresh', (req, res) => {
  const cookieRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  const bodyRefreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  const refreshToken = cookieRefreshToken || bodyRefreshToken;

  if (!refreshToken) {
    res.status(400).json({ message: 'refreshToken ausente' });
    return;
  }

  try {
    const result = authService.refresh(refreshToken);
    const cookieOptions = buildCookieOptions();
    res
      .cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, cookieOptions)
      .json({ accessToken: result.accessToken, expiresIn: result.expiresIn });
  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
});

authController.post('/logout', (_req, res) => {
  const cookieOptions = buildCookieOptions();
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).send();
});
