export enum ErrorCode {
  // Connection Errors (1xxx)
  SSH_CONNECTION_FAILED = 1001,
  SSH_COMMAND_TIMEOUT = 1002,
  SSH_AUTH_FAILED = 1003,
  HASS_CONNECTION_FAILED = 1010,
  HASS_AUTH_FAILED = 1011,
  HASS_WEBSOCKET_ERROR = 1012,
  SNMP_CONNECTION_FAILED = 1020,
  SNMP_TIMEOUT = 1021,

  // Configuration Errors (2xxx)
  CONFIG_MISSING = 2001,
  CONFIG_INVALID = 2002,
  CONFIG_VALIDATION_FAILED = 2003,

  // Network Errors (3xxx)
  NETWORK_SCAN_FAILED = 3001,
  DEVICE_NOT_FOUND = 3002,
  NODE_NOT_FOUND = 3003,
  CHANNEL_CHANGE_FAILED = 3004,

  // Zigbee Errors (4xxx)
  ZIGBEE_SCAN_FAILED = 4001,
  ZIGBEE_DEVICE_NOT_FOUND = 4002,
  ZIGBEE_CHANNEL_CONFLICT = 4003,

  // Optimization Errors (5xxx)
  OPTIMIZATION_NOT_FOUND = 5001,
  OPTIMIZATION_FAILED = 5002,
  OPTIMIZATION_ROLLBACK_FAILED = 5003,

  // General Errors (9xxx)
  UNKNOWN_ERROR = 9000,
  NOT_INITIALIZED = 9001,
  INVALID_PARAMETER = 9002,
  OPERATION_CANCELLED = 9003,
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  cause?: Error | undefined;
  context?: Record<string, unknown> | undefined;
  timestamp: Date;
  recoverable: boolean;
}

export class SkillError extends Error {
  readonly code: ErrorCode;
  readonly cause?: Error | undefined;
  readonly context?: Record<string, unknown> | undefined;
  readonly timestamp: Date;
  readonly recoverable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      cause?: Error;
      context?: Record<string, unknown>;
      recoverable?: boolean;
    }
  ) {
    super(message);
    this.name = 'SkillError';
    this.code = code;
    this.cause = options?.cause;
    this.context = options?.context;
    this.timestamp = new Date();
    this.recoverable = options?.recoverable ?? false;

    Error.captureStackTrace?.(this, SkillError);
  }

  toJSON(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      cause: this.cause,
      context: this.context,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
    };
  }

  static fromError(err: Error, code: ErrorCode = ErrorCode.UNKNOWN_ERROR): SkillError {
    if (err instanceof SkillError) return err;
    return new SkillError(code, err.message, { cause: err });
  }
}

export class ConnectionError extends SkillError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: { cause?: Error; context?: Record<string, unknown> }
  ) {
    super(code, message, { ...options, recoverable: true });
    this.name = 'ConnectionError';
  }
}

export class ConfigurationError extends SkillError {
  constructor(
    message: string,
    options?: { cause?: Error; context?: Record<string, unknown> }
  ) {
    super(ErrorCode.CONFIG_INVALID, message, { ...options, recoverable: false });
    this.name = 'ConfigurationError';
  }
}

export class NetworkError extends SkillError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: { cause?: Error; context?: Record<string, unknown> }
  ) {
    super(code, message, { ...options, recoverable: true });
    this.name = 'NetworkError';
  }
}

export class OperationTimeoutError extends SkillError {
  constructor(
    operation: string,
    timeoutMs: number,
    options?: { cause?: Error; context?: Record<string, unknown> }
  ) {
    super(
      ErrorCode.SSH_COMMAND_TIMEOUT,
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      { ...options, recoverable: true }
    );
    this.name = 'OperationTimeoutError';
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof SkillError) {
    return error.recoverable;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout')
    );
  }
  return false;
}

export function getErrorCode(error: unknown): ErrorCode {
  if (error instanceof SkillError) {
    return error.code;
  }
  return ErrorCode.UNKNOWN_ERROR;
}
