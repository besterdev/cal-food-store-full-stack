# Food Store Calculator Design System

Status: proposed for the Documentation Gate

## Design Read

Reading this as: a responsive operational calculator for food-store staff and customers, with a trustworthy modern market receipt language, restrained motion, and medium information density.

This is product UI, not a marketing page. It needs to make quantity entry, submission risk, discounts, conflicts, and the accepted receipt easy to understand. The memorable element is the receipt itself: clear rules, tabular money, quiet separators, and an immutable success state. Decorative imagery, a hero, promotional sections, marquees, glass effects, and animation libraries are intentionally absent.

### Operational dials

| Dial | Value | Effect |
| --- | ---: | --- |
| Design variance | 3/10 | Predictable alignment and stable control placement; slight receipt character comes from rules and typography, not asymmetric composition. |
| Motion intensity | 2/10 | Native hover, press, focus, and short state transitions only. No automatic or decorative motion. |
| Visual density | 6/10 | All seven Products remain scannable while touch targets, labels, and Pricing Breakdown retain comfortable spacing. |

The dials deliberately differ from landing-page defaults. Relevant `design-taste-frontend` checks apply to palette discipline, shape consistency, state completeness, form contrast, copy clarity, and preflight. Its landing-page-only requirements do not apply.

## Product Principles

1. **The API is the pricing authority.** The UI sends Product codes, quantities, optional Member Card input, and an idempotency key. It renders the API's Pricing Breakdown without reproducing discount calculations.
2. **One primary action per Order state.** Editing uses **Calculate & Place Order**. A successful receipt uses **New Order**. Retry appears only after a recoverable failure.
3. **The draft survives failure.** Validation, network, service, idempotency, and Red conflict states never clear or silently alter the Customer's intent.
4. **The receipt is evidence.** After success, freeze the submitted intent and returned Pricing Breakdown. Do not recalculate it from current catalog data.
5. **Color supports text.** Product name and code identify every Product. Semantic status always includes text and, where useful, a Lucide icon.
6. **Calm under concurrency.** A Red conflict explains what happened, shows local availability time, and offers a direct recovery path without making the whole calculator look destructive.

## Foundation

- Framework: Next.js App Router. Static composition is Server Component output; the calculator is a focused Client Component subtree.
- Styling: Tailwind CSS v4 with semantic CSS variables.
- Components: source-owned shadcn/ui backed by Radix primitives. Initial primitives are Button, Card, Input, Label, Alert, Badge, Skeleton, and Separator.
- Icons: Lucide only, 1.75px or 2px stroke within one visual layer. Do not hand-draw SVG paths or use emoji as interface icons.
- Theme: light only for v1. Do not add a dark-mode selector, `dark:` variants, or unused theme infrastructure.
- HTTP: one configured Axios client. Server state: TanStack React Query. Order draft state: React state or `useReducer`.

## Color Tokens

Define tokens once in global CSS and consume them through semantic Tailwind utilities. Raw color values do not belong in feature components.

### Semantic palette

| Token | Value | Usage |
| --- | --- | --- |
| `--background` | `#F5F3ED` | Warm-neutral page canvas |
| `--foreground` | `#202822` | Primary text |
| `--card` | `#FFFFFF` | Receipt and grouped control surfaces |
| `--card-foreground` | `#202822` | Text on card surfaces |
| `--popover` | `#FFFFFF` | Radix overlay surface if introduced |
| `--popover-foreground` | `#202822` | Text on overlays |
| `--primary` | `#175C45` | Primary action and strong emphasis |
| `--primary-foreground` | `#FFFFFF` | Text and icons on primary |
| `--secondary` | `#E7EEE9` | Quiet secondary actions and selected-neutral areas |
| `--secondary-foreground` | `#244B3B` | Text on secondary |
| `--muted` | `#ECE9E0` | Skeleton base and subdued grouping |
| `--muted-foreground` | `#59615B` | Supporting text; never use below 14px |
| `--accent` | `#DCE9E1` | Hover or active surface tint |
| `--accent-foreground` | `#174B38` | Text on accent |
| `--border` | `#D6D1C5` | Dividers and surface boundaries |
| `--input` | `#BFB9AC` | Input boundary |
| `--ring` | `#1D6F53` | Focus ring |
| `--success` | `#0F6B57` | Accepted Order status |
| `--success-surface` | `#E1F3EC` | Success message background |
| `--warning` | `#785600` | Red availability and caution text |
| `--warning-surface` | `#FFF3C4` | Conflict or caution background |
| `--destructive` | `#9D2F3A` | Invalid or failed state |
| `--destructive-surface` | `#FBE8EA` | Error background |

Primary text and action pairs must meet WCAG 2.2 AA: 4.5:1 for normal text and 3:1 for large text and UI boundaries. Verify actual computed values with axe and a contrast tool before release. Disabled text is not used to communicate required information.

Reference WCAG relative-luminance checks for the proposed values are: foreground on canvas 13.63:1, foreground on card 15.13:1, white on primary 7.91:1, secondary foreground on secondary 8.30:1, muted foreground on canvas 5.76:1, ring on canvas 5.48:1, success on success surface 5.59:1, warning on warning surface 6.03:1, and destructive on destructive surface 6.15:1. Browser-computed colors remain the release authority.

### Product palette

Product tokens are secondary identity accents, never status colors. Each Product row includes its written name and price, so color is redundant information.

| Product | Accent token | Accent | Tint token | Tint | Dark text token | Text |
| --- | --- | --- | --- | --- | --- | --- |
| Red | `--product-red` | `#C4473D` | `--product-red-tint` | `#F8E7E4` | `--product-red-foreground` | `#76271F` |
| Green | `--product-green` | `#587A36` | `--product-green-tint` | `#EAF1DF` | `--product-green-foreground` | `#344D1E` |
| Blue | `--product-blue` | `#35699E` | `--product-blue-tint` | `#E4EEF7` | `--product-blue-foreground` | `#254C73` |
| Yellow | `--product-yellow` | `#D4A317` | `--product-yellow-tint` | `#FFF3C7` | `--product-yellow-foreground` | `#654900` |
| Pink | `--product-pink` | `#B74E73` | `--product-pink-tint` | `#F8E6ED` | `--product-pink-foreground` | `#762E48` |
| Purple | `--product-purple` | `#7659A6` | `--product-purple-tint` | `#EEE8F7` | `--product-purple-foreground` | `#4B3970` |
| Orange | `--product-orange` | `#C4651B` | `--product-orange-tint` | `#FBEADB` | `--product-orange-foreground` | `#733A10` |

Do not place white body text directly on the Product accent without an explicit contrast check. Use the dark Product foreground on its tint for badges. Red Product identity and destructive state must also differ by wording, iconography, placement, and surface treatment.

The seven Product foreground-on-tint pairs range from 7.54:1 to 8.43:1 in the proposed palette. Accent swatches are redundant decoration beside the written Product name; they are not the only carrier of identity.

## Typography

- Primary family: Manrope through `next/font`, weights 400, 500, 600, and 700.
- Numeric and receipt family: IBM Plex Mono through `next/font`, weights 500 and 600.
- Fallbacks: `ui-sans-serif, system-ui, sans-serif` and `ui-monospace, SFMono-Regular, monospace`.
- Body: 16px/24px, weight 400.
- Supporting text: 14px/20px, weight 400 or 500. Do not use body copy below 14px.
- Page title: 30px/36px mobile, 36px/40px desktop, weight 700.
- Section heading: 20px/28px, weight 650 or 700.
- Product name and primary control label: 16px/24px, weight 600.
- Receipt total: 28px/32px mobile, 32px/36px desktop, mono weight 600.
- Prices, quantities, Order reference, and timestamps use tabular figures. Do not use mono for explanatory prose.
- Copy is direct and functional. Use the domain terms Product, Order, Order Line, Pair Discount, Member Discount, Pricing Breakdown, Final Total, and Red Availability Window consistently.

## Spacing, Shape, Elevation, and Motion

### Spacing

Use a 4px base scale: 4, 8, 12, 16, 24, 32, 40, 48, and 64px.

- Page gutter: 16px below 640px, 24px from 640px, 32px from 1024px.
- Section gap: 24px mobile, 32px desktop.
- Product row padding: 16px mobile, 20px desktop.
- Control cluster gap: at least 8px between touch targets.
- Form label to field: 8px. Field to helper or error: 8px.

### Shape

The shape system is consistently soft, not pill-heavy.

- `--radius-sm`: 8px for badges and small insets.
- `--radius-md`: 12px for inputs, buttons, alerts, and Product rows.
- `--radius-lg`: 16px for calculator and receipt surfaces.
- Pills are reserved for compact status badges. Quantity buttons remain rounded rectangles.

### Elevation

- Canvas groups mostly use borders and whitespace.
- Calculator surface: `0 1px 2px rgb(45 55 48 / 0.06)`.
- Receipt surface: `0 12px 32px rgb(45 55 48 / 0.10)` plus a 1px border.
- Do not nest multiple elevated cards. Product rows use a divider or tint within one catalog surface.

### Motion

- Color, border, and opacity transitions: 120-180ms, ease-out.
- Button press feedback may use opacity or `translateY(1px)` without moving adjacent layout.
- Receipt replacement may use a 150ms opacity transition only if it does not delay access to content.
- Skeleton shimmer is optional and must stop under `prefers-reduced-motion: reduce`; a static skeleton is the fallback.
- Never animate totals counting upward, availability time, width, height, or scroll position.

## Responsive Layout

The DOM and reading order are always: page introduction, Product controls, Member Card, submit or error recovery, then Pricing Breakdown.

| Viewport | Layout |
| --- | --- |
| `< 640px` | Single column, 16px gutter. Each Product row stacks identity and price above the quantity stepper when needed. Receipt follows the form. Primary actions span the available width. |
| `640-1023px` | Single column in a centered container up to 760px. Product identity and stepper share a row. Receipt remains after controls to preserve reading and focus order. |
| `>= 1024px` | Two columns in a container up to 1200px: 7/12 calculator and 5/12 receipt with a 32px gap. The receipt may be sticky with `top: 24px`, but it must not create nested scrolling. |

Use `min-h-dvh`, never disable browser zoom, and prevent horizontal scrolling at 320px. At 200% zoom on a 1280px viewport, the interface must reflow without loss of controls or content. Sticky behavior is removed when available height is too short or zoom causes overlap.

## Component Specifications

### Page frame

- One `h1`: **Food Store Calculator**.
- One short sentence explains that **Calculate & Place Order** creates an accepted Order.
- A skip link targets the `main` region.
- No marketing navigation is required for this single-purpose v1 surface.

### Product catalog

- Render exactly the API-defined display order.
- A Product row contains Product name, stable code where useful, unit price formatted in THB, a labeled Product accent, and quantity controls.
- The color swatch is decorative when the written Product name is present; otherwise give it an accessible name.
- Use a heading or `fieldset` and `legend` for the catalog grouping.
- Loading uses seven shape-matched skeleton rows to reserve the final layout.
- Terminal load failure replaces skeletons with an Alert, a concise reason, and **Retry products**.
- An empty but successful catalog response is a distinct contract-error state, not a valid empty store.

### Quantity stepper

- Use native `button` elements for decrease and increase. Lucide Minus and Plus are decorative inside buttons whose accessible names include Product name and action.
- Center quantity is a read-only displayed value or a labeled numeric input if direct entry is supported. The API constraint is 0 in the draft and 1-999 for submitted Order Lines.
- Decrease is disabled at zero. Both buttons expose at least a 44 by 44px target.
- Quantity changes update local draft state only. They never estimate authoritative discounts.

### Member Card field

- Visible label: **Member Card number (optional)**.
- Helper text explains that any trimmed non-empty value qualifies in v1 and that the number is not stored on the receipt.
- Do not validate format beyond the agreed non-empty trimmed behavior.
- Do not echo the raw value in errors, receipt content, logs, or analytics.

### Order action

- Primary label is exactly **Calculate & Place Order**.
- Disable it for an empty Order and while a submission is pending. Explain the empty state close to the action; do not rely on disabled appearance alone.
- Pending state retains the label context, adds a small busy indicator if needed, sets `aria-busy`, and locks all controls that would change the submitted intent.
- Do not allow button text to wrap at desktop widths.

### Pricing Breakdown and receipt

- Editing state shows a stable receipt placeholder explaining that the API will return totals after the Order is accepted. It must not show locally calculated estimates.
- Use receipt cues sparingly: white paper surface, strong top rule, dashed or dotted separators between logical groups, and mono tabular amounts. Do not simulate paper texture or torn edges.
- Accepted state contains Order reference, Order Lines, Total before discount, individual Pair Discounts by eligible Product, Pair Discount total if provided by contract, Member Discount, Final Total, and accepted time if provided.
- Labels align left and amounts align right. Negative discounts use a minus sign plus text label, not color alone.
- Final Total receives the strongest type and separator. Success status remains secondary to the amount and Order reference.
- **New Order** clears the locked receipt and draft and creates a new intent with a new idempotency key.

### Alerts and recovery

- Validation errors use `role="alert"`, field association, and focus the first invalid field after the error summary is announced.
- Network and service errors preserve the draft and offer **Retry order**. Manual retry of an unchanged intent reuses the same idempotency key.
- Red conflict uses warning styling, names Red explicitly, formats `available_at` in the Customer's local time with timezone context, preserves the draft, and offers a clear path to remove Red or retry later.
- Idempotency conflict states that the previous key belongs to a different Order intent and prompts a safe new submission path without retry loops.
- Toasts are not the sole carrier of persistent errors. If used for transient confirmation, they use `aria-live="polite"` and never steal focus.

## React Query and Axios UX Contract

- Product query key is stable and Product data remains fresh for five minutes.
- Retry Product reads at most twice and only for transient network or server failures. Do not retry validation or other deterministic client failures.
- Reuse fresh Product data without replacing the catalog with a blocking spinner. Background refresh may show a quiet non-blocking status.
- Order mutation automatic retries are disabled.
- An explicit retry with an unchanged canonical Order intent reuses the same idempotency key.
- Editing any submitted quantity or changing whether a trimmed Member Card is present invalidates that intent and generates a new key for the next submission.
- Starting **New Order** always generates a new intent and key.
- The configured Axios client owns base URL, JSON defaults, timeout, and conversion to the documented discriminated error model. UI behavior branches on typed error kind or stable API code, never message text.
- Network timeout, offline failure, validation failure, Red conflict, idempotency conflict, dependency failure, and unknown service failure have distinct messages and recovery actions.

## Accessibility Requirements

- Target WCAG 2.2 AA. Automated axe coverage is necessary but not sufficient.
- Prefer semantic HTML and role- or label-based test locators. If a control cannot be selected by role and accessible name, treat it as a likely defect.
- All controls are keyboard operable with logical DOM order. Native buttons respond to Enter and Space.
- Use a 2px visible focus ring with at least 2px offset. Focus is never removed or hidden behind a sticky receipt.
- Dynamic status uses a dedicated polite live region. Blocking validation and submission failure use assertive alert semantics only when immediate interruption is necessary.
- On success, move programmatic focus to the receipt heading with `tabIndex={-1}` after the live announcement. On error, focus the summary or first invalid control. Do not move focus for silent background Product refreshes.
- Icon-only buttons have Product-specific names such as **Increase Orange set quantity**.
- Touch targets are at least 44 by 44px with at least 8px separation.
- Product identity, availability, discount, success, and error never depend on color alone.
- Support browser text zoom to 200%, 320 CSS px width, Windows High Contrast or forced colors, and `prefers-reduced-motion`.
- Use locale-aware THB and local-time formatting while preserving an unambiguous machine timestamp in the API model.

## Visual and Interaction QA

Verify at minimum 320, 375, 768, 1024, and 1440 CSS px, plus 1280px at 200% zoom. Cover portrait and one constrained-height desktop viewport.

Capture and review:

1. Desktop editing state with all seven Products.
2. Desktop accepted receipt.
3. Mobile editing state.
4. Mobile accepted receipt.
5. Red conflict with local availability time and preserved quantities.

For each view, check no horizontal overflow, stable skeleton dimensions, correct two-column collapse, unwrapped primary CTA, aligned tabular amounts, readable focus, no clipped labels, no sticky overlap, and consistent Product accents. Run the same flows with reduced motion. The v1 visual QA matrix is light-only by explicit product decision.

## Design Preflight

- The Design Read and operational dials are reflected in the implementation.
- Semantic tokens, Product tokens, and the radius scale are used consistently.
- shadcn/ui is visibly customized and does not ship its default theme unchanged.
- Exactly one primary action is present for the current Order state.
- Loading, empty, validation, pending, recoverable failure, conflict, success, and New Order states are implemented.
- The receipt displays API data only; no frontend discount calculation exists.
- All seven Product identities remain clear without color.
- Every action has hover, active, focus-visible, disabled, and pending behavior where applicable.
- Button, form, status, and Product token contrast is measured rather than inferred.
- No decorative imagery, hand-written SVG, mixed icon family, dark-mode infrastructure, or animation dependency is introduced.
