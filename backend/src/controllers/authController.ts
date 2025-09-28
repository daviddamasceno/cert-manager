import { Router } from 'express';
import { authService } from '../services/authService';

export const authController = Router();

authController.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await authService.login(email, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ message: 'Credenciais inv?lidas' });
  }
});

authController.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ message: 'refreshToken ? obrigat?rio' });
    return;
  }

  try {
    const result = authService.refresh(refreshToken);
    res.json(result);
  } catch (error) {
    res.status(401).json({ message: 'Token inv?lido' });
  }
});
