import { asServiceUnavailable } from "../../modules/ordering/order.js";

export const classifyDbError = (operation: string, err: unknown) =>
  asServiceUnavailable(
    new Error(
      `${operation}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    ),
  );
