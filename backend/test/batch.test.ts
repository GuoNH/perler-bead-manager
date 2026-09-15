import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, WarehouseStore } from "../src/storage/warehouse-store.js";

describe("WarehouseStore.batchApply", () => {
  let db: ReturnType<typeof openDb>;
  let store: WarehouseStore;
  beforeEach(() => {
    db = openDb(":memory:");
    store = new WarehouseStore(db);
  });
  afterEach(() => db.close());

  it("adds to existing stock and creates missing codes", () => {
    store.upsertItem("A1", { currentStock: 100, minStock: 0 });
    const res = store.batchApply([
      { id: "A1", amount: 500 },
      { id: "A2", amount: 300 },
    ]);
    expect(res).toEqual({ updated: 2, errors: [] });
    const items = store.listInventory();
    expect(items.find((x) => x.id === "A1")!.currentStock).toBe(600);
    expect(items.find((x) => x.id === "A2")!.currentStock).toBe(300);
  });

  it("sets min stock while preserving current stock", () => {
    store.upsertItem("A1", { currentStock: 100, minStock: 0 });
    const res = store.batchApply([{ id: "A1", minStock: 200 }]);
    expect(res.updated).toBe(1);
    const a1 = store.listInventory().find((x) => x.id === "A1")!;
    expect(a1.minStock).toBe(200);
    expect(a1.currentStock).toBe(100);
  });

  it("collects errors for invalid lines but still applies valid ones", () => {
    const res = store.batchApply([
      { id: "A1", amount: 10 },
      { id: "", amount: 10 },
      { id: "A2", amount: -5 },
      { id: "A3", minStock: 1.5 },
    ]);
    expect(res.updated).toBe(1);
    expect(res.errors).toContain("空编号");
    expect(res.errors.some((e) => e.includes("A2"))).toBe(true);
    expect(res.errors.some((e) => e.includes("A3"))).toBe(true);
    expect(store.listInventory()).toHaveLength(1);
  });
});
