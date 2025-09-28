import { promises as fs } from 'node:fs';
import logger from './logger';

export const SCHEDULER_HEARTBEAT_PATH = '/tmp/scheduler-heartbeat.json';

type SchedulerHeartbeatStatus = 'starting' | 'success' | 'error' | 'disabled' | 'idle';

export const writeSchedulerHeartbeat = async (
  status: SchedulerHeartbeatStatus,
  detail?: Record<string, unknown>
): Promise<void> => {
  const payload = {
    status,
    detail,
    timestamp: new Date().toISOString()
  };

  try {
    await fs.writeFile(SCHEDULER_HEARTBEAT_PATH, JSON.stringify(payload));
  } catch (error) {
    logger.warn({ error }, 'Não foi possível atualizar o heartbeat do scheduler');
  }
};
