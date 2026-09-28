export interface Product {
  code: string;
  name: string;
  unit_price_satang: number;
  currency: string;
  display_order: number;
  color_token: string;
}

export const ErrInvalidCatalog = new Error("catalog data violates the contract");

export interface ProductLister {
  listProducts(): Promise<Product[]>;
}
