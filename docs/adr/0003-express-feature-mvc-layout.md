# Express feature-based MVC layout

Aligns the Food Store API with the common Express feature/domain folder
structure: each feature folder owns its model, controller, routes, and
(optional) service, beside shared `config/`, `loaders/`, `middleware/`, and
`utils/` folders.

## Layout

```text
api/src/
├── config/             environment config, pg pool + abort-aware query, migrations
├── loaders/            Express middleware/error handlers and route mounting
├── middleware/         shared Express middleware (request-id, CORS, Helmet, errors)
├── utils/              shared helpers (AbortSignal timeouts)
├── health/             health.model, health.controller, health.routes
├── products/           product.model, product.controller, product.routes
├── orders/             order.model (SQL), order.service (idempotency, Red gate),
│                       order.pricing (pure), order.validation (request decode),
│                       order.view (receipt JSON), order.controller, order.routes,
│                       order.types, order.errors
├── red-availability/   red-availability.model, controller, routes
├── app.ts              Express app initialization
├── server.ts           server entry point
└── migrate.ts          migration entry point
```

- **Model** owns parameterized SQL for its feature.
- **Controller** owns HTTP decoding, status codes, and error mapping.
- **View** serializes domain results into the OpenAPI JSON shape.
- **Service** exists only where orchestration is needed (Order placement).
- `order.pricing` stays deterministic: no Express, SQL, clock, or network.

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
