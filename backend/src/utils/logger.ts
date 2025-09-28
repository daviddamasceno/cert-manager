import pino from 'pino';
import config from '../config/env';

const logger = pino({
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime
});

export default logger;
