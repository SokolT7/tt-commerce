import type { FiscalDoc, Flight, Merchant, Order, Product } from "@/domain/types";

/**
 * Repository interfaces. The in-memory implementation is demo-only; production
 * swaps in Postgres behind these same signatures without touching domain code.
 */

export interface Repository<T extends { id: string }> {
  all(): T[];
  get(id: string): T | undefined;
  put(item: T): T;
  remove(id: string): void;
  clear(): void;
}

export class MemoryRepository<T extends { id: string }> implements Repository<T> {
  protected items = new Map<string, T>();

  constructor(seed: T[] = []) {
    for (const s of seed) this.items.set(s.id, s);
  }

  all(): T[] { return [...this.items.values()]; }
  get(id: string): T | undefined { return this.items.get(id); }
  put(item: T): T { this.items.set(item.id, item); return item; }
  remove(id: string): void { this.items.delete(id); }
  clear(): void { this.items.clear(); }
  replaceAll(items: T[]): void {
    this.items.clear();
    for (const i of items) this.items.set(i.id, i);
  }
}

export class OrderRepository extends MemoryRepository<Order> {
  byMerchant(merchantId: string): Order[] {
    return this.all().filter((o) => o.merchantId === merchantId);
  }
  live(): Order[] {
    return this.all().filter(
      (o) => !["COMPLETED", "REJECTED", "CANCELLED", "ABORTED"].includes(o.state),
    );
  }
}

export interface Stores {
  merchants: MemoryRepository<Merchant>;
  products: MemoryRepository<Product>;
  flights: MemoryRepository<Flight>;
  orders: OrderRepository;
  fiscal: MemoryRepository<FiscalDoc>;
}
