import express, { Router, CookieOptions } from 'express';
import config from '../config/env';
import { authService } from '../services/container';
import { AuthError } from '../services/authService';
import { parseDurationToMilliseconds } from '../utils/duration';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveRequestActor } from '../utils/requestContext';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

const buildCookieOptions = (): CookieOptions => {
  const maxAge = parseDurationToMilliseconds(config.jwtRefreshExpiresIn) || 14 * 24 * 60 * 60 * 1000;
  return {
    httpOnly: true,
    sameSite: config.jwtCookieSameSite as CookieOptions['sameSite'],
    secure: config.env === 'production',
    maxAge,
    path: '/api/auth'
  };
};

const handleAuthError = (res: express.Response, error: unknown) => {
  if (error instanceof AuthError) {
    if (error.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', error.retryAfterSeconds.toString());
    }
    res.status(error.statusCode).json({ message: error.message });
    return;
  }
  res.status(500).json({ message: 'Erro de autenticação' });
};

export const authController = Router();

authController.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const emailValue = typeof email === 'string' ? email : '';
  const passwordValue = typeof password === 'string' ? password : '';
  try {
    const result = await authService.login(emailValue, passwordValue, {
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined
    });
    const cookieOptions = buildCookieOptions();
    res
      .cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, cookieOptions)
      .json({ accessToken: result.accessToken, expiresIn: result.expiresIn });
  } catch (error) {
    handleAuthError(res, error);
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
    const result = await authService.refresh(refreshToken, {
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined
    });
    const cookieOptions = buildCookieOptions();
    res
      .cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, cookieOptions)
      .json({ accessToken: result.accessToken, expiresIn: result.expiresIn });
  } catch (error) {
    handleAuthError(res, error);
  }
});

authController.post('/change-password', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const actor = resolveRequestActor(req);
  const currentPassword =
    typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  try {
    await authService.changePassword(
      { id: actor.id, email: actor.email },
      currentPassword,
      newPassword,
      { ip: actor.ip, userAgent: actor.userAgent }
    );
    res.status(204).send();
  } catch (error) {
    handleAuthError(res, error);
  }
});

authController.post('/logout', async (req, res) => {
  const cookieOptions = buildCookieOptions();
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  await authService.logout(refreshToken);
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).send();
});
