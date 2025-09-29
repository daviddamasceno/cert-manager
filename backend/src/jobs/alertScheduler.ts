import { DateTime } from 'luxon';
import logger from '../utils/logger';
import { parseDate, now } from '../utils/time';
import { AlertModelService } from '../services/alertModelService';
import { CertificateService } from '../services/certificateService';
import { NotificationService } from '../services/notificationService';
import { AlertModel } from '../domain/types';

const DISABLED_ALERT_MODEL_ID = 'disabled';

type DispatchTracker = {
  timestampIso: string;
  scheduleType: 'hourly' | 'daily';
  scheduleTime: string | null;
};

export class AlertSchedulerJob {
  private readonly lastDispatchByCertificate = new Map<string, DispatchTracker>();

  constructor(
    private readonly certificateService: CertificateService,
    private readonly alertModelService: AlertModelService,
    private readonly notificationService: NotificationService
  ) {}

  async run(): Promise<void> {
    const tickTime = now().set({ second: 0, millisecond: 0 });
    logger.info({ tick: this.formatIso(tickTime) }, 'Running alert scheduler job');

    const [certificates, alertModels] = await Promise.all([
      this.certificateService.list(),
      this.alertModelService.list()
    ]);

    const alertMap = new Map(alertModels.map((model) => [model.id, model]));

    for (const certificate of certificates) {
      if (!certificate.alertModelId || certificate.alertModelId === DISABLED_ALERT_MODEL_ID) {
        continue;
      }

      const model = alertMap.get(certificate.alertModelId);
      if (!model) {
        logger.warn({ certificate: certificate.id }, 'Alert model not found for certificate');
        continue;
      }

      if (!model.enabled) {
        continue;
      }

      if (!this.shouldExecuteModelAtTick(model, tickTime)) {
        continue;
      }

      if (this.alreadyDispatched(certificate.id, model, tickTime)) {
        continue;
      }

      const expiresAt = parseDate(certificate.expiresAt);
      if (!expiresAt.isValid) {
        logger.error({ certificate: certificate.id }, 'Invalid expiration date');
        continue;
      }

      const diff = Math.floor(expiresAt.diff(tickTime.startOf('day'), 'days').days);
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
          this.markDispatched(certificate.id, model, tickTime);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error({ certificate: certificate.id, error: message }, 'Failed to send scheduled notification');
        }
      }
    }
  }

  private shouldExecuteModelAtTick(model: AlertModel, tickTime: DateTime): boolean {
    if (model.scheduleType === 'hourly') {
      return tickTime.minute === 0;
    }

    if (model.scheduleType === 'daily') {
      const scheduleMoment = this.resolveDailyScheduleMoment(model, tickTime);
      if (!scheduleMoment) {
        return false;
      }
      return scheduleMoment.hasSame(tickTime, 'minute');
    }

    return false;
  }

  private resolveDailyScheduleMoment(model: AlertModel, tickTime: DateTime): DateTime | null {
    if (!model.scheduleTime) {
      return null;
    }

    const [hourStr, minuteStr] = model.scheduleTime.split(':');
    const hour = Number.parseInt(hourStr, 10);
    const minute = Number.parseInt(minuteStr, 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      logger.warn(
        { model: model.id, scheduleTime: model.scheduleTime },
        'Invalid schedule_time detected for daily alert model'
      );
      return null;
    }

    return tickTime.set({ hour, minute, second: 0, millisecond: 0 });
  }

  private alreadyDispatched(certificateId: string, model: AlertModel, tickTime: DateTime): boolean {
    const entry = this.lastDispatchByCertificate.get(certificateId);
    if (!entry) {
      return false;
    }

    const lastDispatch = DateTime.fromISO(entry.timestampIso);
    if (!lastDispatch.isValid) {
      this.lastDispatchByCertificate.delete(certificateId);
      return false;
    }

    if (model.scheduleType === 'hourly') {
      if (entry.scheduleType !== 'hourly') {
        return false;
      }
      return tickTime.hasSame(lastDispatch, 'hour');
    }

    if (model.scheduleType === 'daily') {
      if (entry.scheduleType !== 'daily') {
        return false;
      }

      if (!model.scheduleTime) {
        return false;
      }

      if (entry.scheduleTime !== model.scheduleTime) {
        return false;
      }

      return tickTime.hasSame(lastDispatch, 'day');
    }

    return false;
  }

  private markDispatched(certificateId: string, model: AlertModel, tickTime: DateTime): void {
    this.lastDispatchByCertificate.set(certificateId, {
      timestampIso: this.formatIso(tickTime),
      scheduleType: model.scheduleType,
      scheduleTime: model.scheduleType === 'daily' ? model.scheduleTime ?? null : null
    });
  }

  private formatIso(datetime: DateTime): string {
    return (
      datetime.toISO() ||
      datetime.toUTC().toISO() ||
      datetime.toISODate() ||
      datetime.toString()
    );
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
