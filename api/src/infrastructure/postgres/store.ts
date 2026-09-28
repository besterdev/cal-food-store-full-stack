import type { Pool } from "pg";

import type { Product } from "../../modules/catalog/product.js";
import type { OrderStore, PlacementTx } from "../../modules/ordering/order.js";
import { CatalogStore } from "./catalog.js";
import { PlacementStore } from "./placement.js";
import { ReadinessStore } from "./readiness.js";
import { RedStore } from "./red.js";

/** Facade over catalog, readiness, red gate, and order placement adapters. */
export class PostgresStore implements OrderStore {
  private readonly catalog: CatalogStore;
  private readonly readiness: ReadinessStore;
  private readonly red: RedStore;
  private readonly placement: PlacementStore;

  constructor(pool: Pool) {
    this.catalog = new CatalogStore(pool);
    this.readiness = new ReadinessStore(pool);
    this.red = new RedStore(pool);
    this.placement = new PlacementStore(pool);
  }

  listProducts(signal?: AbortSignal): Promise<Product[]> {
    return this.catalog.listProducts(signal);
  }

  ready(signal?: AbortSignal): Promise<void> {
    return this.readiness.ready(signal);
  }

  resetRedAvailability(signal?: AbortSignal): Promise<void> {
    return this.red.resetRedAvailability(signal);
  }

  beginPlacement(signal?: AbortSignal): Promise<PlacementTx> {
    return this.placement.beginPlacement(signal);
  }
}
