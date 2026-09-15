import { Router } from "express";
import multer from "multer";
import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import type {
  DrawingInput,
  DrawingCategoryInput,
  ResultStore,
  SubmitPayload,
} from "@pinpin/shared";
import { recognize } from "../recognizer/index.js";
import type { DrawingStore } from "../storage/drawing-store.js";
import type { WarehouseStore } from "../storage/warehouse-store.js";

const upload = multer({ storage: multer.memoryStorage() });

export function routes(
  store: ResultStore,
  warehouse: WarehouseStore,
  drawingStore?: DrawingStore,
  dataDir?: string,
): Router {
  const r = Router();

  /* ── 识别 ── */

  r.post("/recognize", upload.single("image"), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "缺少图片文件" });
        return;
      }
      // 保存原图到临时目录
      const origExt = extname(req.file.originalname) || ".png";
      const tempName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${origExt}`;
      if (dataDir) {
        const tempDir = join(dataDir, "temp");
        if (!existsSync(tempDir)) await mkdir(tempDir, { recursive: true });
        await writeFile(join(tempDir, tempName), req.file.buffer);
      }
      const result = await recognize(req.file.originalname, req.file.buffer);
      if (dataDir) result.tempImageName = tempName;
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ── 提交（含归档图纸到图纸库） ── */

  r.post("/submit", async (req, res, next) => {
    try {
      const payload = req.body as SubmitPayload;
      const id = `${new Date().getTime()}`;
      const storeDir = (store as unknown as { dir: string }).dir;
      const indexPath = join(storeDir, "index.json");
      const priorIndex = await readFile(indexPath, "utf8").catch(() => "[]");
      const saved = await store.save({
        ...payload,
        id,
        createdAt: new Date().toISOString(),
      });
      try {
        warehouse.consumeSubmission(
          id,
          payload.image.name,
          payload.legend.map((item) => ({
            beadId: item.id,
            count: item.count,
          })),
        );
      } catch (err) {
        await writeFile(indexPath, priorIndex, "utf8");
        await Promise.all([
          unlink(saved.jsonPath).catch(() => {}),
          unlink(saved.csvPath).catch(() => {}),
        ]);
        throw err;
      }

      // 归档图纸到图纸库（仅当 shouldArchive 不为 false）
      if (drawingStore && dataDir && payload.tempImageName && payload.shouldArchive !== false) {
        const tempPath = join(dataDir, "temp", payload.tempImageName);
        const imagesDir = join(dataDir, "drawings", "images");
        if (!existsSync(imagesDir)) await mkdir(imagesDir, { recursive: true });
        const ext = extname(payload.tempImageName) || ".png";
        const destName = `${id}${ext}`;
        await copyFile(tempPath, join(imagesDir, destName));
        // 删除临时文件
        unlink(tempPath).catch(() => {});
        drawingStore.createDrawing(id, id, {
          imageName: payload.archiveName || payload.image.name,
          imageExt: ext,
          width: payload.image.width,
          height: payload.image.height,
          totalBeads: payload.legend.reduce((s, i) => s + i.count, 0),
          colorCount: payload.legend.length,
        });
      }

      const total = payload.legend.reduce((sum, item) => sum + item.count, 0);
      res.json({ ...saved, total });
    } catch (err) {
      next(err);
    }
  });

  /* ── 识别结果查询 ── */

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

  /* ── 库存管理 ── */

  r.get("/inventory", (req, res, next) => {
    try {
      const search = String(req.query.search ?? "");
      res.json(warehouse.listInventory(search));
    } catch (err) {
      next(err);
    }
  });

  r.post("/inventory/batch", (req, res, next) => {
    try {
      const items = req.body?.items;
      if (!Array.isArray(items)) {
        res.status(400).json({ error: "items 必须为数组" });
        return;
      }
      res.json(warehouse.batchApply(items));
    } catch (err) {
      next(err);
    }
  });

  r.put("/inventory/:id", (req, res, next) => {
    try {
      res.json(warehouse.upsertItem(req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  });

  r.delete("/inventory/:id", (req, res, next) => {
    try {
      warehouse.deleteItem(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  r.get("/inventory/replenish", (_req, res, next) => {
    try {
      res.json(warehouse.listReplenish());
    } catch (err) {
      next(err);
    }
  });

  r.post("/inventory/import", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "缺少 CSV 文件" });
        return;
      }
      const rows = req.file.buffer
        .toString("utf8")
        .split(/\r?\n/)
        .filter(Boolean);
      const [header, ...body] = rows;
      if (!header?.includes("编号")) {
        res.status(400).json({ error: "CSV 表头错误" });
        return;
      }
      const colsByName = header.split(",").map((c) => c.trim());
      const idx = (name: string) => colsByName.indexOf(name);
      const imported: string[] = [];
      const errors: string[] = [];
      for (const row of body) {
        const cols = row.split(",").map((c) => c.trim());
        const id = cols[idx("编号")]?.replace(/^"|"$/g, "") ?? "";
        if (!id) {
          errors.push("空编号");
          continue;
        }
        const currentStock = Number(cols[idx("当前库存")]);
        const minStock = Number(cols[idx("最低库存")]);
        if (!Number.isInteger(currentStock) || !Number.isInteger(minStock)) {
          errors.push(`编号 ${id} 库存字段非法`);
          continue;
        }
        warehouse.upsertItem(id, { currentStock, minStock });
        imported.push(id);
      }
      res.json({ imported: imported.length, skipped: errors.length, errors });
    } catch (err) {
      next(err);
    }
  });

  /* ── 提交记录 ── */

  r.get("/submissions", (_req, res, next) => {
    try {
      res.json(warehouse.listSubmissions());
    } catch (err) {
      next(err);
    }
  });

  r.post("/submissions/:id/revert", (req, res, next) => {
    try {
      warehouse.revertSubmission(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /* ══════════════════════════════════════════
     图纸库 API
     ══════════════════════════════════════════ */

  if (!drawingStore) return r;

  /* ── 分类 ── */

  r.get("/drawings/categories", (_req, res, next) => {
    try {
      res.json(drawingStore.listCategories());
    } catch (err) {
      next(err);
    }
  });

  r.post("/drawings/categories", (req, res, next) => {
    try {
      const input = req.body as DrawingCategoryInput;
      if (!input?.name?.trim()) {
        res.status(400).json({ error: "分类名称不能为空" });
        return;
      }
      res.json(drawingStore.createCategory(input));
    } catch (err) {
      next(err);
    }
  });

  r.put("/drawings/categories/:id", (req, res, next) => {
    try {
      const input = req.body as DrawingCategoryInput;
      if (!input?.name?.trim()) {
        res.status(400).json({ error: "分类名称不能为空" });
        return;
      }
      res.json(drawingStore.updateCategory(req.params.id, input));
    } catch (err) {
      next(err);
    }
  });

  r.delete("/drawings/categories/:id", (req, res, next) => {
    try {
      drawingStore.deleteCategory(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  /* ── 名称查重 ── */

  r.get("/drawings/check-name", (req, res, next) => {
    try {
      const name = String(req.query.name ?? "").trim();
      if (!name) {
        res.json({ exists: false, count: 0 });
        return;
      }
      const count = drawingStore.countByName(name);
      res.json({ exists: count > 0, count });
    } catch (err) {
      next(err);
    }
  });

  /* ── 图纸条目 ── */

  r.get("/drawings", (req, res, next) => {
    try {
      const categoryId = req.query.category as string | undefined;
      res.json(drawingStore.listDrawings(categoryId || undefined));
    } catch (err) {
      next(err);
    }
  });

  r.get("/drawings/:id", (req, res, next) => {
    try {
      const d = drawingStore.getDrawing(req.params.id);
      if (!d) {
        res.status(404).json({ error: "图纸不存在" });
        return;
      }
      res.json(d);
    } catch (err) {
      next(err);
    }
  });

  r.put("/drawings/:id", (req, res, next) => {
    try {
      const input = req.body as DrawingInput;
      res.json(drawingStore.updateDrawing(req.params.id, input));
    } catch (err) {
      next(err);
    }
  });

  r.delete("/drawings/:id", async (req, res, next) => {
    try {
      const d = drawingStore.getDrawing(req.params.id);
      if (!d) {
        res.status(404).json({ error: "图纸不存在" });
        return;
      }
      drawingStore.deleteDrawing(req.params.id);
      // 尝试删除图片文件
      if (dataDir) {
        unlink(join(dataDir, "drawings", "images", `${d.id}${d.imageExt}`)).catch(
          () => {},
        );
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return r;
}