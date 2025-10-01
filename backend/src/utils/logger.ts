import { DateTime } from 'luxon';
import pino from 'pino';
import config from '../config/config';

const formatTimestamp = (): string => {
  const zoned = DateTime.now().setZone(config.timezone, { keepLocalTime: false });
  const target = zoned.isValid ? zoned : DateTime.now();
  const iso = target.toISO() ?? new Date().toISOString();
  return `,"time":"${iso}"`;
};

const logger = pino({
  level: config.logLevel,
  base: undefined,
  timestamp: formatTimestamp
});

export default logger;
