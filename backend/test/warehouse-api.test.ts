import request from "supertest";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/storage/db.js";
import { WarehouseStore } from "../src/storage/warehouse-store.js";
import { JsonResultStore } from "../src/storage/json-store.js";
import { createApp } from "../src/index.js";

describe("warehouse api", () => {
  it("upserts inventory and lists replenishment", async () => {
    const db = openDb(":memory:");
    const warehouse = new WarehouseStore(db);
    const app = createApp(new JsonResultStore("data-test"), warehouse);
    await request(app)
      .put("/api/inventory/A10")
      .send({ currentStock: 2, minStock: 10 })
      .expect(200);
    const list = await request(app).get("/api/inventory/replenish").expect(200);
    expect(list.body[0].id).toBe("A10");
    db.close();
  });
});
