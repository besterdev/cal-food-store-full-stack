import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Product, ProductCode } from "@/features/order/catalog";
import { CatalogError } from "@/features/order/catalog";
import { ProductCatalog } from "@/features/order/ProductCatalog";

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

const ControlledCatalog = ({
  loadProducts,
}: {
  loadProducts: () => Promise<Product[]>;
}) => {
  const [quantities, setQuantities] = useState<
    Partial<Record<ProductCode, number>>
  >({});

  return (
    <ProductCatalog
      loadProducts={loadProducts}
      onQuantityChange={(code, delta) => {
        setQuantities((current) => {
          const next = Math.min(999, Math.max(0, (current[code] ?? 0) + delta));
          return { ...current, [code]: next };
        });
      }}
      quantities={quantities}
    />
  );
};

const renderCatalog = (loadProducts: () => Promise<Product[]>) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 1 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ControlledCatalog loadProducts={loadProducts} />
    </QueryClientProvider>,
  );
};

describe("ProductCatalog", () => {
  it("shows shape-matched loading rows while the catalog is loading", () => {
    renderCatalog(() => new Promise(() => undefined));

    expect(
      screen.getByRole("status", { name: "Loading products" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("product-skeleton")).toHaveLength(7);
  });

  it("renders API products and updates accessible quantity controls without going below zero", async () => {
    const user = userEvent.setup();
    renderCatalog(async () => products);

    const redHeading = await screen.findByText("Red set");
    expect(redHeading).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    const redProduct = redHeading.closest("li");
    expect(redProduct).not.toBeNull();
    expect(
      within(redProduct as HTMLLIElement).getByText(/THB.*50\.00/),
    ).toBeInTheDocument();

    const decrease = screen.getByRole("button", {
      name: "Decrease Red set quantity",
    });
    const increase = screen.getByRole("button", {
      name: "Increase Red set quantity",
    });
    const quantity = screen.getByRole("status", { name: "Red set quantity" });

    expect(quantity).toHaveTextContent("0");
    expect(decrease).toBeDisabled();

    await user.click(increase);
    expect(quantity).toHaveTextContent("1");

    await user.click(decrease);
    expect(quantity).toHaveTextContent("0");
    expect(decrease).toBeDisabled();
  });

  it("offers an explicit retry after a terminal catalog failure", async () => {
    const user = userEvent.setup();
    const loadProducts = vi
      .fn<() => Promise<Product[]>>()
      .mockRejectedValueOnce(
        new CatalogError(
          "service",
          "Products are temporarily unavailable.",
          false,
        ),
      )
      .mockResolvedValue(products);

    renderCatalog(loadProducts);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load the Product Catalog",
    );
    await user.click(screen.getByRole("button", { name: "Retry products" }));

    expect(await screen.findByText("Red set")).toBeInTheDocument();
    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(2));
  });

  it("treats an empty successful response as a contract error", async () => {
    renderCatalog(async () => []);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "invalid Product Catalog",
    );
  });
});
