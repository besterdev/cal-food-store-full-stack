# Food Store Calculator

Full-stack calculator for a fixed seven-Product food-store catalog. The application uses a Next.js frontend, a Go Fiber API, and PostgreSQL as the authoritative catalog and pricing source.

The implementation is delivered in vertical slices tracked by [GitHub Issue #1](https://github.com/besterdev/cal-food-store-full-stack/issues/1). The checked-in [requirements](./docs/requirements.md) and [OpenAPI contract](./docs/openapi.yaml) govern detailed behavior.

## Current slice

The runnable Order placement slice provides:

- repeatable PostgreSQL migration and exact seven-Product seed;
- `GET /api/v1/products`, `POST /api/v1/orders`, `GET /health/live`, and `GET /health/ready`;
- atomic Order acceptance with idempotent replay, immutable price snapshots, and structured errors;
- a responsive Product Catalog plus Calculate & Place Order, server receipt, New Order, and safe retry;
- Axios and TanStack React Query with a five-minute catalog freshness window and no automatic Order retries;
- backend contract tests, real-PostgreSQL idempotency coverage, and frontend behavior tests.

Pair Discount presentation polish, Member Discount flows, Red Availability concurrency, and final browser verification are tracked by the remaining child tickets and are not represented as complete until those slices land.

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
