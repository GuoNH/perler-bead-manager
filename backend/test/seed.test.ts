import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mard291Colors } from "../src/catalog/mard-291.js";
import { MARD_BRAND, seedMard291IfEmpty } from "../src/storage/seed.js";
import { openDb, WarehouseStore } from "../src/storage/warehouse-store.js";

describe("seedMard291IfEmpty", () => {
  let db: ReturnType<typeof openDb>;
  let store: WarehouseStore;
  beforeEach(() => {
    db = openDb(":memory:");
    store = new WarehouseStore(db);
  });
  afterEach(() => db.close());

  it("seeds 291 Mard colors into an empty warehouse", () => {
    expect(seedMard291IfEmpty(store)).toBe(291);
    const items = store.listInventory();
    expect(items).toHaveLength(291);
    const a1 = items.find((x) => x.id === "A1")!;
    expect(a1.color).toBe("250,245,205");
    expect(a1.supplier).toBe(MARD_BRAND);
    expect(a1.currentStock).toBe(0);
    expect(a1.minStock).toBe(0);
  });

  it("does nothing when the warehouse already has items", () => {
    store.upsertItem("A10", { currentStock: 100, minStock: 50 });
    expect(seedMard291IfEmpty(store)).toBe(0);
    expect(store.listInventory()).toHaveLength(1);
  });

  it("seed data has unique color codes", () => {
    const codes = mard291Colors.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
