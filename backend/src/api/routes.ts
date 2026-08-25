import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import type { ResultStore, SubmitPayload } from "@pinpin/shared";
import { recognize } from "../recognizer/index.js";

const upload = multer({ storage: multer.memoryStorage() });

export function routes(store: ResultStore): Router {
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
      res.json(await store.get(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  return r;
}
