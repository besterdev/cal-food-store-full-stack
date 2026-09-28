import { ServiceUnavailableError } from "../modules/ordering/order.js";

/**
 * Run work under a timeout. AbortSignal is aborted when the deadline elapses
 * so callers can cancel in-flight I/O (for example PostgreSQL queries).
 */
export const runWithTimeout = async <T>(
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new ServiceUnavailableError("request timed out"));
  }, ms);

  try {
    return await run(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ServiceUnavailableError("request timed out", err);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};
