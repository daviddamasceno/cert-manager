import logger from './utils/logger';
import { startScheduler, runSchedulerOnce } from './jobs/runner';
import { ensureDefaultAlertModel } from './setup/bootstrap';

(async () => {
  logger.info('Bootstrapping scheduler worker');
  await ensureDefaultAlertModel();
  await runSchedulerOnce();
  startScheduler();
})();
