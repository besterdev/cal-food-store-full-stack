import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Product } from "@/features/order/catalog";
import { OrderCalculator } from "@/features/order/OrderCalculator";
import {
  OrderError,
  type OrderReceipt,
  type PlaceOrderInput,
} from "@/features/order/place-order";

const products: Product[] = [
  {
    code: "RED",
    name: "Red set",
    unitPriceSatang: 5000,
    currency: "THB",
    displayOrder: 1,
    colorToken: "red",
  },
  {
    code: "GREEN",
    name: "Green set",
    unitPriceSatang: 4000,
    currency: "THB",
    displayOrder: 2,
    colorToken: "green",
  },
  {
    code: "BLUE",
    name: "Blue set",
    unitPriceSatang: 3000,
    currency: "THB",
    displayOrder: 3,
    colorToken: "blue",
  },
  {
    code: "YELLOW",
    name: "Yellow set",
    unitPriceSatang: 5000,
    currency: "THB",
    displayOrder: 4,
    colorToken: "yellow",
  },
  {
    code: "PINK",
    name: "Pink set",
    unitPriceSatang: 8000,
    currency: "THB",
    displayOrder: 5,
    colorToken: "pink",
  },
  {
    code: "PURPLE",
    name: "Purple set",
    unitPriceSatang: 9000,
    currency: "THB",
    displayOrder: 6,
    colorToken: "purple",
  },
  {
    code: "ORANGE",
    name: "Orange set",
    unitPriceSatang: 12000,
    currency: "THB",
    displayOrder: 7,
    colorToken: "orange",
  },
];

const receipt: OrderReceipt = {
  orderId: "018f4f10-67a4-7ab1-ae12-5ce1d93f6417",
  acceptedAt: "2026-09-21T10:15:30Z",
  currency: "THB",
  lines: [
    {
      productCode: "BLUE",
      productName: "Blue set",
      quantity: 2,
      unitPriceSatang: 3000,
      lineTotalBeforeDiscountSatang: 6000,
    },
  ],
  totalBeforeDiscountSatang: 6000,
  pairDiscounts: [],
  pairDiscountTotalSatang: 0,
  memberApplied: false,
  memberDiscountSatang: 0,
  finalTotalSatang: 6000,
};

const renderCalculator = (options?: {
  submitOrder?: (input: PlaceOrderInput) => Promise<OrderReceipt>;
}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OrderCalculator
        loadProducts={async () => products}
        submitOrder={options?.submitOrder}
      />
    </QueryClientProvider>,
  );
};

describe("OrderCalculator", () => {
  it("places a non-discounted Order and locks the server receipt", async () => {
    const user = userEvent.setup();
    const submitOrder = vi.fn(async (input: PlaceOrderInput) => {
      expect(input.lines).toEqual([{ productCode: "BLUE", quantity: 2 }]);
      expect(input.idempotencyKey).toBeTruthy();
      return receipt;
    });
    renderCalculator({ submitOrder });

    await screen.findByText("Blue set");
    await user.click(
      screen.getByRole("button", { name: "Increase Blue set quantity" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Increase Blue set quantity" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Calculate & Place Order" }),
    );

    expect(await screen.findByText(/Order 018f4f10/)).toBeInTheDocument();
    expect(screen.getByText("Final Total")).toBeInTheDocument();
    expect(screen.getAllByText(/THB.*60\.00/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Increase Blue set quantity" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "New Order" }),
    ).toBeInTheDocument();
  });

  it("reuses the same idempotency key on manual retry of an unchanged intent", async () => {
    const user = userEvent.setup();
    const keys: string[] = [];
    const submitOrder = vi.fn(async (input: PlaceOrderInput) => {
      keys.push(input.idempotencyKey);
      if (keys.length === 1) {
        throw new OrderError(
          "network",
          "Check your connection, then retry this Order.",
          true,
        );
      }
      return receipt;
    });

    renderCalculator({ submitOrder });
    await screen.findByText("Blue set");
    await user.click(
      screen.getByRole("button", { name: "Increase Blue set quantity" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Calculate & Place Order" }),
    );
    expect(
      await screen.findByRole("button", { name: "Retry order" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry order" }));

    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(2));
    expect(keys[0]).toBe(keys[1]);
    expect(await screen.findByText(/Order 018f4f10/)).toBeInTheDocument();
  });

  it("blocks empty submission without calling the API", async () => {
    const submitOrder = vi.fn(async () => receipt);
    renderCalculator({ submitOrder });

    await screen.findByText("Blue set");
    expect(
      screen.getByRole("button", { name: "Calculate & Place Order" }),
    ).toBeDisabled();
    expect(submitOrder).not.toHaveBeenCalled();
  });
});
