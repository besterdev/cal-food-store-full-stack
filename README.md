# Food Store Calculator

Full-stack calculator for a fixed seven-Product food-store catalog. The application uses a Next.js frontend, a Go Fiber API, and PostgreSQL as the authoritative catalog and pricing source.

The implementation is delivered in vertical slices tracked by [GitHub Issue #1](https://github.com/besterdev/cal-food-store-full-stack/issues/1). The checked-in [requirements](./docs/requirements.md) and [OpenAPI contract](./docs/openapi.yaml) govern detailed behavior.

## Current slice

The runnable Red Availability slice provides:

- a store-wide rolling 60-minute Red Availability Window locked in the same PostgreSQL transaction as Order acceptance;
- exactly one concurrent new Red-containing Order accepted while non-Red Orders remain available;
- idempotent Red replay that does not recheck or extend the window;
- `409 RED_UNAVAILABLE` with RFC 3339 `available_at` and UI recovery that preserves the draft and offers Remove Red;
- real PostgreSQL concurrency, boundary, rollback, and frontend conflict-recovery coverage.

Final recovery, accessibility, and release verification are tracked by the remaining child ticket.

## Run the stack

Prerequisite: Docker with Compose v2.

```bash
docker compose up --build
```

Open:

- Web: <http://localhost:3000>
- Product API: <http://localhost:8080/api/v1/products>
- API readiness: <http://localhost:8080/health/ready>

Stop the services with `docker compose down`. The development database uses the named `food-store-postgres` volume; removing that volume is intentionally not part of the normal stop command.

## Run checks locally

Frontend:

```bash
cd web
pnpm install
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Backend unit and HTTP contract tests:

```bash
cd api
gofmt -l .
go vet ./...
go test -race ./...
```

The PostgreSQL integration test runs when `TEST_DATABASE_URL` points to an isolated test database; otherwise it reports a skip instead of using development data.

## Architecture

```text
Browser -> Next.js client subtree -> Go Fiber API -> PostgreSQL
```

The frontend never owns authoritative prices or discount calculations. The API response and immutable database snapshots will remain the pricing source as later Order slices are implemented. See [system design](./docs/system-design.md), [design system](./docs/design-system.md), and [test plan](./docs/test-plan.md) for the full decisions.
