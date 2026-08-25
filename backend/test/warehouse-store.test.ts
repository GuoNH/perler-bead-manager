import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WarehouseStore, openDb } from "../src/storage/warehouse-store.js";

describe("WarehouseStore", () => {
  let db: ReturnType<typeof openDb>;
  let store: WarehouseStore;
  beforeEach(() => {
    db = openDb(":memory:");
    store = new WarehouseStore(db);
  });
  afterEach(() => db.close());

  it("consumes a submission and reverts it", () => {
    store.upsertItem("A10", { currentStock: 100, minStock: 50 });
    store.consumeSubmission("s1", "t.png", [{ beadId: "A10", count: 30 }]);
    expect(store.listInventory()[0].currentStock).toBe(70);
    store.revertSubmission("s1");
    expect(store.listInventory()[0].currentStock).toBe(100);
  });

  it("rejects double revert", () => {
    store.consumeSubmission("s1", "t.png", [{ beadId: "A10", count: 5 }]);
    store.revertSubmission("s1");
    expect(() => store.revertSubmission("s1")).toThrow();
  });

  it("lists replenishment items only below threshold", () => {
    store.upsertItem("A", { currentStock: 3, minStock: 5 });
    store.upsertItem("B", { currentStock: 5, minStock: 5 });
    expect(store.listReplenish().map((x) => x.id)).toEqual(["A"]);
  });
});
