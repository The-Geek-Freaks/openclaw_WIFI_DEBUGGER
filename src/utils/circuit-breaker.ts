import { createChildLogger } from './logger.js';

const logger = createChildLogger('circuit-breaker');

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeoutMs: number;
  /** Time in ms for half-open test */
  halfOpenTimeoutMs: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in ms before first retry */
  baseDelayMs: number;
  /** Maximum delay in ms between retries */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Optional: errors that should not trigger retry */
  nonRetryableErrors?: string[];
}

const DEFAULT_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenTimeoutMs: 5000,
};

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  nonRetryableErrors: ['Authentication failed', 'Permission denied', 'Invalid command'],
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private readonly options: CircuitBreakerOptions;
  private readonly name: string;

  constructor(name: string, options: Partial<CircuitBreakerOptions> = {}) {
    this.name = name;
    this.options = { ...DEFAULT_CIRCUIT_OPTIONS, ...options };
  }

  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  private updateState(): void {
    if (this.state === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.options.resetTimeoutMs) {
        this.state = 'half-open';
        this.successCount = 0;
        logger.info({ name: this.name }, 'Circuit breaker transitioning to half-open');
      }
    }
  }

  canExecute(): boolean {
    this.updateState();
    return this.state !== 'open';
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'closed';
        this.failureCount = 0;
        logger.info({ name: this.name }, 'Circuit breaker closed after successful recovery');
      }
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      logger.warn({ name: this.name }, 'Circuit breaker re-opened after half-open failure');
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'open';
      logger.warn({ 
        name: this.name, 
        failureCount: this.failureCount,
        resetTimeoutMs: this.options.resetTimeoutMs,
      }, 'Circuit breaker opened');
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    logger.info({ name: this.name }, 'Circuit breaker manually reset');
  }

  getStats(): { state: CircuitState; failureCount: number; lastFailureTime: number } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.baseDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      // Check if error is non-retryable
      const isNonRetryable = opts.nonRetryableErrors?.some(
        pattern => lastError!.message.includes(pattern)
      );
      
      if (isNonRetryable) {
        logger.debug({ error: lastError.message }, 'Non-retryable error, failing immediately');
        throw lastError;
      }

      if (attempt < opts.maxRetries) {
        logger.debug({ 
          attempt: attempt + 1, 
          maxRetries: opts.maxRetries,
          delayMs: delay,
          error: lastError.message,
        }, 'Retrying operation after failure');
        
        await sleep(delay);
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
      }
    }
  }

  throw lastError ?? new Error('Operation failed after retries');
}

export async function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  operation: () => Promise<T>,
  retryOptions?: Partial<RetryOptions>
): Promise<T> {
  if (!breaker.canExecute()) {
    throw new Error(`Circuit breaker is open, operation blocked`);
  }

  try {
    const result = await withRetry(operation, retryOptions);
    breaker.recordSuccess();
    return result;
  } catch (err) {
    breaker.recordFailure();
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
