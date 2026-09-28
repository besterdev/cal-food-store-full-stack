import { ServiceUnavailableError } from "../ordering/order.js";

export const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new ServiceUnavailableError("request timed out"));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};
