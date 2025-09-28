import { Notifier } from './types';

export const createSlackNotifier = (): Notifier => ({
  key: 'slack',
  async send() {
    throw new Error('Slack notifier not implemented in base setup');
  }
});
