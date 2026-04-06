export class QueryTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      `Query timed out after ${Math.ceil(timeoutMs / 1000)} seconds. Simplify your query.`,
    );
    this.name = "QueryTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isInterruptError(error: unknown): boolean {
  return error instanceof Error && /interrupt(ed)?/i.test(error.message);
}

export function executeWithTimeout<T>(
  fn: () => T,
  timeoutMs: number,
  onTimeout: () => void,
): T {
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    onTimeout();
  }, timeoutMs);

  try {
    return fn();
  } catch (error) {
    if (timedOut && isInterruptError(error)) {
      throw new QueryTimeoutError(timeoutMs);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
