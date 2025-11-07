// Smart retry logic with exponential backoff and adjustments

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  shouldRetry: (error: Error, attempt: number) => boolean;
  onRetry?: (attempt: number, adjustments: RetryAdjustments) => void;
}

export interface RetryAdjustments {
  increaseSlippage?: number;
  increasePriorityFee?: number;
  increaseBribe?: number;
}

const defaultConfig: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  maxDelayMs: 10000,
  backoffMultiplier: 1.5,
  shouldRetry: () => true,
};

// Calculate retry delay with exponential backoff
export const calculateRetryDelay = (
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number
): number => {
  const delay = Math.min(
    baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
    maxDelayMs
  );
  // Add jitter (±20%) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
};

// Determine adjustments based on attempt number and error type
export const calculateRetryAdjustments = (
  attempt: number,
  error: Error,
  currentSlippage: number,
  currentPriorityFee: number
): RetryAdjustments => {
  const adjustments: RetryAdjustments = {};

  // Increase slippage progressively
  if (error.message.includes('slippage') || error.message.includes('Slippage')) {
    // Attempt 1: 1.5x, Attempt 2: 2x, Attempt 3: 3x
    adjustments.increaseSlippage = currentSlippage * (1 + attempt * 0.5);
  } else {
    // For other errors, increase modestly
    adjustments.increaseSlippage = currentSlippage * (1 + attempt * 0.2);
  }

  // Cap slippage at 50%
  if (adjustments.increaseSlippage) {
    adjustments.increaseSlippage = Math.min(adjustments.increaseSlippage, 50);
  }

  // Increase priority fee for network/timeout errors
  if (
    error.message.includes('timeout') ||
    error.message.includes('Timeout') ||
    error.message.includes('network') ||
    error.message.includes('congestion')
  ) {
    // Double priority fee each attempt
    adjustments.increasePriorityFee = currentPriorityFee * Math.pow(2, attempt);
    // Cap at 0.1 SOL
    adjustments.increasePriorityFee = Math.min(adjustments.increasePriorityFee, 0.1);
  }

  return adjustments;
};

// Main retry function with adjustments
export async function retryWithBackoff<T>(
  operation: (adjustments?: RetryAdjustments) => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: {
    slippage: number;
    priorityFee: number;
  }
): Promise<T> {
  const finalConfig = { ...defaultConfig, ...config };
  let lastError: Error;
  let attempt = 0;

  while (attempt < finalConfig.maxAttempts) {
    attempt++;
    
    try {
      // Calculate adjustments for this attempt
      const adjustments = context && attempt > 1 && lastError!
        ? calculateRetryAdjustments(
            attempt,
            lastError!,
            context.slippage,
            context.priorityFee
          )
        : undefined;

      // Notify about retry
      if (finalConfig.onRetry && attempt > 1) {
        finalConfig.onRetry(attempt, adjustments || {});
      }

      return await operation(adjustments);
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      if (
        attempt >= finalConfig.maxAttempts ||
        !finalConfig.shouldRetry(lastError, attempt)
      ) {
        throw lastError;
      }

      // Calculate delay
      const delay = calculateRetryDelay(
        attempt,
        finalConfig.baseDelayMs,
        finalConfig.maxDelayMs,
        finalConfig.backoffMultiplier
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Determine if error is retryable
export const isRetryableError = (error: Error): boolean => {
  const errorMsg = error.message.toLowerCase();

  // Network errors - always retry
  if (
    errorMsg.includes('network') ||
    errorMsg.includes('timeout') ||
    errorMsg.includes('fetch failed') ||
    errorMsg.includes('connection')
  ) {
    return true;
  }

  // Transaction errors - retry with adjustments
  if (
    errorMsg.includes('slippage') ||
    errorMsg.includes('tx failed') ||
    errorMsg.includes('transaction failed')
  ) {
    return true;
  }

  // Pool availability - retry
  if (
    errorMsg.includes('pool unavailable') ||
    errorMsg.includes('pool not found')
  ) {
    return true;
  }

  // Service errors - retry
  if (
    errorMsg.includes('service unavailable') ||
    errorMsg.includes('internal server error')
  ) {
    return true;
  }

  // Don't retry validation errors
  if (
    errorMsg.includes('insufficient balance') ||
    errorMsg.includes('amount too small') ||
    errorMsg.includes('no holdings') ||
    errorMsg.includes('validation error')
  ) {
    return false;
  }

  // Default: retry
  return true;
};

