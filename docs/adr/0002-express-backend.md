# Express + TypeScript API for the Food Store Calculator
#
# Stack decision (feat/express-backend):
# Replace the Go Fiber HTTP adapter with Express while preserving the same
# OpenAPI contract, PostgreSQL schema, pricing rules, idempotency digests,
# and Red Availability Window semantics.
#
# Module boundaries remain:
#   Express handlers -> Order service -> pure pricing -> PostgreSQL adapter

## Status

Accepted for the `feat/express-backend` migration. The OpenAPI document remains
the machine-readable HTTP contract.

## Consequences

- Node.js 22+ and pnpm are required for API development and CI.
- Integer satang arithmetic uses checked JavaScript safe integers.
- Integration and contract tests run with Vitest against real PostgreSQL.
