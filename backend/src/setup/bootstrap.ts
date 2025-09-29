import logger from '../utils/logger';
import { alertModelService } from '../services/container';

const DEFAULT_ALERT_MODEL_NAME = '30 dias antes';

export const ensureDefaultAlertModel = async (): Promise<void> => {
  const models = await alertModelService.list();
  const exists = models.some((model) => model.name === DEFAULT_ALERT_MODEL_NAME);
  if (exists) {
    return;
  }

  await alertModelService.create(
    {
      name: DEFAULT_ALERT_MODEL_NAME,
      offsetDaysBefore: 30,
      templateSubject: 'Alerta: certificado {{name}} vence em {{days_left}} dias',
      templateBody:
        'Olá,\n\nO certificado {{name}} irá expirar em {{days_left}} dias ({{expires_at}}).\nPor favor, providencie a renovação.\n\nEquipe Cert Manager.',
      offsetDaysAfter: undefined,
      repeatEveryDays: 7,
      scheduleType: 'hourly',
      scheduleTime: undefined,
      enabled: true
    },
    { id: 'system', email: 'system@local', ip: 'bootstrap', userAgent: 'bootstrap/setup' }
  );

  logger.info('Default alert model created');
};
