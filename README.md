# Food Store Calculator

Full-stack calculator for a fixed seven-Product food-store catalog. The application uses a Next.js frontend, a Go Fiber API, and PostgreSQL as the authoritative catalog and pricing source.

The implementation is delivered in vertical slices tracked by [GitHub Issue #1](https://github.com/besterdev/cal-food-store-full-stack/issues/1). The checked-in [requirements](./docs/requirements.md) and [OpenAPI contract](./docs/openapi.yaml) govern detailed behavior.

## Current slice

The runnable Member Discount slice provides:

- optional Member Card input that applies a 10% Member Discount after Pair Discounts with half-up satang rounding;
- privacy-safe handling that never persists, returns, or logs the raw Member Card number;
- receipt and UI rows that separately explain Pair Discounts, Member Discount, and Final Total;
- idempotency-key regeneration when membership changes, with same-key retry for an unchanged intent;
- pricing, HTTP, PostgreSQL, and frontend coverage for member-only, Pair-plus-member, and whitespace-only cases.

Red Availability concurrency and final recovery/accessibility verification are tracked by the remaining child tickets.

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
