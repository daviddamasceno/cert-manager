import { Router, CookieOptions } from 'express';
import config from '../config/env';
import { authService } from '../services/container';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

const router = Router();

const buildCookieOptions = (maxAgeSeconds: number): CookieOptions => ({
  httpOnly: true,
  sameSite: (config.env === 'production' ? 'strict' : 'lax') as CookieOptions['sameSite'],
  secure: config.env === 'production',
  maxAge: maxAgeSeconds * 1000,
  path: '/api'
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ message: 'Credenciais inválidas.' });
    return;
  }

  try {
    const metadata = { ip: req.ip, userAgent: req.get('user-agent') };
    const result = await authService.login(email, password, metadata);

    res
      .cookie(authService.accessCookieName, result.access.token, buildCookieOptions(config.jwt.accessTtlMinutes * 60))
      .cookie(
        authService.refreshCookieName,
        result.refresh.token,
        buildCookieOptions(config.jwt.refreshTtlDays * 24 * 60 * 60)
      )
      .json({
        user: result.user,
        accessToken: result.access.token,
        accessTokenExpiresAt: result.access.expiresAt,
        refreshTokenExpiresAt: result.refresh.expiresAt,
        requiresPasswordReset: result.requiresPasswordReset
      });
  } catch (error) {
    res.status(401).json({ message: error instanceof Error ? error.message : 'Falha na autenticação.' });
  }
});

router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.[authService.refreshCookieName];
  if (!refreshToken) {
    res.status(401).json({ message: 'Token de atualização ausente.' });
    return;
  }

  try {
    const metadata = { ip: req.ip, userAgent: req.get('user-agent') };
    const result = await authService.refresh(refreshToken, metadata);

    res
      .cookie(authService.accessCookieName, result.access.token, buildCookieOptions(config.jwt.accessTtlMinutes * 60))
      .cookie(
        authService.refreshCookieName,
        result.refresh.token,
        buildCookieOptions(config.jwt.refreshTtlDays * 24 * 60 * 60)
      )
      .json({
        user: result.user,
        accessToken: result.access.token,
        accessTokenExpiresAt: result.access.expiresAt,
        refreshTokenExpiresAt: result.refresh.expiresAt,
        requiresPasswordReset: result.requiresPasswordReset
      });
  } catch (error) {
    res.status(401).json({ message: 'Token inválido.' });
  }
});

router.post('/logout', async (req: AuthenticatedRequest, res) => {
  const refreshToken = req.cookies?.[authService.refreshCookieName];
  const user = req.user;
  await authService.logout(refreshToken, user ?? { id: 'unknown', email: 'unknown', role: 'viewer', name: 'unknown', status: 'active', mfaEnabled: false }, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  const clearOptions = buildCookieOptions(0);
  res
    .clearCookie(authService.accessCookieName, { ...clearOptions, maxAge: undefined })
    .clearCookie(authService.refreshCookieName, { ...clearOptions, maxAge: undefined })
    .status(204)
    .send();
});

export const authController = router;
