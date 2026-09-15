import cors from "cors";
import express from "express";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ResultStore } from "@pinpin/shared";
import { routes } from "./api/routes.js";
import { openDb } from "./storage/db.js";
import { WarehouseStore } from "./storage/warehouse-store.js";

export function createApp(store: ResultStore, warehouse?: WarehouseStore) {
  const wh = warehouse ?? new WarehouseStore(openDb(":memory:"));
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", routes(store, wh));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  const { JsonResultStore } = await import("./storage/json-store.js");
  const dataDir = join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const warehouse = new WarehouseStore(openDb(join(dataDir, "warehouse.sqlite")));
  const app = createApp(new JsonResultStore(dataDir), warehouse);
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => console.log(`backend listening on ${port}`));
}
