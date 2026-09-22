# Food Store Calculator Requirements

## 1. Purpose

The Food Store Calculator allows a Customer to select Products, optionally identify as a Member, and submit an Order for atomic pricing and acceptance. The API is the only pricing authority. A successful calculation commits an Order and returns an immutable receipt; it is not a quote-only operation.

## 2. Scope

The first release includes:

- a fixed seven-Product catalog;
- server-side Pair and Member Discount calculation;
- atomic Order creation with idempotent retry behavior;
- a store-wide rolling availability rule for Red;
- a receipt-style Pricing Breakdown; and
- API liveness and readiness checks.

Authentication, payment, tax, delivery, inventory quantities, Product administration, Member lookup, Order history, cancellation, refund, and modification are out of scope.

## 3. Domain Terms

- **Product**: one of the seven fixed sets sold by the store.
- **Order Intent**: the submitted Product codes and quantities plus whether a trimmed Member Card number is present.
- **Order**: an accepted and committed Order Intent with immutable pricing snapshots.
- **Order Line**: one unique Product and its positive quantity in an Order.
- **Pair Discount**: 5% off each same-Product pair of Orange, Pink, or Green.
- **Member Discount**: 10% off the amount remaining after all Pair Discounts.
- **Pricing Breakdown**: the authoritative receipt values returned by the API.
- **Red Availability Window**: the rolling 60-minute period after an accepted Red-containing Order during which another Red-containing Order cannot be accepted.

## 4. Product Catalog

The API must return exactly these Products in this display order. All wire-level prices are integer satang and the currency is `THB`.

| Display order | Code | Name | Unit price (THB) | Unit price (satang) |
| ---: | --- | --- | ---: | ---: |
| 1 | `RED` | Red set | 50 | 5,000 |
| 2 | `GREEN` | Green set | 40 | 4,000 |
| 3 | `BLUE` | Blue set | 30 | 3,000 |
| 4 | `YELLOW` | Yellow set | 50 | 5,000 |
| 5 | `PINK` | Pink set | 80 | 8,000 |
| 6 | `PURPLE` | Purple set | 90 | 9,000 |
| 7 | `ORANGE` | Orange set | 120 | 12,000 |

PostgreSQL is the catalog source of truth. Clients must not send prices, discounts, totals, or currency when creating an Order.

## 5. Pricing Rules

### 5.1 Money and arithmetic

- Every monetary value must use signed 64-bit integer satang. Floating-point money is forbidden.
- Quantities and intermediate arithmetic must be checked before multiplication or addition.
- Each discount step rounds half-up to the nearest satang.
- The invariant is:

  `Final Total = Total Before Discount - Pair Discount total - Member Discount`

### 5.2 Pair Discount

- Only `ORANGE`, `PINK`, and `GREEN` qualify.
- Pairing is within one Product code only; quantities of different Products are never combined.
- For an eligible Order Line, `pair count = floor(quantity / 2)`.
- The paired amount is `pair count * 2 * unit price`.
- The Pair Discount is 5% of the paired amount, rounded half-up to the nearest satang.
- Any odd, unpaired unit remains at full price.
- `RED`, `BLUE`, `YELLOW`, and `PURPLE` never receive a Pair Discount.

Required examples without a Member Card:

| Order Line | Total Before Discount | Pair Discount | Final Total |
| --- | ---: | ---: | ---: |
| Orange x2 | 24,000 | 1,200 | 22,800 |
| Pink x4 | 32,000 | 1,600 | 30,400 |
| Green x3 | 12,000 | 400 | 11,600 |

### 5.3 Member Discount

- The Member Card number is optional.
- Surrounding whitespace is ignored.
- Any non-empty trimmed value qualifies; v1 performs no registry lookup or format validation.
- A whitespace-only value is equivalent to an omitted Member Card number.
- The Member Discount is 10% of `Total Before Discount - Pair Discount total`, rounded half-up to the nearest satang.
- The Pair Discount must be calculated before the Member Discount.
- The raw Member Card number must not be persisted, returned, or logged.

Example: Orange x2 with a Member Card has a 24,000 satang Total Before Discount, a 1,200 satang Pair Discount, a 2,280 satang Member Discount, and a 20,520 satang Final Total.

## 6. Order Acceptance

- `POST /api/v1/orders` both calculates and commits an Order.
- Success is returned only after the database transaction commits.
- Each Order must contain one through seven Order Lines.
- Each Order Line must contain a supported Product code and an integer quantity from 1 through 999.
- Product codes must be unique within the Order.
- Accepted Order Lines must retain immutable Product name, Unit Price, line total before discount, and discount snapshots.
- The response must include an Order reference, acceptance time, currency, Order Lines, Pair Discount details, Member Discount, and Final Total.
- No Order lookup endpoint is exposed in v1.

## 7. Idempotency

- Every Order creation request requires `Idempotency-Key`.
- The key must contain 1 through 128 printable ASCII characters. A UUID is recommended.
- A canonical Order Intent ignores Order Line ordering and surrounding Member Card whitespace.
- The canonical intent includes the unique Product codes, their quantities, and whether the trimmed Member Card number is present. It must not include or persist the raw Member Card number.
- Repeating a key with the same canonical intent returns the original `201 Created` response, committed Order, and Pricing Breakdown without creating another Order or re-evaluating Red availability.
- Repeating a key with a different canonical intent returns `409 IDEMPOTENCY_CONFLICT`.
- Concurrent requests using the same key and same canonical intent must converge on one committed Order.

## 8. Red Availability

- At most one Red-containing Order may be accepted store-wide in any rolling 60-minute window.
- A successful Red-containing Order may contain any valid Red quantity; the limit applies to accepted Orders, not units.
- Non-Red Orders remain available while Red is blocked.
- PostgreSQL time is authoritative.
- At exactly the recorded `available_at` timestamp, a new Red-containing Order may be accepted.
- The singleton Red gate must be locked and updated in the same transaction that persists the Order.
- A rollback must restore both Order persistence and Red availability.
- Concurrent Red-containing requests must be serialized so that exactly one is accepted when Red is available.
- A conflict returns `409 RED_UNAVAILABLE` and the RFC 3339 `available_at` timestamp.
- An idempotent replay of a previously accepted Red-containing Order returns that Order without checking or extending the Red Availability Window.

## 9. HTTP Contract

The machine-readable source of truth is [`openapi.yaml`](./openapi.yaml).

The public endpoints are:

- `GET /api/v1/products`
- `POST /api/v1/orders`
- `GET /health/live`
- `GET /health/ready`

The API must accept and return JSON for versioned application endpoints. Unknown JSON fields are rejected. Stable machine-readable error codes and user-safe messages are required.

## 10. Validation and Error Behavior

The API must distinguish transport/syntax failures, semantic validation failures, business conflicts, and service failures.

| HTTP status | Stable code | Required use |
| ---: | --- | --- |
| 400 | `MALFORMED_JSON` | Invalid JSON, multiple JSON values, or an unknown request field |
| 400 | `INVALID_IDEMPOTENCY_KEY` | Missing, empty, too long, or non-printable `Idempotency-Key` |
| 422 | `VALIDATION_ERROR` | Empty Order Lines, duplicate or unsupported Product, invalid quantity, or other semantic Order error |
| 409 | `IDEMPOTENCY_CONFLICT` | One key is reused for a different canonical Order Intent |
| 409 | `RED_UNAVAILABLE` | A Red-containing Order is attempted before `available_at` |
| 503 | `SERVICE_UNAVAILABLE` | A required dependency, transaction, or commit operation is unavailable or fails operationally |
| 500 | `INTERNAL_ERROR` | An arithmetic invariant or unexpected application failure |

- Error bodies must contain `code`, `message`, and `request_id`.
- Validation errors must include one or more field errors with stable field-level codes.
- Only `RED_UNAVAILABLE` includes `available_at`.
- Responses must not expose stack traces, SQL details, credentials, raw request bodies, raw idempotency keys, or raw Member Card numbers.

## 11. Health and Operations

- Liveness reports whether the API process can serve requests and must not depend on PostgreSQL.
- Readiness reports whether the API can accept application traffic and must fail when required dependencies are unavailable.
- Application responses include a request identifier, either propagated from a valid incoming request identifier or generated by the API.
- Structured logs and low-cardinality metrics cover health, accepted Orders, Red conflicts, idempotency outcomes, and transaction failures without recording sensitive values.

## 12. Acceptance Criteria

1. Product listing returns exactly the seven catalog rows and prices in Section 4.
2. Orange x2, Pink x4, Green x3, and Orange x2 with a Member Card produce the exact amounts in Section 5.
3. Unlike Products never form a discounted pair, and ineligible Products receive no Pair Discount.
4. A successful Order response is returned only after its Order, immutable snapshots, idempotency record, and any Red gate update commit atomically.
5. Replaying the same key and canonical intent returns the original `201 Created` response and the same Order; changing the intent produces `IDEMPOTENCY_CONFLICT`.
6. At least ten simultaneous Red-containing attempts while Red is available yield exactly one success; the rest yield `RED_UNAVAILABLE`.
7. A failed transaction does not consume Red availability, and a new Red Order succeeds exactly at the 60-minute boundary.
8. Malformed JSON, unknown fields, duplicate Products, unsupported Products, invalid quantities, and invalid idempotency keys produce the documented status and stable error shape.
9. Raw Member Card numbers and raw idempotency keys are absent from persistence, responses, and logs.
10. The implementation passes contract tests against `docs/openapi.yaml` and PostgreSQL integration tests for idempotency, rollback, boundary time, and concurrency.
