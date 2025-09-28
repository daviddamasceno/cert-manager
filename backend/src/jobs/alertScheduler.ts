import logger from '../utils/logger';
import { parseDate, now } from '../utils/time';
import { AlertModelService } from '../services/alertModelService';
import { CertificateService } from '../services/certificateService';
import { NotificationService } from '../services/notificationService';
import { AlertModel } from '../domain/types';

export class AlertSchedulerJob {
  constructor(
    private readonly certificateService: CertificateService,
    private readonly alertModelService: AlertModelService,
    private readonly notificationService: NotificationService
  ) {}

  async run(): Promise<void> {
    logger.info('Running alert scheduler job');

    const [certificates, alertModels] = await Promise.all([
      this.certificateService.list(),
      this.alertModelService.list()
    ]);

    const alertMap = new Map(alertModels.map((model) => [model.id, model]));

    for (const certificate of certificates) {
      if (!certificate.alertModelId) {
        continue;
      }

      const model = alertMap.get(certificate.alertModelId);
      if (!model) {
        logger.warn({ certificate: certificate.id }, 'Alert model not found for certificate');
        continue;
      }

      const expiresAt = parseDate(certificate.expiresAt);
      if (!expiresAt.isValid) {
        logger.error({ certificate: certificate.id }, 'Invalid expiration date');
        continue;
      }

      const diff = Math.floor(expiresAt.diff(now().startOf('day'), 'days').days);
      const daysLeft = diff;

      const shouldSend = this.shouldSendNotification(daysLeft, model);
      if (shouldSend) {
        try {
          await this.notificationService.sendAlerts(certificate, model, daysLeft, {
            id: 'system',
            email: 'system@local',
            ip: 'scheduler',
            userAgent: 'alert-scheduler'
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error({ certificate: certificate.id, error: message }, 'Failed to send scheduled notification');
        }
      }
    }
  }

  private shouldSendNotification(daysLeft: number, model: AlertModel): boolean {
    if (model.offsetDaysBefore >= 0 && daysLeft === model.offsetDaysBefore) {
      return true;
    }

    if (model.offsetDaysAfter && model.offsetDaysAfter >= 0 && daysLeft === -model.offsetDaysAfter) {
      return true;
    }

    if (model.repeatEveryDays && model.repeatEveryDays > 0) {
      if (daysLeft < model.offsetDaysBefore && daysLeft >= 0) {
        const diff = model.offsetDaysBefore - daysLeft;
        if (diff > 0 && diff % model.repeatEveryDays === 0) {
          return true;
        }
      }

      if (daysLeft < 0) {
        const diff = Math.abs(daysLeft);
        if (diff % model.repeatEveryDays === 0) {
          return true;
        }
      }
    }

    return false;
  }
}
