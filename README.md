# Food Store Calculator

Full-stack Order calculator for a fixed seven-Product catalog.  
**Next.js** · **Express** · **PostgreSQL** — the API is the only pricing authority.

## Live demo


|          | URL                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Web      | [https://food-store-web-lfcng66dzq-as.a.run.app](https://food-store-web-lfcng66dzq-as.a.run.app)                                 |
| API      | [https://food-store-api-lfcng66dzq-as.a.run.app](https://food-store-api-lfcng66dzq-as.a.run.app)                                 |
| Products | [https://food-store-api-lfcng66dzq-as.a.run.app/api/v1/products](https://food-store-api-lfcng66dzq-as.a.run.app/api/v1/products) |
| Health   | [https://food-store-api-lfcng66dzq-as.a.run.app/health/ready](https://food-store-api-lfcng66dzq-as.a.run.app/health/ready)       |

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


| Service  | URL                                                                            |
| -------- | ------------------------------------------------------------------------------ |
| Web      | [http://localhost:3000](http://localhost:3000)                                 |
| Products | [http://localhost:8080/api/v1/products](http://localhost:8080/api/v1/products) |
| Health   | [http://localhost:8080/health/ready](http://localhost:8080/health/ready)       |
| Postgres | `localhost:5432` · db/user/password `food_store`                               |


Stop: `docker compose down`

## Architecture

```text
Browser → Next.js → Express (/api/v1) → PostgreSQL
```

- Controllers → Order service → pure pricing → feature models (SQL)
- API uses feature-based MVC under `api/src/<feature>/` ([ADR 0003](./docs/adr/0003-express-feature-mvc-layout.md))
- Frontend never recalculates discounts; it renders the API Pricing Breakdown
- PostgreSQL owns catalog, Orders, idempotency, and the Red gate

## Project structure

```text
.
├── api/                         Express + TypeScript API
│   ├── migrations/              Versioned SQL (products, orders, Red gate)
│   ├── Dockerfile
│   └── src/
│       ├── server.ts            Process entry
│       ├── app.ts               Express app composition
│       ├── migrate.ts           Migration entry
│       ├── config/              env.ts, database.ts, migrations.ts
│       ├── loaders/             Middleware stack and route mounting
│       ├── middleware/          request-id, CORS, Helmet, request-log, error-handler
│       ├── utils/               logger, http-error helpers
│       ├── health/              health.model / controller / routes
│       ├── products/            product.model / controller / routes
│       ├── orders/              model, service, pricing, validation, controller, routes
│       ├── red-availability/    reset helper (demo)
│       └── tests/               HTTP + PostgreSQL contract tests
├── web/                         Next.js App Router UI
│   └── src/
│       ├── app/                 layout, page
│       ├── features/order/      calculator Client Component subtree
│       ├── components/          common + owned shadcn/ui
│       └── lib/                 Axios API client, React Query
├── docs/                        Specs, OpenAPI, ADRs, test plan, verification
├── scripts/                     GCP deploy
├── compose.yaml                 web + api + postgres (+ migrate job)
└── .github/workflows/           CI, CodeQL, deploy
```

Each API feature folder owns its `*.model.ts` (SQL), `*.controller.ts`, and `*.routes.ts`. Orders also keep `order.service.ts` (idempotency + Red gate) and `order.pricing.ts` (pure satang math).

## API


| Method | Path                             | Notes                                      |
| ------ | -------------------------------- | ------------------------------------------ |
| `GET`  | `/api/v1/products`               | Seven seeded Products                     |
| `POST` | `/api/v1/orders`                 | Requires `Idempotency-Key`                |
| `POST` | `/api/v1/red-availability/reset` | Demo helper: clear the 60-minute Red gate |
| `GET`  | `/health/ready`                  | Readiness                                 |


Errors use stable codes (`VALIDATION_ERROR`, `RED_UNAVAILABLE`, …). Only `RED_UNAVAILABLE` includes `available_at`.

## Checks

```bash
# Frontend
cd web && pnpm install
pnpm run format:check && pnpm run lint && pnpm run typecheck
pnpm test && pnpm run build

# Backend
cd api && pnpm install
pnpm run typecheck && pnpm test && pnpm run build

# OpenAPI
npx --yes @redocly/cli@1 lint docs/openapi.yaml

# E2E (stack must be up)
cd web && pnpm exec playwright install chromium && pnpm run test:e2e
```

Set `TEST_DATABASE_URL` for Postgres integration / Red concurrency tests.

## CI/CD & deploy

- **CI** — format, lint, typecheck, tests (with Postgres), OpenAPI on every PR / `main`
- **Security gate** — `pnpm audit` (high+), Trivy image scan (high+, fixable), CodeQL, Dependabot; `main` requires every check to pass before merge
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
| 📌  | [ADR 0002](./docs/adr/0002-express-backend.md)           | Express backend               |
| 📌  | [ADR 0003](./docs/adr/0003-express-feature-mvc-layout.md) | API feature-based MVC layout |
| ☁️  | [GCP CI/CD](./docs/gcp-cicd.md)                          | Cloud Run + GitHub Actions    |
| 🖼️ | [screenshots](./docs/verification/screenshots/)          | Visual evidence               |
| 🧪  | [verification](./docs/verification/README.md)            | Screenshot regeneration notes |
| 🏷️ | [agents / triage](./docs/agents/triage-labels.md)        | Issue triage labels           |
| 🗂️ | [agents / domain](./docs/agents/domain.md)               | Domain doc pointers           |
| 🔗  | [agents / issue tracker](./docs/agents/issue-tracker.md) | GitHub Issues workflow        |


