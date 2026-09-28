import type { Pool } from "pg";

export interface Product {
  code: string;
  name: string;
  unit_price_satang: number;
  currency: string;
  display_order: number;
  color_token: string;
}

export class ProductModel {
  constructor(private readonly pool: Pool) {}

  async listProducts(): Promise<Product[]> {
    const result = await this.pool.query<Product>(`
      SELECT code, name, unit_price_satang, currency, display_order, color_token
      FROM products
      ORDER BY display_order
    `);
    return result.rows;
  }
}
