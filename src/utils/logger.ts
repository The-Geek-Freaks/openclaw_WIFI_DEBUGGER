import { pino, Logger, destination, type DestinationStream } from 'pino';
import * as fs from 'fs';
import * as path from 'path';

export type UtilLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const logLevel = (process.env['LOG_LEVEL'] as UtilLogLevel) ?? 'info';
const logDir = process.env['OPENCLAW_LOG_DIR'] ?? './logs';
const logToFile = process.env['OPENCLAW_LOG_FILE'] !== 'false';

// Ensure log directory exists
if (logToFile) {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch {
    // Fallback: disable file logging if directory creation fails
  }
}

// Generate log filename with date
function getLogFilePath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(logDir, `openclaw-skill-${date}.log`);
}

// Create pino logger with file transport
const streams: Array<{ stream: DestinationStream }> = [
  { stream: process.stdout },
];

if (logToFile && fs.existsSync(logDir)) {
  try {
    const fileStream = destination({
      dest: getLogFilePath(),
      sync: false,
      mkdir: true,
    });
    streams.push({ stream: fileStream });
  } catch {
    // Fallback: stdout only
  }
}

export const logger = pino(
  {
    level: logLevel,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
  },
  pino.multistream(streams)
);

export function createChildLogger(module: string): Logger {
  return logger.child({ module });
}

/**
 * Log a skill action execution for proof that TypeScript is being called.
 * This creates a highly visible log entry with action details.
 */
export function logSkillAction(
  action: string,
  params: Record<string, unknown> | undefined,
  result: 'started' | 'success' | 'error',
  details?: Record<string, unknown>
): void {
  const skillLogger = createChildLogger('skill-action');
  const logEntry = {
    action,
    params: params ?? {},
    result,
    ...details,
    _proof: 'TypeScript skill executed',
    _timestamp: new Date().toISOString(),
    _pid: process.pid,
  };

  if (result === 'error') {
    skillLogger.error(logEntry, `[SKILL] ${action} - ${result.toUpperCase()}`);
  } else if (result === 'started') {
    skillLogger.info(logEntry, `[SKILL] ${action} - STARTED`);
  } else {
    skillLogger.info(logEntry, `[SKILL] ${action} - SUCCESS`);
  }
}

/**
 * Get the current log file path for reference
 */
export function getCurrentLogFile(): string {
  return getLogFilePath();
}
