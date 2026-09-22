# Food Store Calculator

Full-stack calculator for a fixed seven-Product food-store catalog. The application uses a Next.js frontend, a Go Fiber API, and PostgreSQL as the authoritative catalog and pricing source.

Parent tracker: [GitHub Issue #1](https://github.com/besterdev/cal-food-store-full-stack/issues/1). The checked-in [requirements](./docs/requirements.md) and [OpenAPI contract](./docs/openapi.yaml) govern detailed behavior.

## Current status

The calculator is feature-complete for v1 Order placement:

- seven-Product catalog with API-authoritative prices in integer satang;
- Pair Discounts (Green, Pink, Orange) and 10% Member Discount after pairs;
- idempotent `POST /api/v1/orders` with `Idempotency-Key`;
- store-wide rolling 60-minute Red Availability Window;
- draft-preserving recovery for validation, Red conflict, network/timeout, service, and idempotency failures;
- Playwright coverage (mobile + desktop) with axe-core WCAG 2.2 AA scans and screenshot evidence under [`docs/verification/screenshots/`](./docs/verification/screenshots/).

## Run the stack

Prerequisite: Docker with Compose v2.

```bash
docker compose up --build
```

Open:

- Web: <http://localhost:3000>
- Product API: <http://localhost:8080/api/v1/products>
- API readiness: <http://localhost:8080/health/ready>

Stop with `docker compose down`. The development database uses the named `food-store-postgres` volume.

## Architecture

```text
Browser -> Next.js client subtree -> Go Fiber API (/api/v1) -> PostgreSQL
```

- The API is the only pricing authority. The frontend collects an Order draft and renders the returned Pricing Breakdown.
- Handlers → Order service → pure pricing module → PostgreSQL adapter.
- Money is always integer satang (`int64`). Floating-point monetary math is forbidden.
- PostgreSQL owns Products, accepted Orders, idempotency keys, and the Red Availability Window.

See [system design](./docs/system-design.md), [design system](./docs/design-system.md), [API spec](./docs/api-spec.md), and [CONTEXT](./CONTEXT.md).

## API contract

Machine-readable contract: [`docs/openapi.yaml`](./docs/openapi.yaml).

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/products` | Seven seeded Products in display order |
| `POST` | `/api/v1/orders` | Requires `Idempotency-Key`; never accepts client prices |
| `GET` | `/health/ready` | Dependency readiness |

Stable error codes include `VALIDATION_ERROR`, `IDEMPOTENCY_CONFLICT`, `RED_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, and `INTERNAL_ERROR`. Only `RED_UNAVAILABLE` includes `available_at`.

Lint the OpenAPI document:

```bash
npx --yes @redocly/cli@1 lint docs/openapi.yaml
```

## Migrations

Versioned SQL lives in `api/migrations/`. Compose runs the `migrate` service against PostgreSQL before the API starts.

```bash
cd api
DATABASE_URL='postgres://food_store:food_store@localhost:5432/food_store?sslmode=disable' go run ./cmd/migrate
```

Integration tests create isolated schemas and apply the same migrations when `TEST_DATABASE_URL` is set.

## Business rules (v1)

- Catalog: Red, Green, Blue, Yellow, Pink, Purple, Orange with fixed unit prices.
- Pair Discount: 5% off each complete pair of Green, Pink, or Orange (integer half-up satang).
- Member Discount: 10% after Pair Discounts when a trimmed Member Card is present; the raw card number is never persisted, returned, or logged.
- Red Availability: after an accepted Red-containing Order, another new Red Order is blocked until PostgreSQL `available_at`; equality at the boundary succeeds; non-Red Orders are unaffected; idempotent Red replay does not extend the window.

## Assumptions

- Local development uses Compose-published ports `3000` (web) and `8080` (API).
- Playwright expects the real stack at those ports unless `PLAYWRIGHT_BASE_URL` / `PLAYWRIGHT_API_BASE_URL` override them.
- Automated axe scans are necessary but not sufficient for full WCAG conformance; keyboard/zoom/contrast/screen-reader sign-off remains part of release review.
- Manual VoiceOver and forced-colors checks are documented in [`docs/test-plan.md`](./docs/test-plan.md) and should be signed off before production handoff.

## Run checks locally

### Frontend

```bash
cd web
pnpm install
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

### Backend

```bash
cd api
gofmt -l .
go vet ./...
go test ./...
go test -race ./...
```

PostgreSQL integration and Red concurrency tests run when `TEST_DATABASE_URL` points at an isolated database (Compose `db` service is fine for local agents).

### Playwright (real stack)

With `docker compose up` healthy:

```bash
cd web
pnpm exec playwright install chromium
pnpm run test:e2e
```

Evidence screenshots are written to `docs/verification/screenshots/`. HTML report: `pnpm run test:e2e:report`.

### OpenAPI

```bash
npx --yes @redocly/cli@1 lint docs/openapi.yaml
```

## Verification evidence

| Artifact | Meaning |
| --- | --- |
| `docs/verification/screenshots/desktop-editing.png` | Desktop draft |
| `docs/verification/screenshots/desktop-receipt.png` | Pair + Member receipt |
| `docs/verification/screenshots/mobile-editing.png` | Mobile draft |
| `docs/verification/screenshots/mobile-receipt.png` | Mobile receipt |
| `docs/verification/screenshots/*-red-conflict.png` | Red recovery |
| Playwright HTML report | Flow + axe results |

Treat screenshot updates as intentional design changes reviewed against [`docs/design-system.md`](./docs/design-system.md).
