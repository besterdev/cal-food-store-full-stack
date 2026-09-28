# Express feature-based MVC layout

Aligns the Food Store API with the common Express feature/domain folder
structure: each feature folder owns its model, controller, routes, and
(optional) service, beside shared `config/`, `loaders/`, `middleware/`, and
`utils/` folders.

## Layout

```text
api/src/
├── config/             env.ts, database.ts (pg pool, PostgreSQL-enforced timeouts), migrations.ts
├── loaders/            Express middleware/error handlers and route mounting
├── middleware/         shared Express middleware (request-id, request-log, CORS, Helmet, error-handler)
├── utils/              shared helpers (logger, http-error response writers)
├── health/             health.model, health.controller, health.routes
├── products/           product.model, product.controller, product.routes
├── orders/             order.model (SQL), order.service (idempotency, Red gate),
│                       order.pricing (pure), order.validation (request decode),
│                       order.controller (HTTP mapping + receipt JSON view),
│                       order.routes, order.types (domain types and errors)
├── red-availability/   red-availability.model, controller, routes
├── app.ts              Express app initialization
├── server.ts           server entry point
└── migrate.ts          migration entry point
```

- **Model** owns parameterized SQL for its feature. `OrderModel.inTransaction()`
  is the only place that begins, commits, or rolls back an Order transaction.
- **Controller** is a plain handler function that owns HTTP decoding, status
  codes, and error mapping. Unmapped errors fall through to the central error
  handler, which logs them and returns `500`.
- **View** is the controller's `toReceiptView`, which serializes a Receipt into
  the OpenAPI JSON shape; it has no other caller, so it stays in the controller.
- **Service** exists only where orchestration is needed (Order placement).
- `order.pricing` stays deterministic: no Express, SQL, clock, or network.
- Deadlines are PostgreSQL settings on the pool (`statement_timeout`,
  `lock_timeout`, `connectionTimeoutMillis`, `idle_in_transaction_session_timeout`)
  rather than an application-level AbortSignal layer.

Intentionally skipped from generic blog defaults that conflict with project
rules: shared caches, rate-limit layers without a requirement, and speculative
clustering.

## Status

Accepted on `feat/express-backend`.

## Consequences

- New HTTP features land under `api/src/<feature>/` with `<feature>.model.ts`,
  `<feature>.controller.ts`, and `<feature>.routes.ts`, mounted in
  `loaders/routes.ts`.
- API versioning lives in the mount path: OpenAPI paths remain `/api/v1/...`
  and `/health/...`.
