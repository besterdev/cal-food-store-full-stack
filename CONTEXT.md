# Food Store Ordering

This context describes the shared language for selecting Food Store Products, accepting an Order, explaining its price, and controlling Red availability.

## Catalog

**Product**:
A named food set offered by the Food Store with a stable identity and Unit Price.
_Avoid_: Item, color, menu entry

**Product Code**:
The stable, language-neutral identity of a Product.
_Avoid_: Product ID, color name

**Product Catalog**:
The store-defined collection of Products that may be included in an Order.
_Avoid_: Menu, inventory

**Unit Price**:
The price of one set of a Product before any discount.
_Avoid_: Rate, list price

## Ordering

**Customer**:
The person for whom an Order is prepared and placed.
_Avoid_: User, shopper, account

**Order Draft**:
The Customer's editable Product quantities and optional Member Card entry before placement.
_Avoid_: Cart, basket, Order

**Order Intent**:
The normalized meaning of a placement request: its Product quantities and whether Member status is claimed.
_Avoid_: Request body, Order Draft

**Order**:
An accepted, immutable record of the selected Product quantities and their agreed Pricing Breakdown.
_Avoid_: Quote, calculation, cart

**Order Line**:
The unique Product and positive quantity represented within an Order.
_Avoid_: Item, row

**Calculate & Place Order**:
The Customer command that requests acceptance of an Order and its Pricing Breakdown; it is not a price preview.
_Avoid_: Calculate, quote

**Member Card**:
An optional Customer identifier whose non-empty presence claims Member status for an Order.
_Avoid_: Loyalty account, customer account

**Receipt**:
The presentation of an accepted Order reference and its immutable Pricing Breakdown.
_Avoid_: Quote, invoice

## Pricing

**Total Before Discount**:
The sum of all Order Lines at their Unit Prices before any deduction.
_Avoid_: Final Total, amount due

**Pair**:
Two sets of the same Pair-eligible Product within one Order Line.
_Avoid_: Bundle, mixed pair

**Pair Discount**:
The promotional deduction earned by complete Pairs of an eligible Product.
_Avoid_: Bundle Discount, multi-buy discount

**Member Discount**:
The Order-level deduction for a Customer who claims Member status, applied after Pair Discounts.
_Avoid_: Pair Discount, card rebate

**Pricing Breakdown**:
The itemized explanation of an Order's Total Before Discount, Pair Discounts, Member Discount, and Final Total.
_Avoid_: Estimate, quote

**Final Total**:
The amount due after all Pair Discounts and any Member Discount.
_Avoid_: Total Before Discount, subtotal

## Red Availability

**Red Order**:
An Order containing a positive quantity of the Red Product.
_Avoid_: Red request, Red cart

**Red Availability Window**:
The rolling 60-minute interval after an accepted Red Order during which another Red Order cannot be accepted store-wide.
_Avoid_: Stock timeout, cooldown

**Red Conflict**:
The rejection of a Red Order because the Red Availability Window is still active.
_Avoid_: Out of stock, validation error
