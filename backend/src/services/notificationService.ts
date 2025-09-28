import { AlertModel, Certificate } from '../domain/types';
import { AuditService } from './auditService';
import logger from '../utils/logger';
import {
  ChannelNotificationPayload,
  ChannelNotificationResult,
  ChannelService
} from './channelService';

interface TemplateContext {
  certificate: Certificate;
  alertModel: AlertModel;
  daysLeft: number;
}

const PLACEHOLDER_REGEX = /{{\s*(\w+)\s*}}/g;

export class NotificationService {
  constructor(
    private readonly auditService: AuditService,
    private readonly channelService: ChannelService
  ) {}

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

  private resolveEmailRecipients(ownerEmail: string | undefined): string[] {
    if (!ownerEmail) {
      return [];
    }
    return ownerEmail
      .split(/[,;]+/)
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
  }

  async sendAlerts(
    certificate: Certificate,
    alertModel: AlertModel,
    daysLeft: number,
    actor: { id: string; email: string }
  ): Promise<void> {
    if (!certificate.channelIds.length) {
      logger.warn({ certificate: certificate.id }, 'No channel instances linked to certificate');
      await this.auditService.record({
        actorUserId: actor.id,
        actorEmail: actor.email,
        entity: 'certificate',
        entityId: certificate.id,
        action: 'notification_sent',
        diff: {
          channelIds: { new: [] }
        },
        note: 'Alert dispatch skipped: certificate without linked channels'
      });
      return;
    }

    const context: TemplateContext = { certificate, alertModel, daysLeft };
    const body = this.renderTemplate(alertModel.templateBody, context);
    const subject = this.renderTemplate(alertModel.templateSubject, context);
    const emailRecipients = this.resolveEmailRecipients(certificate.ownerEmail);

    const results: Array<{ channelId: string; outcome: ChannelNotificationResult | null; error?: string }> = [];

    for (const channelId of certificate.channelIds) {
      const payload: ChannelNotificationPayload = {
        subject,
        message: body,
        email: { to: emailRecipients }
      };

      try {
        const outcome = await this.channelService.notifyChannel(
          channelId,
          payload,
          actor,
          { certificateId: certificate.id, certificateName: certificate.name }
        );
        results.push({ channelId, outcome });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ channelId, outcome: null, error: message });
        logger.error({ certificate: certificate.id, channelId, message }, 'Failed to dispatch notification');
      }
    }

    const sent = results.filter((item) => item.outcome);
    const failed = results.filter((item) => !item.outcome);

    const noteParts: string[] = [`alert_model=${alertModel.name}`, `days_left=${daysLeft}`];
    if (sent.length) {
      noteParts.push(
        `sent=[${sent
          .map((item) => `${item.channelId}:${item.outcome?.destination ?? 'unknown'}`)
          .join('; ')}]`
      );
    }
    if (failed.length) {
      noteParts.push(
        `failed=[${failed.map((item) => `${item.channelId}:${item.error ?? 'unknown error'}`).join('; ')}]`
      );
    }

    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'certificate',
      entityId: certificate.id,
      action: 'notification_sent',
      diff: {
        channelIds: { new: certificate.channelIds }
      },
      note: noteParts.join(' | ')
    });

    logger.info(
      {
        certificate: certificate.id,
        sent: sent.length,
        failed: failed.length
      },
      'Notification dispatch finished'
    );

    if (sent.length === 0) {
      throw new Error('Failed to send notifications to the linked channels');
    }
  }
}
