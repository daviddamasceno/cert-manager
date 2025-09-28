import { Notifier, NotifierFactory } from './types';

export class NotifierRegistry {
  private readonly factories = new Map<string, NotifierFactory>();

  register(key: string, factory: NotifierFactory): void {
    this.factories.set(key, factory);
  }

  getNotifiersForChannels(_channels: string[]): Notifier[] {
    return [];
  }
}

export const notifierRegistry = new NotifierRegistry();
