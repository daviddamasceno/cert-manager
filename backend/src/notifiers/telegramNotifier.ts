import { Notifier } from './types';

export const createTelegramNotifier = (): Notifier => ({
  key: 'telegram',
  async send() {
    throw new Error('Telegram notifier not implemented in base setup');
  }
});
