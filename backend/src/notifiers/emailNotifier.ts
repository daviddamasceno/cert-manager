import { Notifier } from './types';

export const createEmailNotifier = (): Notifier => ({
  key: 'email',
  async send() {
    throw new Error('Email notifier not implemented in base setup');
  }
});
