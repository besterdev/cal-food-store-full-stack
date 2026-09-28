import { randomBytes } from "node:crypto";

import express, {
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { ErrInvalidCatalog, type Product } from "../catalog/product.js";
import {
  ErrIdempotencyConflict,
  ErrInvalidIdempotencyKey,
  RedConflictError,
  ServiceUnavailableError,
  ValidationError,
  type FieldError,
  type PlaceOrderCommand,
  type Receipt,
} from "../ordering/order.js";
import type { OrderService } from "../ordering/service.js";

const REQUEST_ID_HEADER = "x-request-id";
const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
const MAX_ORDER_BODY_BYTES = 16 * 1024;

export interface AppDeps {
  listProducts: () => Promise<Product[]>;
  ready: () => Promise<void>;
  orders: OrderService;
  resetRedAvailability?: () => Promise<void>;
  allowedOrigins: string[];
  requestTimeoutMs?: number;
  readinessTimeoutMs?: number;
  logger?: {
    info: (message: string, fields?: Record<string, unknown>) => void;
  };
}

interface ErrorBody {
  code: string;
  message: string;
  request_id: string;
  field_errors?: FieldError[];
  available_at?: string;
}

export const createApp = (deps: AppDeps): Express => {
  const requestTimeoutMs = deps.requestTimeoutMs ?? 3000;
  const readinessTimeoutMs = deps.readinessTimeoutMs ?? 2000;
  const logger = deps.logger ?? { info: () => undefined };
  const allowed = new Set(
    deps.allowedOrigins.map((origin) => origin.trim()).filter(Boolean),
  );

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: MAX_ORDER_BODY_BYTES }));

  app.use((req, res, next) => {
    const incoming = req.header("X-Request-ID");
    const requestId =
      incoming && validRequestId(incoming) ? incoming : generateRequestId();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);
    next();
  });

  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      const fields: Record<string, unknown> = {
        request_id: res.locals.requestId,
        method: req.method,
        route: req.path,
        status_class: `${Math.floor(res.statusCode / 100)}xx`,
        duration_ms: Date.now() - started,
      };
      if (typeof res.locals.errorCode === "string") {
        fields.error_code = res.locals.errorCode;
      }
      logger.info("http request", fields);
    });
    next();
  });

  app.use((req, res, next) => {
    const origin = req.header("Origin");
    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Idempotency-Key,X-Request-ID",
      );
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Location,X-Request-ID",
      );
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
    }
    next();
  });

  app.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/health/ready", async (_req, res) => {
    try {
      await withTimeout(deps.ready(), readinessTimeoutMs);
      res.status(200).json({ status: "ok" });
    } catch {
      writeError(
        res,
        503,
        "SERVICE_UNAVAILABLE",
        "The service is temporarily unavailable.",
      );
    }
  });

  app.get("/api/v1/products", async (_req, res) => {
    try {
      const products = await withTimeout(deps.listProducts(), requestTimeoutMs);
      res.status(200).json({ products });
    } catch (err) {
      if (err === ErrInvalidCatalog) {
        writeError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
        return;
      }
      writeError(
        res,
        503,
        "SERVICE_UNAVAILABLE",
        "The service is temporarily unavailable.",
      );
    }
  });

  app.post("/api/v1/orders", async (req, res) => {
    const key = req.header("Idempotency-Key") ?? "";
    if (!validIdempotencyKeyHeader(key)) {
      writeError(
        res,
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key must contain 1 through 128 printable ASCII characters.",
        [
          {
            field: "Idempotency-Key",
            code: "REQUIRED",
            message: "header is required",
          },
        ],
      );
      return;
    }

    const decode = decodeCreateOrderRequest(req.body);
    if (!decode.ok) {
      writeError(res, 400, "MALFORMED_JSON", decode.message, decode.fieldErrors);
      return;
    }

    const command: PlaceOrderCommand = {
      idempotencyKey: key,
      lines: decode.request.lines.map((line) => ({
        productCode: line.product_code,
        quantity: line.quantity,
      })),
      memberCardNumber: decode.request.member_card_number ?? null,
    };

    try {
      const receipt = await withTimeout(
        deps.orders.placeOrder(command),
        requestTimeoutMs,
      );
      res.setHeader("Location", `/api/v1/orders/${receipt.orderId}`);
      res.status(201).json(toReceiptWire(receipt));
    } catch (err) {
      writeOrderError(res, err);
    }
  });

  if (deps.resetRedAvailability) {
    app.post("/api/v1/red-availability/reset", async (_req, res) => {
      try {
        await withTimeout(deps.resetRedAvailability!(), requestTimeoutMs);
        res.status(204).end();
      } catch {
        writeError(
          res,
          503,
          "SERVICE_UNAVAILABLE",
          "The service is temporarily unavailable.",
        );
      }
    });
  }

  const jsonSyntaxErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
    if (err instanceof SyntaxError || err?.type === "entity.parse.failed") {
      writeError(res, 400, "MALFORMED_JSON", "Request body is not valid JSON.");
      return;
    }
    if (err?.type === "entity.too.large") {
      writeError(res, 400, "MALFORMED_JSON", "Request body is too large.");
      return;
    }
    next(err);
  };
  app.use(jsonSyntaxErrorHandler);

  app.use(
    (
      _err: unknown,
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      writeError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
    },
  );

  return app;
};

interface CreateOrderLineWire {
  product_code: string;
  quantity: number;
}

interface CreateOrderRequestWire {
  lines: CreateOrderLineWire[];
  member_card_number?: string | null;
}

type DecodeResult =
  | { ok: true; request: CreateOrderRequestWire }
  | { ok: false; message: string; fieldErrors?: FieldError[] };

const decodeCreateOrderRequest = (body: unknown): DecodeResult => {
  if (body === undefined || body === null || typeof body !== "object") {
    return { ok: false, message: "Request body is not valid JSON." };
  }

  const record = body as Record<string, unknown>;
  const allowedKeys = new Set(["lines", "member_card_number"]);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        message: "Request body contains an unknown field.",
        fieldErrors: [
          { field: key, code: "UNKNOWN_FIELD", message: "field is not allowed" },
        ],
      };
    }
  }

  if (!("lines" in record)) {
    return {
      ok: false,
      message: "Request body contains an invalid field type.",
      fieldErrors: [
        { field: "lines", code: "INVALID_TYPE", message: "field has an invalid type" },
      ],
    };
  }

  if (!Array.isArray(record.lines)) {
    return {
      ok: false,
      message: "Request body contains an invalid field type.",
      fieldErrors: [
        { field: "lines", code: "INVALID_TYPE", message: "field has an invalid type" },
      ],
    };
  }

  const lines: CreateOrderLineWire[] = [];
  for (let index = 0; index < record.lines.length; index += 1) {
    const line = record.lines[index];
    if (line === null || typeof line !== "object" || Array.isArray(line)) {
      return {
        ok: false,
        message: "Request body contains an invalid field type.",
        fieldErrors: [
          {
            field: `lines[${index}]`,
            code: "INVALID_TYPE",
            message: "field has an invalid type",
          },
        ],
      };
    }
    const lineRecord = line as Record<string, unknown>;
    for (const key of Object.keys(lineRecord)) {
      if (key !== "product_code" && key !== "quantity") {
        return {
          ok: false,
          message: "Request body contains an unknown field.",
          fieldErrors: [
            {
              field: `lines[${index}].${key}`,
              code: "UNKNOWN_FIELD",
              message: "field is not allowed",
            },
          ],
        };
      }
    }
    if (typeof lineRecord.product_code !== "string") {
      return {
        ok: false,
        message: "Request body contains an invalid field type.",
        fieldErrors: [
          {
            field: `lines[${index}].product_code`,
            code: "INVALID_TYPE",
            message: "field has an invalid type",
          },
        ],
      };
    }
    if (
      typeof lineRecord.quantity !== "number" ||
      !Number.isInteger(lineRecord.quantity)
    ) {
      return {
        ok: false,
        message: "Request body contains an invalid field type.",
        fieldErrors: [
          {
            field: `lines[${index}].quantity`,
            code: "INVALID_TYPE",
            message: "field has an invalid type",
          },
        ],
      };
    }
    lines.push({
      product_code: lineRecord.product_code,
      quantity: lineRecord.quantity,
    });
  }

  let memberCardNumber: string | null | undefined;
  if ("member_card_number" in record) {
    const value = record.member_card_number;
    if (value !== null && typeof value !== "string") {
      return {
        ok: false,
        message: "Request body contains an invalid field type.",
        fieldErrors: [
          {
            field: "member_card_number",
            code: "INVALID_TYPE",
            message: "field has an invalid type",
          },
        ],
      };
    }
    memberCardNumber = value as string | null;
  }

  return {
    ok: true,
    request: {
      lines,
      ...(memberCardNumber !== undefined
        ? { member_card_number: memberCardNumber }
        : {}),
    },
  };
};

const toReceiptWire = (receipt: Receipt) => ({
  order_id: receipt.orderId,
  accepted_at: receipt.acceptedAt.toISOString(),
  currency: receipt.currency,
  lines: receipt.lines.map((line) => ({
    product_code: line.productCode,
    product_name: line.productName,
    quantity: line.quantity,
    unit_price_satang: line.unitPriceSatang,
    line_total_before_discount_satang: line.lineTotalBeforeDiscountSatang,
  })),
  total_before_discount_satang: receipt.totalBeforeDiscountSatang,
  pair_discounts: receipt.pairDiscounts.map((discount) => ({
    product_code: discount.productCode,
    pair_count: discount.pairCount,
    paired_quantity: discount.pairedQuantity,
    discount_rate_basis_points: discount.discountRateBasisPoints,
    discount_satang: discount.discountSatang,
  })),
  pair_discount_total_satang: receipt.pairDiscountTotalSatang,
  member_applied: receipt.memberApplied,
  member_discount_satang: receipt.memberDiscountSatang,
  final_total_satang: receipt.finalTotalSatang,
});

const writeOrderError = (res: Response, err: unknown): void => {
  if (err instanceof ValidationError) {
    writeError(
      res,
      422,
      "VALIDATION_ERROR",
      "The Order contains invalid fields.",
      err.fields,
    );
    return;
  }
  if (err instanceof RedConflictError) {
    writeError(
      res,
      409,
      "RED_UNAVAILABLE",
      "Red is unavailable until the specified time.",
      undefined,
      err.availableAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    );
    return;
  }
  if (err === ErrInvalidIdempotencyKey) {
    writeError(
      res,
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must contain 1 through 128 printable ASCII characters.",
      [
        {
          field: "Idempotency-Key",
          code: "REQUIRED",
          message: "header is required",
        },
      ],
    );
    return;
  }
  if (err === ErrIdempotencyConflict) {
    writeError(
      res,
      409,
      "IDEMPOTENCY_CONFLICT",
      "Idempotency-Key was already used for a different Order Intent.",
    );
    return;
  }
  if (err instanceof ServiceUnavailableError) {
    writeError(
      res,
      503,
      "SERVICE_UNAVAILABLE",
      "The service is temporarily unavailable.",
    );
    return;
  }
  writeError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
};

const writeError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  fieldErrors?: FieldError[],
  availableAt?: string,
): void => {
  res.locals.errorCode = code;
  const body: ErrorBody = {
    code,
    message,
    request_id: String(res.locals.requestId ?? ""),
  };
  if (fieldErrors && fieldErrors.length > 0) {
    body.field_errors = fieldErrors;
  }
  if (availableAt) {
    body.available_at = availableAt;
  }
  res.status(status).json(body);
};

const validIdempotencyKeyHeader = (value: string): boolean => {
  if (value.length < 1 || value.length > 128) {
    return false;
  }
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      return false;
    }
  }
  return true;
};

const validRequestId = (value: string): boolean => {
  if (value.length < 5 || value.length > 128 || !value.startsWith("req_")) {
    return false;
  }
  for (let i = 4; i < value.length; i += 1) {
    const character = value[i]!;
    if (
      !(
        (character >= "a" && character <= "z") ||
        (character >= "A" && character <= "Z") ||
        (character >= "0" && character <= "9") ||
        character === "_" ||
        character === "-"
      )
    ) {
      return false;
    }
  }
  return true;
};

const generateRequestId = (): string => `req_${randomBytes(16).toString("hex")}`;

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
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

// Silence unused import warning for IDEMPOTENCY_KEY_HEADER / REQUEST_ID_HEADER constants used as docs.
void REQUEST_ID_HEADER;
void IDEMPOTENCY_KEY_HEADER;
