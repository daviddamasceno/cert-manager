import config from './config/env';
import logger from './utils/logger';
import { createApp } from './app';
import { startScheduler } from './jobs/runner';
import { ensureDefaultAlertModel } from './setup/bootstrap';

const bootstrap = async () => {
  const app = createApp();

  await ensureDefaultAlertModel();

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server listening');
  });

  startScheduler();
};

void bootstrap();
