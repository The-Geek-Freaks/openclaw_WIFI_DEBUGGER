import { pino, Logger } from 'pino';

export type UtilLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const logLevel = (process.env['LOG_LEVEL'] as UtilLogLevel) ?? 'info';

export const logger = pino({
  level: logLevel,
});

export function createChildLogger(module: string): Logger {
  return logger.child({ module });
}
