import logger from '../utils/logger';
import { alertModelService } from '../services/container';

const DEFAULT_ALERT_MODEL_NAME = '30 dias antes';

export const ensureDefaultAlertModel = async (): Promise<void> => {
  const models = await alertModelService.list();
  const exists = models.some((model) => model.name === DEFAULT_ALERT_MODEL_NAME);
  if (exists) {
    return;
  }

  await alertModelService.create({
    name: DEFAULT_ALERT_MODEL_NAME,
    offsetDaysBefore: 30,
    templateSubject: 'Alerta: certificado {{name}} vence em {{days_left}} dias',
    templateBody:
      'Ol?,\n\nO certificado {{name}} ir? expirar em {{days_left}} dias ({{expires_at}}).\nPor favor, providencie a renova??o.\n\nEquipe Cert Manager.',
    offsetDaysAfter: undefined,
    repeatEveryDays: 7
  });

  logger.info('Default alert model created');
};
