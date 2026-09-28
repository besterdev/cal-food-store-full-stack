# Express feature-based MVC layout
#
# Aligns the Food Store API with common Express structure guidance
# (feature folders, controllers/routes, versioned API, centralized middleware
# and config) while preserving domain modules and the PostgreSQL adapter.
#
# Layout:
#   src/app.ts                 composition root
#   src/config/                environment configuration
#   src/middleware/            shared Express middleware
#   src/v1/features/*          versioned MVC feature slices
#   src/modules/*              pure/domain modules (pricing, ordering)
#   src/infrastructure/postgres PostgreSQL adapter/models
#
# Intentionally skipped from generic blog defaults that conflict with project
# rules: shared caches, rate-limit layers without a requirement, and speculative
# clustering.

## Status

Accepted on `feat/express-backend`.

## Consequences

- New HTTP features land under `src/v1/features/<name>/`.
- Domain rules stay outside Express controllers.
- OpenAPI paths remain `/api/v1/...` and `/health/...`.
