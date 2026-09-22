# Agent Instructions: Food Store Calculator

## Project Overview

This repository contains a full-stack Food Store Calculator built with Next.js, TypeScript, Tailwind CSS, shadcn/ui, Go Fiber, and PostgreSQL.

The API is the only pricing authority. The frontend collects an Order draft and renders the Pricing Breakdown returned by the API; it must not duplicate discount calculations.

Prioritize, in order:

1. Correct business logic and transactional safety
2. Readability and explicit behavior
3. Maintainability and focused module boundaries
4. Extensibility without speculative abstraction
5. Accessibility, responsive UX, and performance

Use pnpm for frontend package management and script execution. Use the Go toolchain for backend commands. Do not introduce npm, Yarn, or Bun commands into documentation or automation.

## Source of Truth

- [GitHub Issue #1](https://github.com/besterdev/cal-food-store-full-stack/issues/1) is the parent product brief and tracker reference. The checked-in `docs/requirements.md` and `docs/openapi.yaml` are the detailed business and machine-readable contracts; when parent-issue shorthand differs, the checked-in contracts govern implementation.
- Read `CONTEXT.md` when it exists before changing domain terminology.
- Read relevant ADRs under `docs/adr/` before changing architecture or business behavior.
- Treat the OpenAPI document as the machine-readable HTTP contract.
- Update the relevant specification or decision document before intentionally changing an agreed contract or business rule.

## Tech Stack

### Frontend

- **Framework:** Next.js App Router with React Server Components by default
- **Language:** TypeScript and TSX with strict type safety
- **Styling:** Tailwind CSS v4 with semantic CSS variables
- **UI:** shadcn/ui as owned source, backed by Radix primitives
- **Icons:** Lucide as the single icon family
- **HTTP:** Axios through one configured API client
- **Server state:** TanStack React Query
- **Local feature state:** React state or `useReducer`
- **Unit/component tests:** Vitest and React Testing Library
- **Browser tests:** Playwright

Do not introduce Zustand, React Hook Form, Zod, Motion, or another state/form/animation library unless the requested behavior clearly needs it. Prefer platform and existing-project capabilities first.

### Backend

- **Language:** Go
- **HTTP framework:** Fiber
- **Database:** PostgreSQL
- **Database access:** Parameterized SQL through a narrow PostgreSQL adapter
- **Migrations:** Versioned, repeatable migration workflow
- **Tests:** Go table-driven unit tests, HTTP contract tests, and PostgreSQL integration tests

## Implementation Skill Workflow

When implementing GitHub Issue #1, use the following workflow and precedence. The accepted Product specification, OpenAPI contract, ADRs, and project design system override generic skill defaults when they conflict.

### 0. Create implementation tickets with `to-tickets`

- After the Documentation Gate passes, use `to-tickets` on GitHub Issue #1 before starting application implementation.
- Draft tracer-bullet vertical slices that each deliver verifiable end-to-end behavior.
- Declare only genuine blocking edges and obtain user approval for ticket granularity and dependencies before publishing.
- Publish approved child issues to GitHub with `ready-for-agent` and native blocking relationships where supported.
- Do not close or modify the parent specification issue.
- Work the unblocked frontier one ticket at a time with `implement`.

### 1. Orchestrate each ticket with `implement`

- Use `implement` as the top-level workflow for one approved implementation ticket at a time.
- Use TDD at the pre-agreed seams where practical.
- Typecheck and run focused tests throughout implementation, then run the full verification suite once at the end.
- Run `code-review` after implementation and address findings before committing.
- Commit only reviewed, verified work to the current branch using this repository's Gitmoji convention.

### 2. Shape modules with `codebase-design`

- Apply `codebase-design` before creating frontend, pricing, ordering, or persistence abstractions.
- Use its vocabulary precisely: Module, Interface, Implementation, Seam, Adapter, Depth, Leverage, and Locality.
- Prefer deep Modules with small Interfaces. The Order Module should hide pricing orchestration, idempotency, and Red Availability complexity behind the smallest useful Interface.
- Keep the public Interface as the main test surface. Introduce an Adapter only where behavior genuinely varies or an external system sits at a real Seam.
- Do not create hypothetical repository or provider Interfaces when only one Adapter exists and no test needs the Seam.

### 3. Apply the Next.js skills together

- Use `vercel-plugin:nextjs` for App Router architecture, RSC and Client Component placement, data-fetching strategy, error/loading files, font handling, and Docker self-hosting behavior.
- Use `vercel-plugin:next-best-practices` as the implementation checklist for file conventions, async APIs, serialization, hydration, Suspense, bundling, and image/font optimization.
- Default to the Node.js runtime and Server Components. The interactive Order calculator is a focused Client Component subtree because it uses React Query and local interaction state.
- Do not add Next.js Route Handlers as a proxy for the Go API unless the specification introduces a concrete browser or deployment requirement for that extra hop.
- When local Next.js documentation exists under `node_modules`, prefer it over recalled framework behavior.

### 4. Establish the UI direction before TSX implementation

- Use `ui-ux-pro-max` first to generate recommendations for a responsive food-store calculator and use the result to refine the approved design-system document.
- Use `frontend-design` to implement a distinctive, production-quality **modern market receipt** interface rather than a generic shadcn demo.
- Use `design-taste-frontend` only for relevant brief inference, anti-slop checks, typography, palette, shape consistency, interaction states, and final visual preflight.
- `design-taste-frontend` is not the primary workflow because it explicitly excludes product UI. Ignore its landing-page-only requirements such as heroes, logo walls, marketing imagery, marquees, and multi-section storytelling.
- Project decisions override generic taste defaults: Lucide remains the single icon family, the v1 application remains light-theme only, and no decorative imagery or animation dependency is required.
- Declare the design read before UI coding: a responsive operational calculator for food-store staff/customers, with a trustworthy modern-market receipt language, restrained motion, and medium information density.

### 5. Review React code once, using both React skill layers

- Apply `vercel-plugin:react-best-practices` after editing multiple TSX components as the operational component-quality review.
- Use `vercel-plugin:vercel-react-best-practices` as the detailed Vercel performance rule source for waterfalls, bundle size, serialization, re-renders, rendering, and JavaScript hot paths.
- These two skills overlap. Run one consolidated React review, not two duplicate review passes.
- React Query is the approved client data layer even where generic Vercel examples mention SWR.

### 6. Apply specialist verification skills

- Use `golang-swagger` when implementing or validating Fiber/OpenAPI documentation, while keeping the checked-in OpenAPI contract authoritative.
- Use `a11y-playwright-testing` for axe-core, keyboard, focus, form-label, accessible-name, and WCAG 2.2 AA browser coverage.
- Finish with the repository-wide `code-review` required by `implement`.

## Architecture Rules

### Frontend boundaries

- Create Server Components by default. Add `"use client"` only for event handlers, React hooks, browser APIs, or other client-only behavior.
- Keep Client Components focused. Push static markup and non-interactive composition back to Server Components when practical.
- Keep source-owned shadcn primitives in `@/components/ui/`.
- Keep shared application components in `@/components/common/` and Food Store feature components under `@/features/order/`.
- Prefer small components with explicit props over deep prop drilling, nested cards, or generic wrapper components.
- Use PascalCase for React component filenames and kebab-case for non-component utility modules.
- Use named arrow functions for React components and local utilities unless Next.js requires a specific export form.

### Backend boundaries

Use this dependency direction:

```text
Fiber handlers
    -> Order service
        -> Pure pricing module
        -> PostgreSQL adapter
```

- Handlers own HTTP decoding, validation mapping, status codes, and response serialization.
- The Order service owns transaction orchestration, idempotency, and Red Availability behavior.
- The pricing module is deterministic and contains no Fiber, SQL, clock, or network dependencies.
- The PostgreSQL adapter owns SQL and persistence details.
- Do not add a generic repository layer, event bus, cache, or queue without a concrete requirement.
- Accept `context.Context` at I/O boundaries and propagate cancellation and deadlines.
- Wrap errors with useful operation context while preserving errors that callers need to classify.

### API contract

- Keep endpoints versioned under `/api/v1`.
- Use integer satang (`int64`) for all money. Floating-point monetary calculations are forbidden.
- Use stable Product codes and stable machine-readable error codes.
- Reject malformed JSON, unknown fields, duplicate Products, invalid quantities, and unsupported Products.
- Require `Idempotency-Key` for Order creation.
- Never accept client-provided prices as authoritative.
- Never persist, return, or log the raw Member Card number.

### PostgreSQL and transactions

- PostgreSQL is the source of truth for Products, accepted Orders, idempotency, and the Red Availability Window.
- Apply schema changes through migrations; do not rely on manual database edits.
- Persist immutable Product price and discount snapshots with accepted Order Lines.
- Keep Red gate updates and Order persistence in the same transaction.
- Use PostgreSQL time for the rolling 60-minute Red Availability Window.
- Ensure rollback restores both Order persistence and Red availability.
- Keep development and test databases isolated.

## Front-End Development Rules

### Styling and design tokens

- Prefer native Tailwind utilities. Use inline styles only for values that must be calculated dynamically.
- Keep shared CSS limited to design tokens, global element behavior, and genuinely reusable patterns.
- Build mobile-first with Tailwind breakpoints. Add custom media queries only when Tailwind cannot express the requirement clearly.
- Use semantic tokens such as `bg-background`, `text-foreground`, `border-border`, `text-destructive`, and `ring-ring`.
- Treat generated shadcn/ui components as owned source, but preserve their accessibility behavior.
- Customize shadcn typography, spacing, radii, colors, and states to match the Food Store design system; do not ship an unmodified default theme.
- Product colors are secondary accents and must remain distinct from semantic success, warning, and destructive colors.
- The v1 interface is light-theme only. Do not add dark-mode infrastructure speculatively.
- Use Lucide icons only. Do not mix icon libraries or add hand-written SVG paths.

### TypeScript and external data

- Do not use `any`. Explicitly type props, function parameters, reducer actions, API payloads, and error variants.
- Prefer `interface` for object shapes and component props. Use `type` for unions, intersections, mapped types, and discriminated unions.
- Use `import type` for type-only imports.
- Pass only serializable values from Server Components to Client Components.
- Keep API types aligned with OpenAPI. Treat all HTTP data as untrusted and validate required fields at the API boundary before rendering.
- Model API failures as a discriminated, structured error shape rather than branching on message text.

### Axios and TanStack React Query

- Import Axios only through the configured API client; do not create ad hoc Axios instances.
- The client owns the API base URL, JSON defaults, timeout, and conversion into the documented error model.
- Do not put business rules or idempotency-key generation in Axios interceptors.
- Use TanStack React Query only for server state. Keep quantities, Member Card input, and the current Order intent in local feature state.
- Use a stable Product query key, a five-minute freshness window, and no more than two automatic retries for transient Product-read failures.
- Disable automatic retries for Order mutations.
- Reuse the same idempotency key when the user retries an unchanged Order intent.
- Generate a new idempotency key after editing the submitted intent or starting a New Order.

### Performance, accessibility, and UX

- Load fonts with `next/font` or local assets. Do not add external font stylesheet links.
- Use Next.js `<Image />` only when meaningful imagery is introduced; always provide dimensions, `sizes`, and useful alternative text.
- Provide deliberate loading, empty, validation, failure, retry, conflict, success, and recovery states.
- Preserve the Order draft after validation, network, service, or Red conflict errors.
- Use semantic HTML before ARIA. Ensure keyboard access, visible focus, accessible names, correct announcements, sufficient contrast, and 44-by-44-pixel minimum touch targets.
- Never rely on Product color alone to communicate identity or state.
- Respect `prefers-reduced-motion`; use animation only when it explains state or hierarchy.
- Prevent layout shifts and avoid unnecessary client-side JavaScript.

## Go Development Rules

- Format Go code with `gofmt`.
- Keep packages focused around catalog, pricing, ordering, PostgreSQL persistence, and HTTP transport responsibilities.
- Prefer plain structs and explicit functions over framework-like internal abstractions.
- Inject the narrow dependencies required by the Order service so pricing and transaction behavior remain testable.
- Validate quantities and arithmetic bounds before multiplying or summing monetary values.
- Make rounding rules explicit and test them at the pricing boundary.
- Use stable sentinel or typed errors only when callers must map them to a public error code.
- Do not log request bodies, secrets, raw idempotency keys, SQL credentials, or Member Card values.
- Return success only after the database transaction commits.

## Formatting and Readability

- Prettier is the frontend formatting source of truth.
- Keep `prettier-plugin-tailwindcss` loaded last when Prettier is configured.
- Do not manually restore Tailwind class ordering changed by Prettier.
- Separate directives, external imports, internal imports, declarations, hooks, early returns, and rendered JSX with sensible whitespace.
- Prefer readable guards, `switch` statements, and extracted named functions over deeply nested ternaries.
- Comments should explain business intent or a non-obvious constraint, not restate code.
- Avoid abbreviations when a domain term communicates the concept more clearly.

## Testing Strategy

- Test observable behavior and stable contracts, not implementation details.
- Use `POST /api/v1/orders` as the highest and primary test seam for validation, pricing, idempotency, Red availability, and receipt behavior.
- Use table-driven unit tests for the pure pricing module.
- Use real PostgreSQL integration tests for transaction rollback, exact Red-window boundaries, idempotent replay, and concurrent Red Orders.
- Test the Product endpoint for exactly seven seeded Products, stable codes, prices, currency, and display order.
- Frontend tests should exercise user-visible behavior and HTTP responses rather than Axios internals, React Query implementation details, Tailwind class strings, or shadcn component internals.
- Playwright must cover the normal Order flow, combined Pair and Member Discounts, and Red conflict recovery at mobile and desktop widths.
- Include accessibility checks and visible screenshot evidence for material UI work.
- Run backend concurrency tests with the Go race detector.

## Verification Before Handoff

Run every relevant check after implementation. Use project scripts once they exist; the expected verification surface is:

### Frontend

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

### Backend

```bash
gofmt -l .
go vet ./...
go test ./...
go test -race ./...
```

### Full stack

- Validate migrations against a clean PostgreSQL database.
- Run API contract and PostgreSQL integration tests.
- Run relevant Playwright flows against the real local stack.
- Verify representative mobile, tablet, and desktop widths.
- Do not claim completion without fresh command output and evidence proportional to the change risk.

## Commit Message Convention

Prefix each commit subject with one Gitmoji matching the primary intent, followed by a short imperative, lower-case summary with no trailing period:

```text
✨ add food store product selector
🐛 fix member discount rounding
📝 document order API contract
💄 restyle receipt summary
♻️ refactor pricing calculation
✅ add red-order concurrency tests
🔧 configure local postgres service
```

Do not stack multiple emojis in one subject.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `besterdev/cal-food-store-full-stack`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical GitHub triage-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with a root `CONTEXT.md` and system ADRs under `docs/adr/`. See `docs/agents/domain.md`.
