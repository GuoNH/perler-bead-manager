import { Router } from "express";
import multer from "multer";
import type { ResultStore, SubmitPayload } from "@pinpin/shared";
import { recognize } from "../recognizer/index.js";
import type { WarehouseStore } from "../storage/warehouse-store.js";

const upload = multer({ storage: multer.memoryStorage() });

export function routes(store: ResultStore, warehouse: WarehouseStore): Router {
  const r = Router();

  r.post("/recognize", upload.single("image"), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "缺少图片文件" });
        return;
      }
      res.json(await recognize(req.file.originalname, req.file.buffer));
    } catch (err) {
      next(err);
    }
  });

  r.post("/submit", async (req, res, next) => {
    try {
      const payload = req.body as SubmitPayload;
      const id = `${new Date().getTime()}`;
      const saved = await store.save({
        ...payload,
        id,
        createdAt: new Date().toISOString(),
      });
      warehouse.consumeSubmission(id, payload.image.name, payload.legend.map((item) => ({
        beadId: item.id,
        count: item.count,
      })));
      const total = payload.legend.reduce((sum, item) => sum + item.count, 0);
      res.json({ ...saved, total });
    } catch (err) {
      next(err);
    }
  });

  r.get("/results", async (_req, res, next) => {
    try {
      res.json(await store.list());
    } catch (err) {
      next(err);
    }
  });

  r.get("/results/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      if (!/^[A-Za-z0-9_-]+$/.test(id)) {
        res.status(400).json({ error: "非法编号" });
        return;
      }
      res.json(await store.get(id));
    } catch (err) {
      next(err);
    }
  });

  r.get("/inventory", (req, res, next) => {
    try {
      const search = String(req.query.search ?? "");
      res.json(warehouse.listInventory(search));
    } catch (err) { next(err); }
  });

  r.put("/inventory/:id", (req, res, next) => {
    try {
      res.json(warehouse.upsertItem(req.params.id, req.body));
    } catch (err) { next(err); }
  });

  r.delete("/inventory/:id", (req, res, next) => {
    try {
      warehouse.deleteItem(req.params.id);
      res.status(204).end();
    } catch (err) { next(err); }
  });

  r.get("/inventory/replenish", (_req, res, next) => {
    try { res.json(warehouse.listReplenish()); } catch (err) { next(err); }
  });

  r.post("/inventory/import", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) { res.status(400).json({ error: "缺少 CSV 文件" }); return; }
      const rows = req.file.buffer.toString("utf8").split(/\r?\n/).filter(Boolean);
      const [header, ...body] = rows;
      if (!header?.includes("编号")) { res.status(400).json({ error: "CSV 表头错误" }); return; }
      const imported: string[] = [];
      const errors: string[] = [];
      for (const row of body) {
        const cols = row.split(",").map((c) => c.trim());
        if (!cols[0]) { errors.push("空编号"); continue; }
        const id = cols[0].replace(/^"|"$/g, "");
        const currentStock = Number(cols[2]);
        const minStock = Number(cols[3]);
        if (!Number.isInteger(currentStock) || !Number.isInteger(minStock)) {
          errors.push(`编号 ${id} 库存字段非法`); continue;
        }
        warehouse.upsertItem(id, { currentStock, minStock });
        imported.push(id);
      }
      res.json({ imported: imported.length, skipped: errors.length, errors });
    } catch (err) { next(err); }
  });

  r.get("/submissions", (_req, res, next) => {
    try { res.json(warehouse.listSubmissions()); } catch (err) { next(err); }
  });

  r.post("/submissions/:id/revert", (req, res, next) => {
    try {
      warehouse.revertSubmission(req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return r;
}
