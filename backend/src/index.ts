import config from './config/config';
import logger from './utils/logger';
import { createApp } from './app';
import { startScheduler } from './jobs/runner';
import { ensureDefaultAlertModel } from './setup/bootstrap';

const hintForBootstrapError = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const message =
    (error as { message?: string }).message || (error instanceof Error ? error.message : undefined);

  if (!message) {
    return undefined;
  }

  if (message.includes('Unable to parse range')) {
    return 'As abas esperadas no Google Sheets não foram encontradas. Execute "npm run seed:sheets" para criar a estrutura inicial.';
  }

  if (message.includes('The caller does not have permission')) {
    return 'A Service Account não tem acesso à planilha. Compartilhe o Google Sheets com o e-mail da conta de serviço (permissão Editor).';
  }

  return undefined;
};

const bootstrap = (): void => {
  const app = createApp();

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server listening');
  });

  startScheduler();

  void ensureDefaultAlertModel().catch((error) => {
    const hint = hintForBootstrapError(error);
    logger.error(
      {
        error,
        hint
      },
      'Falha ao garantir o modelo de alerta padrão durante o bootstrap'
    );
  });
};

bootstrap();
