import type { Pool } from "pg";

import type { Product } from "../../modules/catalog/product.js";
import { ErrInvalidCatalog } from "../../modules/catalog/product.js";
import { query } from "./query.js";

const CONTRACT_PRODUCTS: Product[] = [
  {
    code: "RED",
    name: "Red set",
    unit_price_satang: 5000,
    currency: "THB",
    display_order: 1,
    color_token: "red",
  },
  {
    code: "GREEN",
    name: "Green set",
    unit_price_satang: 4000,
    currency: "THB",
    display_order: 2,
    color_token: "green",
  },
  {
    code: "BLUE",
    name: "Blue set",
    unit_price_satang: 3000,
    currency: "THB",
    display_order: 3,
    color_token: "blue",
  },
  {
    code: "YELLOW",
    name: "Yellow set",
    unit_price_satang: 5000,
    currency: "THB",
    display_order: 4,
    color_token: "yellow",
  },
  {
    code: "PINK",
    name: "Pink set",
    unit_price_satang: 8000,
    currency: "THB",
    display_order: 5,
    color_token: "pink",
  },
  {
    code: "PURPLE",
    name: "Purple set",
    unit_price_satang: 9000,
    currency: "THB",
    display_order: 6,
    color_token: "purple",
  },
  {
    code: "ORANGE",
    name: "Orange set",
    unit_price_satang: 12000,
    currency: "THB",
    display_order: 7,
    color_token: "orange",
  },
];

export class CatalogStore {
  constructor(private readonly pool: Pool) {}

  async listProducts(signal?: AbortSignal): Promise<Product[]> {
    const result = await query<{
      code: string;
      name: string;
      unit_price_satang: string | number;
      currency: string;
      display_order: string | number;
      color_token: string;
    }>(
      this.pool,
      `
        SELECT code, name, unit_price_satang, currency, display_order, color_token
        FROM products
        ORDER BY display_order ASC
      `,
      undefined,
      signal,
    );
    const products: Product[] = result.rows.map((row) => ({
      code: row.code,
      name: row.name,
      unit_price_satang: Number(row.unit_price_satang),
      currency: row.currency,
      display_order: Number(row.display_order),
      color_token: row.color_token,
    }));
    if (!matchesContract(products)) {
      throw ErrInvalidCatalog;
    }
    return products;
  }
}

const matchesContract = (products: Product[]): boolean => {
  if (products.length !== CONTRACT_PRODUCTS.length) {
    return false;
  }
  return CONTRACT_PRODUCTS.every((expected, index) => {
    const got = products[index];
    return (
      got !== undefined &&
      got.code === expected.code &&
      got.name === expected.name &&
      Number(got.unit_price_satang) === expected.unit_price_satang &&
      got.currency === expected.currency &&
      Number(got.display_order) === expected.display_order &&
      got.color_token === expected.color_token
    );
  });
};
