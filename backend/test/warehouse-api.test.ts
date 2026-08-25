import request from "supertest";
import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("imports inventory from a reordered CSV header by column name", async () => {
    const db = openDb(":memory:");
    const warehouse = new WarehouseStore(db);
    const app = createApp(new JsonResultStore("data-test"), warehouse);
    const csv = [
      "编号,颜色,当前库存,最低库存",
      "B03,1,4,3",
    ].join("\n");
    const res = await request(app)
      .post("/api/inventory/import")
      .attach("file", Buffer.from(csv, "utf8"), "inventory.csv")
      .expect(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toBe(0);
    const rows = warehouse.listInventory();
    expect(rows[0].id).toBe("B03");
    expect(rows[0].currentStock).toBe(4);
    expect(rows[0].minStock).toBe(3);
    db.close();
  });

  it("removes the saved result and restores the index when consumption fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pinpin-wh-"));
    const store = new JsonResultStore(dir);
    const failing = { consumeSubmission: () => { throw new Error("consume boom"); } } as unknown as WarehouseStore;
    const app = createApp(store, failing);
    const submit = await request(app)
      .post("/api/submit")
      .send({
        image: { name: "t.png", width: 1, height: 1 },
        legend: [{ id: "A10", rgb: { r: 1, g: 2, b: 3 }, count: 5 }],
        confirmedAt: new Date().toISOString(),
      });
    expect(submit.status).toBe(500);
    expect(await store.list()).toEqual([]);
    const left = (await readdir(dir)).filter((f) => /^\d+\.json$/.test(f));
    expect(left).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });
});
