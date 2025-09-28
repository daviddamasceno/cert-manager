import { NotificationContext } from '../domain/types';

export interface Notifier {
  key: string;
  send(message: string, recipients: string[], context: NotificationContext): Promise<void>;
}

export type NotifierFactory = () => Notifier;
