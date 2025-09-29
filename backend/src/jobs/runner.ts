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

  const interval = config.scheduler.intervalMinutes;
  if (interval > 1) {
    logger.warn(
      {
        configuredInterval: interval
      },
      'SCHEDULER_INTERVAL_MINUTES>1 incompatível com horários diários; executando a cada minuto.'
    );
  }

  let isRunning = false;
  cron.schedule('* * * * *', async () => {
    if (isRunning) {
      logger.warn('Ignorando tick do scheduler — execução anterior ainda em andamento');
      return;
    }

    isRunning = true;
    logger.info({ intervalMinutes: interval }, 'Executando tick do scheduler');
    try {
      await runSchedulerOnce();
    } finally {
      isRunning = false;
    }
  });

  logger.info('Scheduler inicializado (tick a cada 1 minuto)');
  setInterval(() => {
    void writeSchedulerHeartbeat('idle');
  }, 60000).unref();
};
