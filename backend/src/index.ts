import cors from "cors";
import express from "express";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ResultStore } from "@pinpin/shared";
import { routes } from "./api/routes.js";
import { openDb } from "./storage/db.js";
import { DrawingStore } from "./storage/drawing-store.js";
import { WarehouseStore } from "./storage/warehouse-store.js";
import { seedMard291IfEmpty } from "./storage/seed.js";

export function createApp(
  store: ResultStore,
  warehouse?: WarehouseStore,
  drawingStore?: DrawingStore,
  dataDir?: string,
) {
  const wh = warehouse ?? new WarehouseStore(openDb(":memory:"));
  const app = express();
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

function serveFrontendDist(app: express.Application) {
  // 尝试多个可能的前端 dist 路径
  const candidates = [
    join(process.cwd(), "frontend", "dist"),
    join(process.cwd(), "..", "frontend", "dist"),
    join(import.meta.dirname, "..", "..", "frontend", "dist"),
    join(import.meta.dirname, "..", "..", "..", "frontend", "dist"),
  ];
  for (const distPath of candidates) {
    if (existsSync(distPath)) {
      console.log(`serving frontend static files from ${distPath}`);
      app.use(express.static(distPath));
      // SPA 降级：非 API 路由返回 index.html（Express 5 兼容：使用中间件而非通配符路由）
      const indexPath = join(distPath, "index.html");
      if (existsSync(indexPath)) {
        app.use((req, res, next) => {
          if (req.path.startsWith("/api")) return next();
          res.sendFile(indexPath);
        });
      }
      return;
    }
  }
  console.warn("frontend dist not found — API only mode");
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  const { JsonResultStore } = await import("./storage/json-store.js");
  const dataDir = join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(dataDir, "drawings", "images"), { recursive: true });
  mkdirSync(join(dataDir, "temp"), { recursive: true });
  const warehouse = new WarehouseStore(openDb(join(dataDir, "warehouse.sqlite")));
  const seeded = seedMard291IfEmpty(warehouse);
  if (seeded > 0) console.log(`seeded ${seeded} Mard colors`);
  const drawingStore = new DrawingStore(openDb(join(dataDir, "warehouse.sqlite")));
  const app = createApp(new JsonResultStore(dataDir), warehouse, drawingStore, dataDir);
  serveFrontendDist(app);
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || "0.0.0.0";
  app.listen(port, host, () => console.log(`backend listening on ${host}:${port}`));
}
