import express from "express";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "./index.js";
import { openDb } from "./storage/db.js";
import { DrawingStore } from "./storage/drawing-store.js";
import { JsonResultStore } from "./storage/json-store.js";
import { seedMard291IfEmpty } from "./storage/seed.js";
import { WarehouseStore } from "./storage/warehouse-store.js";

function serveFrontendDist(app: express.Express) {
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
