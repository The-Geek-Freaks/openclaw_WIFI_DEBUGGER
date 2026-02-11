import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  SkillError,
  ConnectionError,
  ConfigurationError,
  NetworkError,
  OperationTimeoutError,
  isRetryable,
  getErrorCode,
} from '../../src/utils/errors.js';

describe('SkillError', () => {
  it('should create error with code and message', () => {
    const error = new SkillError(ErrorCode.SSH_CONNECTION_FAILED, 'Connection failed');

    expect(error.code).toBe(ErrorCode.SSH_CONNECTION_FAILED);
    expect(error.message).toBe('Connection failed');
    expect(error.name).toBe('SkillError');
    expect(error.recoverable).toBe(false);
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it('should include context and cause', () => {
    const cause = new Error('Original error');
    const error = new SkillError(ErrorCode.DEVICE_NOT_FOUND, 'Device not found', {
      cause,
      context: { mac: '00:11:22:33:44:55' },
      recoverable: true,
    });

    expect(error.cause).toBe(cause);
    expect(error.context).toEqual({ mac: '00:11:22:33:44:55' });
    expect(error.recoverable).toBe(true);
  });

  it('should serialize to JSON correctly', () => {
    const error = new SkillError(ErrorCode.CONFIG_INVALID, 'Invalid config');
    const json = error.toJSON();

    expect(json.code).toBe(ErrorCode.CONFIG_INVALID);
    expect(json.message).toBe('Invalid config');
    expect(json.recoverable).toBe(false);
    expect(json.timestamp).toBeInstanceOf(Date);
  });

  it('should create from existing error', () => {
    const original = new Error('Something went wrong');
    const skillError = SkillError.fromError(original, ErrorCode.UNKNOWN_ERROR);

    expect(skillError.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(skillError.message).toBe('Something went wrong');
    expect(skillError.cause).toBe(original);
  });

  it('should return same error if already SkillError', () => {
    const original = new SkillError(ErrorCode.SSH_AUTH_FAILED, 'Auth failed');
    const result = SkillError.fromError(original);

    expect(result).toBe(original);
  });
});

describe('ConnectionError', () => {
  it('should be recoverable by default', () => {
    const error = new ConnectionError(
      ErrorCode.SSH_CONNECTION_FAILED,
      'SSH connection failed'
    );

    expect(error.name).toBe('ConnectionError');
    expect(error.recoverable).toBe(true);
  });
});

describe('ConfigurationError', () => {
  it('should not be recoverable', () => {
    const error = new ConfigurationError('Missing required config');

    expect(error.name).toBe('ConfigurationError');
    expect(error.code).toBe(ErrorCode.CONFIG_INVALID);
    expect(error.recoverable).toBe(false);
  });
});

describe('NetworkError', () => {
  it('should be recoverable', () => {
    const error = new NetworkError(ErrorCode.NETWORK_SCAN_FAILED, 'Scan failed');

    expect(error.name).toBe('NetworkError');
    expect(error.recoverable).toBe(true);
  });
});

describe('OperationTimeoutError', () => {
  it('should format message correctly', () => {
    const error = new OperationTimeoutError('SSH command', 5000);

    expect(error.name).toBe('OperationTimeoutError');
    expect(error.message).toContain('SSH command');
    expect(error.message).toContain('5000ms');
    expect(error.recoverable).toBe(true);
  });
});

describe('isRetryable', () => {
  it('should return true for recoverable SkillError', () => {
    const error = new ConnectionError(ErrorCode.SSH_CONNECTION_FAILED, 'Failed');
    expect(isRetryable(error)).toBe(true);
  });

  it('should return false for non-recoverable SkillError', () => {
    const error = new ConfigurationError('Invalid');
    expect(isRetryable(error)).toBe(false);
  });

  it('should return true for timeout errors', () => {
    const error = new Error('Connection timeout');
    expect(isRetryable(error)).toBe(true);
  });

  it('should return true for ECONNRESET errors', () => {
    const error = new Error('read ECONNRESET');
    expect(isRetryable(error)).toBe(true);
  });

  it('should return false for unknown errors', () => {
    const error = new Error('Some random error');
    expect(isRetryable(error)).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isRetryable('string error')).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe('getErrorCode', () => {
  it('should return code from SkillError', () => {
    const error = new SkillError(ErrorCode.ZIGBEE_SCAN_FAILED, 'Failed');
    expect(getErrorCode(error)).toBe(ErrorCode.ZIGBEE_SCAN_FAILED);
  });

  it('should return UNKNOWN_ERROR for regular errors', () => {
    const error = new Error('Regular error');
    expect(getErrorCode(error)).toBe(ErrorCode.UNKNOWN_ERROR);
  });

  it('should return UNKNOWN_ERROR for non-errors', () => {
    expect(getErrorCode('string')).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(getErrorCode(null)).toBe(ErrorCode.UNKNOWN_ERROR);
  });
});

describe('ErrorCode values', () => {
  it('should have correct ranges', () => {
    expect(ErrorCode.SSH_CONNECTION_FAILED).toBeGreaterThanOrEqual(1000);
    expect(ErrorCode.SSH_CONNECTION_FAILED).toBeLessThan(2000);

    expect(ErrorCode.CONFIG_MISSING).toBeGreaterThanOrEqual(2000);
    expect(ErrorCode.CONFIG_MISSING).toBeLessThan(3000);

    expect(ErrorCode.NETWORK_SCAN_FAILED).toBeGreaterThanOrEqual(3000);
    expect(ErrorCode.NETWORK_SCAN_FAILED).toBeLessThan(4000);

    expect(ErrorCode.ZIGBEE_SCAN_FAILED).toBeGreaterThanOrEqual(4000);
    expect(ErrorCode.ZIGBEE_SCAN_FAILED).toBeLessThan(5000);

    expect(ErrorCode.UNKNOWN_ERROR).toBeGreaterThanOrEqual(9000);
  });
});
