# Food Store Calculator API Conventions

The authoritative machine-readable contract is [`openapi.yaml`](./openapi.yaml). Implementations, generated clients, and contract tests must follow that file. This document explains behavior and conventions without duplicating its schemas.

## Base paths and representation

- Application endpoints are versioned under `/api/v1`.
- Health endpoints are unversioned under `/health`.
- Application requests and responses use `application/json`.
- Property names use `snake_case`.
- Dates and times use RFC 3339 timestamps in UTC on the wire.
- Money is always an integer number of satang with `THB` as the currency. Floating-point money is never accepted or returned.

## Product catalog

`GET /api/v1/products` returns the complete seven-Product catalog in stable display order. The API and PostgreSQL own Product prices; a client must treat catalog prices as display input only and must never submit a price as part of an Order.

The catalog is fixed to Red set 50 THB, Green set 40 THB, Blue set 30 THB, Yellow set 50 THB, Pink set 80 THB, Purple set 90 THB, and Orange set 120 THB. The exact codes, satang values, color tokens, and response example are defined in the OpenAPI contract.

## Creating an Order

`POST /api/v1/orders` is a committing operation. It validates the Order, loads authoritative Product data, applies discounts, enforces Red availability, persists immutable snapshots, and returns a receipt only after the transaction commits.

The request contains only Product codes and quantities plus an optional Member Card number. Unknown JSON properties are rejected so stale or misspelled client fields cannot be silently ignored. A client-provided price, total, currency, or discount is therefore invalid.

A newly committed Order returns `201 Created`. A same-intent idempotent replay returns the original `201 Created` response and receipt without rechecking Red availability. The `Location` header identifies the committed Order only; v1 intentionally has no Order lookup endpoint.

## Pricing sequence

The API performs pricing in this order:

1. Build each Order Line total before discount from the authoritative Unit Price and quantity.
2. Apply a 5% Pair Discount independently to complete same-Product pairs of Orange, Pink, and Green.
3. Leave odd eligible units and every Red, Blue, Yellow, or Purple unit at full price.
4. If the trimmed Member Card number is non-empty, apply a 10% Member Discount to the Total Before Discount remaining after Pair Discounts.
5. Round each discount step half-up to the nearest satang and return the full Pricing Breakdown.

The frontend displays these returned values and must not reproduce this calculation.

## Idempotency

Every Order request requires `Idempotency-Key`. It is a client-generated string of 1 through 128 printable ASCII characters; UUIDs are recommended.

The server compares the key against a canonical Order Intent. Canonicalization ignores item ordering and surrounding Member Card whitespace. It includes each Product code and quantity and whether a trimmed Member Card value is present. The raw Member Card number is not part of the persisted canonical data.

- Same key and same canonical intent: return the original `201 Created` response and committed Order without a second insert or Red availability check.
- Same key and different canonical intent: return `409 IDEMPOTENCY_CONFLICT`.
- Changed quantity, Product selection, or Member presence: the client must use a new key.
- Retry of an unchanged intent after an interrupted response: the client must reuse the key.

Raw idempotency keys must not be logged. A server may store a one-way digest or otherwise protected representation sufficient to enforce the contract.

## Red Availability Window

Red is governed by one store-wide rolling window. After a Red-containing Order commits, another Red-containing Order cannot be accepted until exactly 60 minutes after the PostgreSQL acceptance time. Any valid Red quantity consumes one window; the rule counts Orders, not units.

The Order service locks the singleton Red gate and persists the Order in one database transaction. A failed or rolled-back Order does not consume availability. Requests without Red do not inspect or change the gate. When Red is blocked, the API returns `409 RED_UNAVAILABLE` with `available_at`; clients should preserve the draft and allow Red to be removed or retried later.

An idempotent replay of an already accepted Red Order bypasses the availability check and never extends the window.

## Errors

All application errors use the `ErrorResponse` schema in OpenAPI. Callers branch on the stable `code`, never on message text.

- `400` indicates JSON/header syntax or shape failures such as malformed JSON, an unknown field, or an invalid idempotency key.
- `422` indicates semantic Order validation failures such as an empty Order, duplicate or unsupported Product code, or quantity outside 1 through 999.
- `409` indicates an idempotency mismatch or Red availability conflict.
- `503` indicates that a required dependency, transaction, or commit operation is unavailable or fails operationally.
- `500` is reserved for arithmetic invariant failures and unexpected application failures.

Validation responses include field-level details. Only a Red conflict includes `available_at`. Messages are safe for users and never contain implementation details, sensitive values, stack traces, or SQL text.

## Request correlation

Every response includes `X-Request-ID`. The value is used for support and log correlation and must not encode request content. Sensitive values, including request bodies, Member Card numbers, raw idempotency keys, and database credentials, must not be logged.

## Health endpoints

`GET /health/live` checks that the API process is running and able to serve HTTP. It does not query PostgreSQL.

`GET /health/ready` checks dependencies required to accept application traffic. It returns `200` while ready and the standard `503 SERVICE_UNAVAILABLE` response when a required dependency is unavailable.

`POST /api/v1/red-availability/reset` is a demo/ops helper that restores the Red Availability Window to immediate availability (`available_at = -infinity`) without deleting Orders. It returns `204` on success.

## Contract maintenance

- Change `openapi.yaml` before intentionally changing an HTTP request, response, validation rule, or stable error code.
- Keep handler behavior and contract tests aligned with the checked-in OpenAPI file.
- Swag annotations or other generated documentation may support implementation, but generated output must not overwrite or supersede `openapi.yaml`.
- Update [`requirements.md`](./requirements.md) first when a change alters a business rule.
