/**
 * Wraps a promise-like value with a timeout.
 *
 * If the operation does not settle within the specified number
 * of milliseconds, the returned promise rejects with a timeout Error.
 *
 * If {@link timeoutMs} is not finite or is less than or equal to zero,
 * the original promise is returned as-is.
 *
 * Accepts PromiseLike values (for example VS Code Thenables)
 * and normalizes them through Promise.resolve.
 */

export const isTimeoutEnabled = (timeoutMs: number): boolean => {
  return Number.isFinite(timeoutMs) && timeoutMs > 0;
};

/**
 * Creates a standardized timeout error.
 */
export const createTimeoutError = (
  timeoutMs: number,
  message?: string,
): Error => {
  return new Error(message ?? `Operation timed out after ${timeoutMs} ms`);
};

/**
 * Creates a promise that rejects after the specified timeout.
 */
export const createTimeoutPromise = (
  timeoutMs: number,
  message?: string,
): {
  timeoutPromise: Promise<never>;
  cancelTimeout: () => void;
} => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(createTimeoutError(timeoutMs, message));
    }, timeoutMs);
  });

  const cancelTimeout = (): void => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  };

  return {
    timeoutPromise,
    cancelTimeout,
  };
};

/**
 * Wraps a promise-like value with a timeout.
 *
 * @template T
 * @param input
 * The input promise-like to wrap with a timeout.
 *
 * @param timeoutMs
 * The timeout in milliseconds.
 *
 * Non-positive or non-finite values disable the timeout.
 *
 * @param message
 * Optional custom error message for the timeout rejection.
 *
 * @returns
 * A promise that resolves/rejects with the original promise,
 * or rejects on timeout.
 *
 * @throws {Error}
 * If the operation times out.
 */
export const promiseWithTimeout = async <T>(
  input: PromiseLike<T>,
  timeoutMs: number,
  message?: string,
): Promise<T> => {
  if (!isTimeoutEnabled(timeoutMs)) {
    return Promise.resolve(input);
  }

  const normalizedPromise = Promise.resolve(input);

  const { timeoutPromise, cancelTimeout } = createTimeoutPromise(
    timeoutMs,
    message,
  );

  try {
    return (await Promise.race([normalizedPromise, timeoutPromise])) as T;
  } finally {
    cancelTimeout();
  }
};
