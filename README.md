# Food Store Calculator

Full-stack Order calculator for a fixed seven-Product catalog.  
**Next.js** · **Go Fiber** · **PostgreSQL** — the API is the only pricing authority.

## Live demo

| | URL |
| --- | --- |
| Web | https://food-store-web-lfcng66dzq-as.a.run.app |
| API | https://food-store-api-lfcng66dzq-as.a.run.app |
| Products | https://food-store-api-lfcng66dzq-as.a.run.app/api/v1/products |
| Health | https://food-store-api-lfcng66dzq-as.a.run.app/health/ready |

GCP project: `project-e18e387f-34bb-43fb-9db` (Cloud Run · `asia-southeast1`)

## What it does

- Seven Products with prices in integer **satang**
- **Pair Discount** 5% on Orange / Pink / Green pairs
- **Member Discount** 10% after Pair discounts
- Idempotent `POST /api/v1/orders` (`Idempotency-Key`)
- **Red Availability**: one Red Order per rolling 60 minutes store-wide
- Draft-preserving recovery (validation, Red conflict, network, service errors)

Specs: [requirements](./docs/requirements.md) · [OpenAPI](./docs/openapi.yaml) · [system design](./docs/system-design.md)

## Quick start (local)

```bash
docker compose up --build
```

| Service | URL |
| --- | --- |
| Web | http://localhost:3000 |
| Products | http://localhost:8080/api/v1/products |
| Health | http://localhost:8080/health/ready |

Stop: `docker compose down`

## Architecture

```text
Browser → Next.js → Go Fiber (/api/v1) → PostgreSQL
```

- Handlers → Order service → pure pricing module → Postgres adapter
- Frontend never recalculates discounts; it renders the API Pricing Breakdown
- PostgreSQL owns catalog, Orders, idempotency, and the Red gate

## API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/products` | Seven seeded Products |
| `POST` | `/api/v1/orders` | Requires `Idempotency-Key` |
| `GET` | `/health/ready` | Readiness |

Errors use stable codes (`VALIDATION_ERROR`, `RED_UNAVAILABLE`, …). Only `RED_UNAVAILABLE` includes `available_at`.

## Checks

```bash
# Frontend
cd web && pnpm install
pnpm run format:check && pnpm run lint && pnpm run typecheck
pnpm test && pnpm run build

# Backend
cd api
gofmt -l . && go vet ./...
go test ./... && go test -race ./...

# OpenAPI
npx --yes @redocly/cli@1 lint docs/openapi.yaml

# E2E (stack must be up)
cd web && pnpm exec playwright install chromium && pnpm run test:e2e
```

Set `TEST_DATABASE_URL` for Postgres integration / Red concurrency tests.

## CI/CD & deploy

- **CI** — format, lint, tests, race, OpenAPI on every PR / `main`
- **Deploy** — Cloud Run after CI on `main` ([`scripts/gcp-deploy.sh`](./scripts/gcp-deploy.sh))

Setup: [`docs/gcp-cicd.md`](./docs/gcp-cicd.md)

> Cloud SQL bills while running — delete the instance when the demo is done.

## Docs

| Doc | Purpose |
| --- | --- |
| [CONTEXT](./CONTEXT.md) | Domain terms |
| [requirements](./docs/requirements.md) | Business rules |
| [api-spec](./docs/api-spec.md) | HTTP behavior |
| [openapi.yaml](./docs/openapi.yaml) | Contract |
| [test-plan](./docs/test-plan.md) | Verification |
| [design-system](./docs/design-system.md) | UI |
| [screenshots](./docs/verification/screenshots/) | Visual evidence |
