/**
 * Creates a debounced version of a function.
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  callback: T,
  waitMs: number,
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      callback(...args);
    }, waitMs);
  };
};
