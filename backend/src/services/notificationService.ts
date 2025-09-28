import { AlertModel, Certificate } from '../domain/types';
import { AuditService } from './auditService';
import logger from '../utils/logger';

interface TemplateContext {
  certificate: Certificate;
  alertModel: AlertModel;
  daysLeft: number;
}

const PLACEHOLDER_REGEX = /{{\s*(\w+)\s*}}/g;

export class NotificationService {
  constructor(private readonly auditService: AuditService) {}

  private renderTemplate(template: string, context: TemplateContext): string {
    return template.replace(PLACEHOLDER_REGEX, (_match, key) => {
      switch (key) {
        case 'name':
          return context.certificate.name;
        case 'expires_at':
          return context.certificate.expiresAt;
        case 'days_left':
          return String(context.daysLeft);
        default:
          return '';
      }
    });
  }

  async sendAlerts(certificate: Certificate, alertModel: AlertModel, daysLeft: number): Promise<void> {
    if (!certificate.channelIds.length) {
      logger.warn({ certificate: certificate.id }, 'No channel instances linked to certificate');
      return;
    }

    const message = this.renderTemplate(alertModel.templateBody, { certificate, alertModel, daysLeft });
    logger.info({ certificate: certificate.id, messageLength: message.length }, 'Notification dispatch queued');

    await this.auditService.record({
      actorUserId: 'system',
      actorEmail: 'system@local',
      entity: 'certificate',
      entityId: certificate.id,
      action: 'notification_sent',
      diff: {
        channelIds: { new: certificate.channelIds }
      },
      note: `Alert triggered for ${certificate.name}`
    });
  }
}
