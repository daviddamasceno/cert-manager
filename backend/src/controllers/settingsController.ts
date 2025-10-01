import { Router } from 'express';
import config from '../config/config';

export const settingsController = Router();

settingsController.get('/', (_req, res) => {
  res.json({
    timezone: config.timezone,
    scheduler: config.scheduler,
    sheets: {
      spreadsheetId: config.googleSheetsId
    }
  });
});
