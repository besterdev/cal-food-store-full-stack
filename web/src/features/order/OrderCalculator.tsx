"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { listProducts } from "@/features/order/catalog";
import type { Product, ProductCode } from "@/features/order/catalog";
import { ProductCatalog } from "@/features/order/ProductCatalog";
import {
  formatSatang,
  formatThaiDateTime,
  OrderError,
  placeOrder,
  type OrderReceipt,
} from "@/features/order/place-order";

const createIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const memberPresent = (value: string) => value.trim() !== "";

interface OrderCalculatorProps {
  loadProducts?: () => Promise<Product[]>;
  submitOrder?: typeof placeOrder;
}

export const OrderCalculator = ({
  loadProducts = listProducts,
  submitOrder = placeOrder,
}: OrderCalculatorProps) => {
  const memberInputId = useId();
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null);
  const emptyAlertRef = useRef<HTMLDivElement>(null);
  const errorAlertRef = useRef<HTMLDivElement>(null);
  const firstProductControlRef = useRef<HTMLButtonElement | null>(null);
  const [quantities, setQuantities] = useState<
    Partial<Record<ProductCode, number>>
  >({});
  const [memberCardNumber, setMemberCardNumber] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [emptySubmitAttempted, setEmptySubmitAttempted] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const mutation = useMutation({
    mutationFn: submitOrder,
    retry: false,
    onSuccess: (nextReceipt) => {
      setReceipt(nextReceipt);
      setStatusMessage("Order accepted.");
    },
  });

  useEffect(() => {
    if (receipt) {
      receiptHeadingRef.current?.focus();
    }
  }, [receipt]);

  useEffect(() => {
    if (emptySubmitAttempted) {
      emptyAlertRef.current?.focus();
    }
  }, [emptySubmitAttempted]);

  useEffect(() => {
    if (mutation.error) {
      errorAlertRef.current?.focus();
    }
  }, [mutation.error]);

  const locked = mutation.isPending || receipt !== null;
  const selectedLines = (
    Object.entries(quantities) as [ProductCode, number | undefined][]
  )
    .filter((entry): entry is [ProductCode, number] => (entry[1] ?? 0) > 0)
    .map(([productCode, quantity]) => ({ productCode, quantity }));
  const hasLines = selectedLines.length > 0;

  const changeQuantity = (code: ProductCode, delta: -1 | 1) => {
    if (locked) {
      return;
    }
    setEmptySubmitAttempted(false);
    setIdempotencyKey(createIdempotencyKey());
    mutation.reset();
    setQuantities((current) => {
      const next = Math.min(999, Math.max(0, (current[code] ?? 0) + delta));
      return { ...current, [code]: next };
    });
  };

  const startNewOrder = () => {
    setQuantities({});
    setMemberCardNumber("");
    setReceipt(null);
    setEmptySubmitAttempted(false);
    setStatusMessage("");
    setIdempotencyKey(createIdempotencyKey());
    mutation.reset();
    queueMicrotask(() => {
      firstProductControlRef.current?.focus();
    });
  };

  const submitCurrentIntent = () => {
    mutation.mutate({
      idempotencyKey,
      lines: selectedLines,
      memberCardNumber:
        memberCardNumber.trim() === "" ? undefined : memberCardNumber,
    });
  };

  const submit = () => {
    if (!hasLines) {
      setEmptySubmitAttempted(true);
      return;
    }
    setEmptySubmitAttempted(false);
    submitCurrentIntent();
  };

  const removeRed = () => {
    if (locked) {
      return;
    }
    setEmptySubmitAttempted(false);
    setIdempotencyKey(createIdempotencyKey());
    mutation.reset();
    setQuantities((current) => ({ ...current, RED: 0 }));
  };

  const orderError =
    mutation.error instanceof OrderError ? mutation.error : null;
  const isRedConflict = orderError?.kind === "red_unavailable";
  const isIdempotencyConflict = orderError?.kind === "idempotency_conflict";
  const hasRedQuantity = (quantities.RED ?? 0) > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <div className="space-y-6 lg:col-span-7">
        <ProductCatalog
          disabled={locked}
          firstIncreaseRef={firstProductControlRef}
          loadProducts={loadProducts}
          onQuantityChange={changeQuantity}
          quantities={quantities}
        />

        <section aria-labelledby="member-heading" className="space-y-3">
          <div>
            <h2 className="text-lg font-bold" id="member-heading">
              Member details
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Any trimmed non-empty value qualifies in v1. The number is not
              stored on the receipt.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor={memberInputId}>
              Member Card number (optional)
            </label>
            <input
              autoComplete="off"
              className="border-border bg-card focus-visible:ring-ring mt-2 h-11 w-full rounded-[var(--radius-md)] border px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
              disabled={locked}
              id={memberInputId}
              onChange={(event) => {
                if (locked) {
                  return;
                }
                const nextValue = event.target.value;
                const presenceChanged =
                  memberPresent(memberCardNumber) !== memberPresent(nextValue);
                setEmptySubmitAttempted(false);
                setMemberCardNumber(nextValue);
                if (presenceChanged) {
                  setIdempotencyKey(createIdempotencyKey());
                  mutation.reset();
                }
              }}
              type="text"
              value={memberCardNumber}
            />
          </div>
        </section>

        <div className="space-y-3">
          {emptySubmitAttempted ? (
            <Alert
              aria-live="assertive"
              ref={emptyAlertRef}
              role="alert"
              tabIndex={-1}
            >
              Add at least one Product before placing the Order.
            </Alert>
          ) : null}
          {orderError ? (
            <Alert
              aria-live="assertive"
              ref={errorAlertRef}
              role="alert"
              tabIndex={-1}
              tone={isRedConflict ? "warning" : "danger"}
            >
              <div className="flex gap-3">
                <AlertTriangle
                  aria-hidden="true"
                  className={`mt-0.5 shrink-0 ${isRedConflict ? "text-warning" : "text-destructive"}`}
                  size={20}
                />
                <div>
                  <p className="font-semibold">
                    {isRedConflict
                      ? "Red is temporarily unavailable"
                      : orderError.message}
                  </p>
                  {isRedConflict && orderError.availableAt ? (
                    <p className="text-muted-foreground mt-1 text-sm">
                      Red is available again at{" "}
                      {formatThaiDateTime(orderError.availableAt)} น. Your other
                      Product quantities are preserved.
                    </p>
                  ) : null}
                  {orderError.kind === "unknown" ? (
                    <p className="text-muted-foreground mt-1 text-sm">
                      Your Order draft is unchanged. Edit quantities or start a
                      New Order if you need a different intent.
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {isRedConflict && hasRedQuantity ? (
                      <Button
                        onClick={removeRed}
                        type="button"
                        variant="secondary"
                      >
                        Remove Red
                      </Button>
                    ) : null}
                    {isIdempotencyConflict ? (
                      <Button
                        onClick={startNewOrder}
                        type="button"
                        variant="secondary"
                      >
                        New Order
                      </Button>
                    ) : null}
                    {orderError.retryable ? (
                      <Button
                        onClick={submitCurrentIntent}
                        type="button"
                        variant="outline"
                      >
                        <RefreshCw aria-hidden="true" size={18} />
                        Retry order
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </Alert>
          ) : null}
          {receipt ? (
            <Button
              className="w-full sm:w-auto"
              onClick={startNewOrder}
              type="button"
              variant="secondary"
            >
              New Order
            </Button>
          ) : (
            <Button
              aria-busy={mutation.isPending}
              className="w-full sm:w-auto"
              disabled={mutation.isPending}
              onClick={submit}
              type="button"
            >
              {mutation.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  size={18}
                />
              ) : null}
              Calculate & Place Order
            </Button>
          )}
          {!hasLines && !emptySubmitAttempted ? (
            <p className="text-muted-foreground text-sm">
              Add at least one Product before placing the Order.
            </p>
          ) : null}
        </div>
      </div>

      <aside
        aria-labelledby="pricing-heading"
        className="border-border bg-card self-start rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-receipt)] lg:sticky lg:top-6 lg:col-span-5"
      >
        <div className="border-primary border-t-4 pt-5">
          <ReceiptText aria-hidden="true" className="text-primary" size={24} />
          <h2
            className="mt-4 text-xl font-bold outline-none"
            id="pricing-heading"
            ref={receiptHeadingRef}
            tabIndex={-1}
          >
            Pricing Breakdown
          </h2>
          {receipt ? (
            <div className="mt-6 space-y-4 font-mono text-sm">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Order {receipt.orderId}
              </p>
              <ul className="space-y-2">
                {receipt.lines.map((line) => (
                  <li
                    className="flex items-start justify-between gap-4"
                    key={line.productCode}
                  >
                    <span>
                      {line.productName} × {line.quantity}
                    </span>
                    <span className="tabular-nums">
                      {formatSatang(line.lineTotalBeforeDiscountSatang)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-border space-y-2 border-t border-dashed pt-4">
                <div className="flex justify-between gap-4">
                  <span>Total before discount</span>
                  <span className="tabular-nums">
                    {formatSatang(receipt.totalBeforeDiscountSatang)}
                  </span>
                </div>
                {receipt.pairDiscounts.map((discount) => {
                  const productName =
                    receipt.lines.find(
                      (line) => line.productCode === discount.productCode,
                    )?.productName ?? discount.productCode;
                  const pairLabel =
                    discount.pairCount === 1
                      ? "1 pair"
                      : `${discount.pairCount} pairs`;

                  return (
                    <div
                      className="flex justify-between gap-4"
                      key={discount.productCode}
                    >
                      <span>
                        Pair discount · {productName}{" "}
                        <span className="text-muted-foreground">
                          ({pairLabel})
                        </span>
                      </span>
                      <span className="tabular-nums">
                        −{formatSatang(discount.discountSatang)}
                      </span>
                    </div>
                  );
                })}
                {receipt.pairDiscountTotalSatang > 0 ? (
                  <div className="flex justify-between gap-4">
                    <span>Pair discount total</span>
                    <span className="tabular-nums">
                      −{formatSatang(receipt.pairDiscountTotalSatang)}
                    </span>
                  </div>
                ) : null}
                {receipt.memberApplied ? (
                  <div className="flex justify-between gap-4">
                    <span>
                      Member discount{" "}
                      <span className="text-muted-foreground">(10%)</span>
                    </span>
                    <span className="tabular-nums">
                      −{formatSatang(receipt.memberDiscountSatang)}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="border-border flex items-end justify-between gap-4 border-t pt-4">
                <span className="font-sans text-base font-semibold">
                  Final Total
                </span>
                <span className="text-2xl font-semibold tabular-nums">
                  {formatSatang(receipt.finalTotalSatang)}
                </span>
              </div>
              <p className="text-muted-foreground font-sans text-xs">
                Accepted{" "}
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(receipt.acceptedAt))}
              </p>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground mt-2">
                Your accepted Receipt will appear here after the API calculates
                and places the Order.
              </p>
              <div className="border-border text-muted-foreground mt-6 border-t border-dashed pt-5 font-mono text-sm">
                No local price estimate
              </div>
            </>
          )}
        </div>
      </aside>
      <div aria-live="polite" className="sr-only">
        {statusMessage}
      </div>
    </div>
  );
};
