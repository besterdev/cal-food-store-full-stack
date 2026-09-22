"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Minus,
  PackageOpen,
  Plus,
  RefreshCw,
} from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { CatalogError, listProducts } from "@/features/order/catalog";
import type {
  Product,
  ProductCode,
  ProductColorToken,
} from "@/features/order/catalog";
import { formatSatang } from "@/features/order/place-order";

const productQueryKey = ["products"] as const;
const productAccentClasses: Record<ProductColorToken, string> = {
  red: "bg-product-red-tint text-product-red-foreground",
  green: "bg-product-green-tint text-product-green-foreground",
  blue: "bg-product-blue-tint text-product-blue-foreground",
  yellow: "bg-product-yellow-tint text-product-yellow-foreground",
  pink: "bg-product-pink-tint text-product-pink-foreground",
  purple: "bg-product-purple-tint text-product-purple-foreground",
  orange: "bg-product-orange-tint text-product-orange-foreground",
};
const productSwatchClasses: Record<ProductColorToken, string> = {
  red: "bg-product-red",
  green: "bg-product-green",
  blue: "bg-product-blue",
  yellow: "bg-product-yellow",
  pink: "bg-product-pink",
  purple: "bg-product-purple",
  orange: "bg-product-orange",
};

interface ProductCatalogProps {
  loadProducts?: () => Promise<Product[]>;
  quantities: Partial<Record<ProductCode, number>>;
  disabled?: boolean;
  onQuantityChange: (code: ProductCode, delta: -1 | 1) => void;
  onProductsLoaded?: (products: Product[]) => void;
}

const formatUnitPrice = (product: Product) =>
  formatSatang(product.unitPriceSatang, product.currency);

const CatalogSkeleton = () => (
  <div aria-label="Loading products" className="space-y-3" role="status">
    <span className="sr-only">Loading Product Catalog</span>
    {Array.from({ length: 7 }, (_, index) => (
      <div
        className="border-border bg-card flex min-h-24 items-center justify-between gap-4 rounded-[var(--radius-md)] border p-4"
        data-testid="product-skeleton"
        key={index}
      >
        <div className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-11 w-36" />
      </div>
    ))}
  </div>
);

interface ProductRowProps {
  product: Product;
  quantity: number;
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}

const ProductRow = ({
  product,
  quantity,
  disabled,
  onDecrease,
  onIncrease,
}: ProductRowProps) => (
  <li className="border-border grid min-h-24 grid-cols-1 gap-4 border-b p-4 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className={`size-3 rounded-full ${productSwatchClasses[product.colorToken]}`}
        />
        <h3 className="text-foreground font-semibold">{product.name}</h3>
        <span
          className={`rounded-[var(--radius-sm)] px-2 py-0.5 font-mono text-xs font-semibold tracking-wide ${productAccentClasses[product.colorToken]}`}
        >
          {product.code}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 font-mono text-sm font-semibold tabular-nums">
        {formatUnitPrice(product)}{" "}
        <span className="font-sans font-normal">per set</span>
      </p>
    </div>

    <div
      aria-label={`${product.name} quantity controls`}
      className="flex items-center justify-end gap-2"
      role="group"
    >
      <Button
        aria-label={`Decrease ${product.name} quantity`}
        disabled={disabled || quantity === 0}
        onClick={onDecrease}
        size="icon"
        type="button"
        variant="outline"
      >
        <Minus aria-hidden="true" size={19} strokeWidth={2} />
      </Button>
      <span
        aria-label={`${product.name} quantity`}
        className="flex h-11 min-w-12 items-center justify-center font-mono text-base font-semibold tabular-nums"
        role="status"
      >
        {quantity}
      </span>
      <Button
        aria-label={`Increase ${product.name} quantity`}
        disabled={disabled || quantity >= 999}
        onClick={onIncrease}
        size="icon"
        type="button"
        variant="secondary"
      >
        <Plus aria-hidden="true" size={19} strokeWidth={2} />
      </Button>
    </div>
  </li>
);

export const ProductCatalog = ({
  loadProducts = listProducts,
  quantities,
  disabled = false,
  onQuantityChange,
}: ProductCatalogProps) => {
  const catalog = useQuery({
    queryKey: productQueryKey,
    queryFn: async () => {
      const products = await loadProducts();
      if (products.length === 0) {
        throw new CatalogError(
          "contract",
          "The API returned an invalid Product Catalog.",
          false,
        );
      }
      return products;
    },
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) =>
      error instanceof CatalogError && error.retryable && failureCount < 2,
  });

  if (catalog.isPending) {
    return <CatalogSkeleton />;
  }

  if (catalog.isError) {
    const message =
      catalog.error instanceof Error
        ? catalog.error.message
        : "The Product Catalog could not be loaded.";

    return (
      <Alert aria-live="assertive" role="alert">
        <div className="flex gap-3">
          <AlertTriangle
            aria-hidden="true"
            className="text-destructive mt-0.5 shrink-0"
            size={20}
          />
          <div>
            <h2 className="font-semibold">
              We couldn&apos;t load the Product Catalog
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">{message}</p>
            <Button
              className="mt-4"
              onClick={() => void catalog.refetch()}
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" size={18} />
              Retry products
            </Button>
          </div>
        </div>
      </Alert>
    );
  }

  return (
    <section aria-labelledby="catalog-heading">
      <div className="mb-4 flex items-start gap-3">
        <div className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]">
          <PackageOpen aria-hidden="true" size={21} />
        </div>
        <div>
          <h2 className="text-xl font-bold" id="catalog-heading">
            Choose Products
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Set quantities for this Order Draft. Prices come directly from the
            store.
          </p>
        </div>
      </div>
      <ul className="border-border bg-card overflow-hidden rounded-[var(--radius-lg)] border shadow-[var(--shadow-calculator)]">
        {catalog.data.map((product) => (
          <ProductRow
            disabled={disabled}
            key={product.code}
            onDecrease={() => onQuantityChange(product.code, -1)}
            onIncrease={() => onQuantityChange(product.code, 1)}
            product={product}
            quantity={quantities[product.code] ?? 0}
          />
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">
        Product quantities update in the controls above.
      </p>
    </section>
  );
};
