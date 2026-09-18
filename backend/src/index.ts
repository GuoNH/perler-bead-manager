import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ResultStore } from "@pinpin/shared";
import { basicAuth } from "./api/basic-auth.js";
import { routes } from "./api/routes.js";
import { openDb } from "./storage/db.js";
import type { DrawingStore } from "./storage/drawing-store.js";
import { WarehouseStore } from "./storage/warehouse-store.js";

export function createApp(
  store: ResultStore,
  warehouse?: WarehouseStore,
  drawingStore?: DrawingStore,
  dataDir?: string,
) {
  const wh = warehouse ?? new WarehouseStore(openDb(":memory:"));
  const app = express();
  app.use(basicAuth());
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  // 图纸图片静态服务（需放在 /api 路由之前，避免被路由捕获）
  if (dataDir) {
    const imagesDir = join(dataDir, "drawings", "images");
    if (existsSync(imagesDir)) {
      app.use("/api/drawings/images", express.static(imagesDir));
    }
  }
  app.use("/api", routes(store, wh, drawingStore, dataDir));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}
