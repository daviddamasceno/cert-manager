import { DateTime } from 'luxon';
import config from '../config/env';

const zone = config.timezone;

export const now = (): DateTime => DateTime.now().setZone(zone);

export const isoNow = (): string => now().toISO() || new Date().toISOString();

export const parseDate = (dateStr: string): DateTime => DateTime.fromISO(dateStr, { zone });

export const formatDate = (date: DateTime): string => date.setZone(zone).toISODate() || date.toISODate() || '';

export const daysBetween = (from: DateTime, to: DateTime): number => to.startOf('day').diff(from.startOf('day'), 'days').days;
