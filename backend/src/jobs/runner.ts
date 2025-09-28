import cron from 'node-cron';
import config from '../config/env';
import logger from '../utils/logger';
import { jobErrorCounter, jobRunCounter } from '../utils/metrics';
import { AlertSchedulerJob } from './alertScheduler';
import { certificateService, alertModelService, notificationService, initializeServices } from '../services/container';

const job = new AlertSchedulerJob(certificateService, alertModelService, notificationService);

export const runSchedulerOnce = async (): Promise<void> => {
  initializeServices();
  try {
    await job.run();
    jobRunCounter.inc();
  } catch (error) {
    jobErrorCounter.inc();
    logger.error({ error }, 'Scheduler run failed');
  }
};

export const startScheduler = (): void => {
  if (!config.scheduler.enabled) {
    logger.info('Scheduler disabled via configuration');
    return;
  }

  initializeServices();

  cron.schedule(config.scheduler.hourlyCron, () => {
    logger.info('Executing hourly scheduler job');
    void runSchedulerOnce();
  });

  cron.schedule(config.scheduler.dailyCron, () => {
    logger.info('Executing daily scheduler job');
    void runSchedulerOnce();
  });

  logger.info('Scheduler initialized');
};
