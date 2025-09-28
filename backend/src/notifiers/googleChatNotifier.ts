import { Notifier } from './types';

export const createGoogleChatNotifier = (): Notifier => ({
  key: 'googlechat',
  async send() {
    throw new Error('Google Chat notifier not implemented in base setup');
  }
});
