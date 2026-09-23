# Food Store Calculator

Full-stack Order calculator for a fixed seven-Product catalog.  
**Next.js** · **Go Fiber** · **PostgreSQL** — the API is the only pricing authority.

## Live demo


|          | URL                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Web      | [https://food-store-web-lfcng66dzq-as.a.run.app](https://food-store-web-lfcng66dzq-as.a.run.app)                                 |
| API      | [https://food-store-api-lfcng66dzq-as.a.run.app](https://food-store-api-lfcng66dzq-as.a.run.app)                                 |
| Products | [https://food-store-api-lfcng66dzq-as.a.run.app/api/v1/products](https://food-store-api-lfcng66dzq-as.a.run.app/api/v1/products) |
| Health   | [https://food-store-api-lfcng66dzq-as.a.run.app/health/ready](https://food-store-api-lfcng66dzq-as.a.run.app/health/ready)       |




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


| Service  | URL                                                                            |
| -------- | ------------------------------------------------------------------------------ |
| Web      | [http://localhost:3000](http://localhost:3000)                                 |
| Products | [http://localhost:8080/api/v1/products](http://localhost:8080/api/v1/products) |
| Health   | [http://localhost:8080/health/ready](http://localhost:8080/health/ready)       |


Stop: `docker compose down`

## Architecture

```text
Browser → Next.js → Go Fiber (/api/v1) → PostgreSQL
```

- Handlers → Order service → pure pricing module → Postgres adapter
- Frontend never recalculates discounts; it renders the API Pricing Breakdown
- PostgreSQL owns catalog, Orders, idempotency, and the Red gate



## API


| Method | Path               | Notes                      |
| ------ | ------------------ | -------------------------- |
| `GET`  | `/api/v1/products` | Seven seeded Products      |
| `POST` | `/api/v1/orders`   | Requires `Idempotency-Key` |
| `GET`  | `/health/ready`    | Readiness                  |


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


|     | Doc                                                      | Purpose                       |
| --- | -------------------------------------------------------- | ----------------------------- |
| 🧭  | [CONTEXT](./CONTEXT.md)                                  | Domain terms                  |
| 🤖  | [AGENTS](./AGENTS.md)                                    | Agent / implementation rules  |
| 📋  | [requirements](./docs/requirements.md)                   | Business rules                |
| 🏗️ | [system design](./docs/system-design.md)                 | Architecture decisions        |
| 🌐  | [api-spec](./docs/api-spec.md)                           | HTTP behavior                 |
| 📜  | [openapi.yaml](./docs/openapi.yaml)                      | Machine-readable contract     |
| 🎨  | [design system](./docs/design-system.md)                 | UI language                   |
| ✅   | [test plan](./docs/test-plan.md)                         | Verification strategy         |
| 📌  | [ADR 0001](./docs/adr/0001-calculation-commits-order.md) | Calculate commits Order       |
| ☁️  | [GCP CI/CD](./docs/gcp-cicd.md)                          | Cloud Run + GitHub Actions    |
| 🖼️ | [screenshots](./docs/verification/screenshots/)          | Visual evidence               |
| 🧪  | [verification](./docs/verification/README.md)            | Screenshot regeneration notes |
| 🏷️ | [agents / triage](./docs/agents/triage-labels.md)        | Issue triage labels           |
| 🗂️ | [agents / domain](./docs/agents/domain.md)               | Domain doc pointers           |
| 🔗  | [agents / issue tracker](./docs/agents/issue-tracker.md) | GitHub Issues workflow        |


