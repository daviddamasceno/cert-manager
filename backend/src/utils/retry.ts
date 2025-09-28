export interface RetryOptions {
  retries?: number;
  minTimeoutMs?: number;
  factor?: number;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    minTimeoutMs = 200,
    factor = 2
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= retries) {
        break;
      }
      const delay = minTimeoutMs * Math.pow(factor, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
