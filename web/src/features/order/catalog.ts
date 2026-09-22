import { apiClient, isApiAxiosError } from "@/lib/api-client";

const productContract = [
  {
    code: "RED",
    name: "Red set",
    unitPriceSatang: 5000,
    displayOrder: 1,
    colorToken: "red",
  },
  {
    code: "GREEN",
    name: "Green set",
    unitPriceSatang: 4000,
    displayOrder: 2,
    colorToken: "green",
  },
  {
    code: "BLUE",
    name: "Blue set",
    unitPriceSatang: 3000,
    displayOrder: 3,
    colorToken: "blue",
  },
  {
    code: "YELLOW",
    name: "Yellow set",
    unitPriceSatang: 5000,
    displayOrder: 4,
    colorToken: "yellow",
  },
  {
    code: "PINK",
    name: "Pink set",
    unitPriceSatang: 8000,
    displayOrder: 5,
    colorToken: "pink",
  },
  {
    code: "PURPLE",
    name: "Purple set",
    unitPriceSatang: 9000,
    displayOrder: 6,
    colorToken: "purple",
  },
  {
    code: "ORANGE",
    name: "Orange set",
    unitPriceSatang: 12000,
    displayOrder: 7,
    colorToken: "orange",
  },
] as const;

export type ProductCode = (typeof productContract)[number]["code"];
export type ProductColorToken = (typeof productContract)[number]["colorToken"];
export type CatalogErrorKind = "network" | "service" | "contract" | "unknown";

export interface Product {
  code: ProductCode;
  name: string;
  unitPriceSatang: number;
  currency: "THB";
  displayOrder: number;
  colorToken: ProductColorToken;
}

interface ProductWire {
  code: unknown;
  name: unknown;
  unit_price_satang: unknown;
  currency: unknown;
  display_order: unknown;
  color_token: unknown;
}

interface ProductListWire {
  products?: unknown;
}

interface ErrorResponseWire {
  message?: unknown;
}

export class CatalogError extends Error {
  constructor(
    public readonly kind: CatalogErrorKind,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

const parseProduct = (
  value: unknown,
  expected: (typeof productContract)[number],
): Product => {
  if (!value || typeof value !== "object") {
    throw new CatalogError(
      "contract",
      "The API returned an invalid Product Catalog.",
      false,
    );
  }

  const product = value as ProductWire;
  if (
    product.code !== expected.code ||
    product.name !== expected.name ||
    product.unit_price_satang !== expected.unitPriceSatang ||
    product.currency !== "THB" ||
    product.display_order !== expected.displayOrder ||
    product.color_token !== expected.colorToken
  ) {
    throw new CatalogError(
      "contract",
      "The API returned an invalid Product Catalog.",
      false,
    );
  }

  return {
    code: expected.code,
    name: expected.name,
    unitPriceSatang: expected.unitPriceSatang,
    currency: "THB",
    displayOrder: expected.displayOrder,
    colorToken: expected.colorToken,
  };
};

const parseCatalog = (value: unknown): Product[] => {
  const products = (value as ProductListWire | null)?.products;
  if (!Array.isArray(products) || products.length !== 7) {
    throw new CatalogError(
      "contract",
      "The API returned an invalid Product Catalog.",
      false,
    );
  }

  return products.map((product, index) =>
    parseProduct(product, productContract[index]),
  );
};

const toCatalogError = (error: unknown): CatalogError => {
  if (!isApiAxiosError(error)) {
    return new CatalogError(
      "unknown",
      "An unexpected error prevented the Product Catalog from loading.",
      false,
    );
  }

  if (!error.response) {
    return new CatalogError(
      "network",
      "Check your connection, then try loading the Products again.",
      true,
    );
  }

  const body = error.response.data as ErrorResponseWire | undefined;
  const serverMessage =
    typeof body?.message === "string" ? body.message : undefined;
  if (error.response.status >= 500) {
    return new CatalogError(
      "service",
      serverMessage ?? "The Product service is temporarily unavailable.",
      true,
    );
  }

  return new CatalogError(
    "contract",
    "The Product service returned a response the calculator cannot use.",
    false,
  );
};

export const listProducts = async (): Promise<Product[]> => {
  try {
    const response = await apiClient.get<unknown>("/api/v1/products");
    return parseCatalog(response.data);
  } catch (error) {
    if (error instanceof CatalogError) {
      throw error;
    }

    throw toCatalogError(error);
  }
};
