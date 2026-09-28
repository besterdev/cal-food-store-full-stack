import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

/** Run a parameterized query; reject promptly when AbortSignal fires. */
export const query = async <T extends QueryResultRow = QueryResultRow>(
  target: Pool | PoolClient,
  text: string,
  values?: unknown[],
  signal?: AbortSignal,
): Promise<QueryResult<T>> => {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("aborted");
  }

  const resultPromise =
    values === undefined
      ? target.query<T>(text)
      : target.query<T>(text, values);

  if (!signal) {
    return resultPromise;
  }

  return new Promise<QueryResult<T>>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason ?? new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    resultPromise.then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
};
