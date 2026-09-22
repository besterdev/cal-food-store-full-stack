# Food Store Calculator Test Plan

Status: proposed for the Documentation Gate

## Purpose and Quality Bar

This plan verifies the Food Store Calculator as one transactional product, from browser intent through API validation, pricing, PostgreSQL commit, and returned receipt. The highest-risk seam is `POST /api/v1/orders` because it exposes pricing, idempotency, Red availability, transactionality, and the immutable Pricing Breakdown together.

Tests assert observable behavior and stable contracts. They do not assert private function calls, SQL text, Axios internals, React Query internals, Tailwind class strings, or generated shadcn/ui structure.

The checked-in OpenAPI document is authoritative for exact paths, schemas, status codes, and stable error codes. This plan must be updated if that contract or an agreed business rule changes.

## Risk Priorities

- **P0:** A defect can accept the wrong amount, accept duplicate Orders, violate the Red Availability Window, lose committed data, expose Member Card data, or make the core flow inaccessible.
- **P1:** A defect blocks or seriously confuses a Customer but does not corrupt accepted Order state.
- **P2:** A defect reduces polish, resilience, or maintainability without breaking the core transaction.

## Risk-Based Matrix

| Priority | Risk area | Required seam | Core evidence |
| --- | --- | --- | --- |
| P0 | Pricing order, pair eligibility, rounding, overflow, and Final Total invariant | Pure pricing table tests plus Order API contract tests | Exact satang values for all required examples and invariant assertions |
| P0 | API accepts malformed, duplicate, unknown, empty, or out-of-range Order data | Order API contract tests | Contract-defined client status, stable error code, field errors where applicable, and no persistence |
| P0 | Automatic or repeated writes create duplicate Orders | Order API plus PostgreSQL integration | Idempotent replay returns the original Order; concurrent same-key requests persist once |
| P0 | Red gate admits more than one concurrent Red Order | Real PostgreSQL integration with at least 10 simultaneous attempts | Exactly one `201`; all other requests receive the contract-defined Red conflict; one Order and one gate advancement persist |
| P0 | A failed transaction consumes Red availability or leaves partial Order data | Fault-injected PostgreSQL integration | Both Order and Red gate roll back; a following valid Red Order succeeds |
| P0 | Exact 60-minute rule is off by one instant or uses application time | PostgreSQL-controlled integration | Before boundary conflicts; exactly at stored availability succeeds; database time is the authority |
| P0 | Raw Member Card or sensitive identifiers leak | API, persistence, and log inspection | No raw card in response, Order tables, structured logs, snapshots, or test failure output |
| P0 | Core flow is not keyboard or screen-reader operable | Playwright, axe-core, and manual assistive checks | Keyboard-only completion, named controls, visible focus, correct announcements, zero unapproved axe violations |
| P1 | Product catalog differs from the fixed source of truth | Product API contract tests | Exactly seven Products, stable codes, prices, THB currency, color token, and display order |
| P1 | Read retries or caching create unnecessary waits or request storms | Frontend integration with controlled clock and HTTP mock | Five-minute freshness, no more than two transient retries, no retry for deterministic failures |
| P1 | Order mutation retries without user intent or uses the wrong key | Frontend integration and Playwright network interruption | Zero automatic mutation retries; same key for unchanged manual retry; new key after edit or New Order |
| P1 | Failure clears the draft or prevents Red recovery | Component tests and Playwright | Quantities and Member Card presence remain; Customer can remove Red and submit remaining Products |
| P1 | Receipt differs from API response or changes after success | Component and E2E tests | Returned line snapshots and totals render exactly; success locks the submitted state |
| P1 | Responsive layout hides controls or receipt content | Playwright and visual review | No overflow or overlap at required viewports and 200% zoom |
| P1 | Dependency failure is reported as success or unsafe generic retry | API and UI integration | Contract-defined failure, no commit, preserved draft, explicit recovery action |
| P2 | Loading, empty, pressed, disabled, reduced-motion, or background refresh state is unclear | Component tests and visual QA | Deliberate state rendering with no layout shift |
| P2 | Typography, tokens, or Product accents drift | Screenshot review and design-system audit | Required screenshots match approved tokens, hierarchy, and color-independent identity |

## Test Layers and Ownership

| Layer | Tooling | Owns |
| --- | --- | --- |
| Pure domain | Go table-driven tests | Pair Discount eligibility, discount order, half-up rounding, bounds, overflow, and total invariants |
| HTTP contract | Go HTTP tests against Fiber | Decode rules, headers, validation mapping, Product contract, Order response and error schemas |
| Persistence and transaction | Go tests against isolated real PostgreSQL | Migrations, snapshots, idempotency, Red serialization, boundary time, rollback, multi-instance behavior |
| Frontend component | Vitest and React Testing Library | User-visible rendering and local Order draft behavior |
| Frontend integration | Vitest, React Testing Library, controlled Axios boundary, React Query provider | Cache, retries, structured errors, mutation state, idempotency-key lifecycle |
| Browser E2E | Playwright against the real local web, API, and PostgreSQL stack | Complete Customer flows, responsive behavior, accessibility, and screenshot evidence |
| Manual accessibility | Keyboard, screen reader, zoom, contrast, forced colors | Criteria that axe cannot reliably determine |

Development and test databases are isolated. Database suites reset only their own schema and do not share persistent state across tests. Time-sensitive Red tests control PostgreSQL time through an approved test seam or explicit database fixtures, never by sleeping for 60 minutes.

## P0 Pricing Coverage

All wire and persistence values use integer satang. Tests assert every intermediate discount and the Final Total, not only the final amount.

### Required worked examples

| Order | Total before discount | Pair Discount | After Pair Discount | Member Discount | Final Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Orange x2 | 24,000 | 1,200 | 22,800 | 0 | 22,800 |
| Pink x4 | 32,000 | 1,600 | 30,400 | 0 | 30,400 |
| Green x3 | 12,000 | 400 | 11,600 | 0 | 11,600 |
| Orange x2 with Member Card | 24,000 | 1,200 | 22,800 | 2,280 | 20,520 |
| Orange x3, Pink x2, Green x1, Blue x2 with Member Card | 62,000 | 2,000 | 60,000 | 6,000 | 54,000 |

### Table-driven cases

- Every catalog Product at quantity 1 with no Member Card.
- Orange, Pink, and Green quantities 0 through 4 at the pure pricing seam. Confirm `floor(quantity / 2)` same-Product pairs and a full-price odd remainder.
- Red, Blue, Yellow, and Purple at quantities 2 and 4 receive no Pair Discount.
- Unlike eligible Products are evaluated independently and never combined into a pair.
- Pair Discounts are applied before the Member Discount.
- Member Card cases: absent, empty, whitespace-only, leading or trailing whitespace, and non-empty. Only trimmed non-empty presence changes eligibility.
- Half-up rounding at exact half-satang boundaries using controlled synthetic unit-price fixtures in the pure pricing module. Do not alter the production catalog to manufacture a rounding case.
- Maximum valid quantities and totals remain within `int64` bounds.
- Multiplication, summation, or discount arithmetic that would overflow is rejected before persistence.
- Invariants for every successful result:
  - Pair Discount total equals the sum of per-Product Pair Discounts.
  - Member Discount is calculated from subtotal after Pair Discounts.
  - No discount is negative or greater than its eligible base.
  - `Final Total = Total before discount - Pair Discount total - Member Discount`.
  - Pricing is deterministic for equivalent canonical Order intents.

At the Order API seam, repeat representative pricing cases and assert the returned Pricing Breakdown plus immutable persisted unit-price and discount snapshots.

## Product API Contract

The Product endpoint test asserts exactly this ordered catalog:

| Display order | Code | Name | Unit price (satang) | Currency |
| ---: | --- | --- | ---: | --- |
| 1 | `RED` | Red set | 5,000 | `THB` |
| 2 | `GREEN` | Green set | 4,000 | `THB` |
| 3 | `BLUE` | Blue set | 3,000 | `THB` |
| 4 | `YELLOW` | Yellow set | 5,000 | `THB` |
| 5 | `PINK` | Pink set | 8,000 | `THB` |
| 6 | `PURPLE` | Purple set | 9,000 | `THB` |
| 7 | `ORANGE` | Orange set | 12,000 | `THB` |

Also assert stable Product code, display name, display order, API-owned color token, JSON schema, and content type. Verify that the frontend request does not supply or override authoritative prices.

## Order API Validation Matrix

Each rejected request asserts the exact OpenAPI-defined status and stable error code, a user-safe message, optional field errors where contracted, no Order rows, no Order Line rows, no idempotency success record, and no Red gate change.

| Case | Expected behavior |
| --- | --- |
| Malformed, truncated, empty, or multiple JSON values | Decode error; no persistence |
| Unknown top-level or nested field | Reject rather than silently ignore |
| Missing `Idempotency-Key` | Header error |
| Empty, longer than 128 characters, non-printable ASCII, or otherwise invalid key | Header error; never echo the raw key |
| Missing items, empty items, or more than seven unique lines | Validation error |
| Duplicate Product code | Validation error even if quantities could be combined |
| Unknown or empty Product code | Validation error |
| Quantity zero, negative, fractional, string, null, greater than 999, or arithmetically unsafe | Validation error |
| Client-provided price or discount field | Unknown-field rejection; never use client price |
| Member Card absent, null if disallowed by schema, empty, whitespace-only, and non-empty | Follow exact schema; canonical intent treats trimmed empty as absent and trimmed non-empty as present |
| Valid non-Red Order during blocked Red window | Accept normally |
| Unavailable database or commit failure | Contract-defined dependency failure; never return success |

Verify `application/json` request and response content types plus response-schema conformance. Fuzz the JSON decoder and validation boundary for panics and unexpected acceptance, while retaining deterministic seed cases in the normal suite.

## Idempotency

### Required behavior

1. First valid request with a new key returns `201` and persists exactly one Order.
2. Same key plus the same canonical Order intent returns the original Order and Pricing Breakdown without creating rows or re-evaluating Red availability.
3. Canonical equivalence ignores Order Line ordering and surrounding Member Card whitespace.
4. Canonical intent includes unique Product codes, quantities, and whether a trimmed Member Card is present. It never persists the raw card value.
5. Same key plus a different quantity, Product set, or Member presence returns the contract-defined idempotency conflict and leaves the original Order unchanged.
6. At least 10 concurrent identical requests with the same key return one logical Order. All successful replay responses identify that same Order.
7. A request that rolls back must not leave a replayable successful idempotency record.
8. Idempotent replay of an accepted Red Order succeeds even while the Red window is blocked and does not extend the window.
9. Behavior remains correct across two API instances sharing PostgreSQL.

Tests compare persisted row counts and immutable snapshots, not only response bodies.

## PostgreSQL Red Availability and Transaction Tests

Use a clean migrated test database and real transactions. The Red gate is a singleton row serialized by PostgreSQL. PostgreSQL time, not an application clock, determines availability.

### Concurrency

- Seed the gate as available.
- Start at least 10 Red-containing Order requests behind a synchronization barrier so they contend at the transaction boundary.
- Use unique idempotency keys and equivalent valid Order bodies.
- Assert exactly one `201`, nine contract-defined Red conflicts, one persisted Order, correct Order Lines, and one gate advancement.
- Repeat enough times to expose nondeterministic behavior and run the Go suite with the race detector.
- Repeat through two API processes or service instances against the same database.
- In a separate case, run non-Red Orders concurrently during the blocked window and assert all valid non-Red Orders remain eligible.

### Exact boundary

- Persist a known `available_at` value using the approved database test seam.
- At a database time strictly before `available_at`, a Red Order conflicts and returns that availability timestamp.
- At database time exactly equal to `available_at`, a Red Order succeeds.
- Immediately after acceptance, another new Red intent conflicts.
- Verify API serialization preserves the timestamp instant and the frontend formats it in local time without changing eligibility semantics.

### Rollback and durability

- Inject a failure after the gate is acquired or updated but before Order commit. Assert no Order, no Order Lines, no successful idempotency record, and the original gate value.
- Inject failures while writing an Order Line, snapshot, or idempotency record. Assert the same full rollback.
- After each failure, submit a valid Red Order and confirm it succeeds.
- Restart the API after a committed Red Order and assert the gate remains blocked.
- Apply all migrations to an empty database, verify seeds, roll forward according to the migration policy, and run the integration suite again.

## Frontend Component and Integration Coverage

### Product and draft behavior

- Render seven Products in API order with names, unit prices, written identity, and accessible quantity controls.
- Increase and decrease each quantity; decrease stops at zero.
- Quantity control accessible names include Product name and action.
- Member Card has a visible optional label and preserves typed input through recoverable failure.
- Empty draft cannot submit and includes an understandable explanation.
- A successful empty Product response is rendered as a contract error, distinct from loading.

### React Query Product behavior

Use a fresh QueryClient per test and a controlled clock.

- Stable query key is used for Product data.
- While data is fresh for five minutes, remount or revisit reuses the cached catalog without a blocking reload or unnecessary request.
- After freshness expires, the query may refresh according to configured policy while preserving usable prior data.
- A transient read failure retries no more than twice, with timers advanced deterministically.
- Deterministic client or contract failures do not retry.
- Loading skeleton dimensions match the Product list closely enough to prevent material layout shift.
- Terminal error exposes **Retry products** and a successful retry restores the catalog.

### Order mutation and key lifecycle

- Automatic mutation retries are disabled for all errors.
- Pending state disables draft-changing and submit controls, exposes busy state, and prevents duplicate intent actions.
- Network failure preserves the draft. **Retry order** resends the same unchanged intent with the same idempotency key.
- Editing quantity or changing trimmed Member Card presence after failure creates a new intent and new key for the next submission.
- Whitespace-only Member Card edits that do not change canonical presence do not create a different canonical intent.
- **New Order** clears receipt and draft and generates a new key.
- Structured errors are selected by discriminant or stable API code, never message string matching.
- Validation, Red conflict, idempotency conflict, timeout, offline, dependency, and unknown failures each render the designed recovery state.

### Receipt behavior

- Render exactly the API-returned Order reference, line price snapshots, Product Pair Discounts, Member Discount, Total before discount, and Final Total.
- Never infer, estimate, or recalculate a discount in frontend tests or production code.
- Success locks submitted quantities and Pricing Breakdown against later cache refreshes.
- **New Order** is the primary post-success action.
- Red conflict preserves the draft, announces the conflict, renders local availability time, and lets the Customer remove Red then submit remaining Products.

## Playwright End-to-End Flows

Run against the real local Next.js, Go API, and isolated PostgreSQL stack. Execute the core flow at desktop and mobile widths. Prefer role and label locators; CSS selectors are a fallback only for non-semantic visual evidence.

### Flow A: normal Order

1. Load the calculator and observe all seven Products in stable order.
2. Build a valid non-Red Order using keyboard controls.
3. Submit **Calculate & Place Order**.
4. Assert pending lock, one network mutation, accepted Order reference, API-returned line snapshots, and Final Total.
5. Activate **New Order** and assert a clean editable draft.

### Flow B: multiple Pair Discounts with Member Card

1. Select Orange x3, Pink x2, Green x1, and Blue x2.
2. Enter a Member Card with surrounding whitespace.
3. Submit and assert the exact worked-example breakdown: Total before discount 62,000 satang, Pair Discount 2,000, Member Discount 6,000, Final Total 54,000.
4. Assert Orange and Pink discounts are separate, Green x1 and Blue receive no Pair Discount, and the raw Member Card is absent from the receipt.

### Flow C: Red conflict recovery

1. Establish an accepted Red Order through the API fixture or setup step.
2. Build a second Order containing Red and at least one non-Red Product.
3. Submit and assert conflict announcement, local availability time, and preserved quantities.
4. Remove Red without rebuilding the rest of the draft.
5. Submit remaining Products successfully.

### Flow D: network interruption and idempotent retry

1. Submit a valid Order and interrupt the response after the server can have accepted it.
2. Assert no automatic mutation retry.
3. Manually retry unchanged intent and assert the same idempotency key is sent.
4. Assert one persisted Order and the original receipt.

Run A-C at 390 by 844 and 1440 by 900. Run smoke layout checks at 320, 768, and 1024 CSS px. Repeat a core flow at 1280px with browser zoom at 200% or an equivalent effective viewport and text scaling setup.

## WCAG 2.2 AA Verification

Automated axe scans catch only part of accessibility conformance. Every release candidate needs automation plus keyboard and manual review.

### Axe automation

- Use `@axe-core/playwright` after each target state is stable.
- Tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a`, and `wcag22aa`.
- Scan editing, Product load failure, validation error, pending, Red conflict, and accepted receipt states on mobile and desktop.
- Acceptance is zero unapproved violations. Never globally disable a rule. Any narrow exclusion requires a linked issue, WCAG criterion, user impact, owner, and expiry date.

### Keyboard and focus automation

- First Tab reveals and activates the skip link, then focus moves to `main`.
- Tab order follows Product controls, Member Card, submit or recovery action, and receipt actions in logical DOM order.
- Enter and Space operate native buttons. Quantity changes do not trap focus.
- Focus indication is visible, at least 2px, and not obscured by sticky content.
- On invalid submit, error summary or first invalid control receives focus and the message is associated with the control.
- During pending state, disabled controls are skipped or announced correctly without focus loss.
- On Red conflict, focus reaches the conflict heading or alert once; the Customer can then reach Red controls and recovery actions.
- On success, focus moves to the receipt heading and **New Order** returns focus to the first meaningful draft control.

### Accessible names and announcements

- All quantity controls have names such as **Increase Orange set quantity** and **Decrease Orange set quantity**.
- Product name, quantity, unit price, discount label, Final Total, and Order reference have an understandable reading order.
- A polite live region announces load completion and success. Blocking errors use appropriate alert semantics without repeated announcements.
- Product color is redundant to written Product name. Discount and status meaning remain understandable in grayscale and forced colors.

### Manual WCAG checks

- Measure text, icon, focus, border, success, warning, destructive, and Product foreground contrast against actual computed backgrounds.
- Complete all flows at 200% browser zoom with no horizontal two-dimensional scrolling, clipped controls, or lost content.
- Verify reflow at 320 CSS px and constrained landscape height.
- Enable `prefers-reduced-motion`; confirm no shimmer or transition is required to understand or operate the UI.
- Enable Windows forced colors or an equivalent high-contrast mode; verify controls, focus, and Product identities remain visible.
- Test VoiceOver with Safari on macOS and one additional screen reader and browser combination selected before release. Confirm landmarks, headings, labels, live regions, and focus movement.
- Verify 44 by 44px minimum targets and at least 8px spacing for adjacent quantity controls.

## Screenshot and Visual Evidence

Store deterministic Playwright screenshots as test artifacts, not as the only assertions. Freeze database fixtures, locale, timezone, viewport, font loading, and animation preferences for repeatability.

Required evidence:

| Artifact | Viewport | State |
| --- | --- | --- |
| `desktop-editing.png` | 1440 by 900 | Seven Products, non-empty draft, Member Card area, receipt placeholder |
| `desktop-receipt.png` | 1440 by 900 | Accepted Order with Pair and Member Discounts |
| `mobile-editing.png` | 390 by 844 | Single-column draft and reachable primary action |
| `mobile-receipt.png` | 390 by 844 | Accepted receipt after controls |
| `red-conflict.png` | 390 by 844 and 1440 by 900 | Preserved draft, local availability time, and recovery action |

Review screenshots for token use, Product-name visibility, tabular amount alignment, focus visibility, unwrapped CTA, receipt hierarchy, no layout shift or clipping, and correct responsive ordering. Update baselines only after a human confirms the visual change is intentional and consistent with `docs/design-system.md`.

## Security, Privacy, and Observability Checks

- Inspect database rows and logs after Member Orders. Raw Member Card values, request bodies, database credentials, raw idempotency keys, and stack traces must not appear.
- Confirm errors expose request IDs and user-safe messages without internal details.
- Verify logs and low-cardinality metrics distinguish accepted Orders, Red conflicts, idempotency replay or conflict, and transaction failure without sensitive values.
- Test integer and JSON boundary inputs for denial-of-service amplification, panic, or excessive allocation at the public HTTP boundary.

## Verification Commands

Use repository scripts once they exist.

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

- Apply migrations to a clean PostgreSQL test database.
- Run API contract and PostgreSQL integration suites.
- Run Playwright against the real local stack at required viewports.
- Archive HTML or JSON test reports, race-detector output, required screenshots, and failure traces.

## Acceptance Gate

The feature is ready for handoff only when all of the following are true:

1. Every P0 test passes repeatedly, including at least 10 simultaneous Red attempts with exactly one accepted Order.
2. Pricing worked examples, rounding boundaries, overflow rejection, and Final Total invariants pass at pure and representative API seams.
3. Idempotent replay, different-intent conflict, concurrent same-key requests, rollback, restart, multi-instance, and exact 60-minute Red boundary tests pass against real PostgreSQL.
4. Product and Order responses conform to the checked-in OpenAPI contract.
5. Frontend tests prove five-minute Product freshness, no more than two transient read retries, no automatic Order mutation retry, and correct idempotency-key lifecycle.
6. Required Playwright flows pass on mobile and desktop against the real stack.
7. Axe reports zero unapproved WCAG 2.2 AA violations in all target states; keyboard, focus, zoom, contrast, reduced-motion, forced-color, and screen-reader checks are signed off manually.
8. All required screenshots are attached and visually reviewed against the design system.
9. Frontend format, lint, typecheck, unit tests, and production build pass. Backend formatting, vet, tests, race detector, migrations, contract tests, and integration tests pass.
10. No raw Member Card value or prohibited secret appears in persistence, responses, logs, screenshots, or reports.
11. Any P1 failure blocks handoff unless the Product owner explicitly accepts it with a linked issue, risk, owner, and remediation date. P2 findings may defer only with the same documented ownership.
