import cron from 'node-cron';
import config from '../config/env';
import logger from '../utils/logger';
import { jobErrorCounter, jobRunCounter } from '../utils/metrics';
import { AlertSchedulerJob } from './alertScheduler';
import { certificateService, alertModelService, notificationService, initializeServices } from '../services/container';
import { writeSchedulerHeartbeat } from '../utils/heartbeat';

const job = new AlertSchedulerJob(certificateService, alertModelService, notificationService);

export const runSchedulerOnce = async (): Promise<void> => {
  initializeServices();
  await writeSchedulerHeartbeat('starting');
  try {
    await job.run();
    jobRunCounter.inc();
    await writeSchedulerHeartbeat('success');
  } catch (error) {
    jobErrorCounter.inc();
    const message = error instanceof Error ? error.message : String(error);
    await writeSchedulerHeartbeat('error', { message });
    logger.error({ error }, 'Scheduler run failed');
  }
};

export const startScheduler = (): void => {
  if (!config.scheduler.enabled) {
    logger.info('Scheduler disabled via configuration');
    void writeSchedulerHeartbeat('disabled');
    return;
  }

  initializeServices();
  void writeSchedulerHeartbeat('idle');

  const interval = Math.max(1, Math.floor(config.scheduler.baseIntervalMinutes));
  const cronExpression = interval === 1 ? '* * * * *' : `*/${interval} * * * *`;

  cron.schedule(
    cronExpression,
    () => {
      logger.info({ cronExpression }, 'Executing scheduled alert job');
      void runSchedulerOnce();
    },
    { timezone: config.timezone }
  );

  logger.info('Scheduler initialized');
  setInterval(() => {
    void writeSchedulerHeartbeat('idle');
  }, 60000).unref();
};
