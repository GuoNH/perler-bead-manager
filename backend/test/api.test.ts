import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/index.js";
import { JsonResultStore } from "../src/storage/json-store.js";

vi.mock("../src/recognizer/index.js", () => ({
  recognize: async () => ({
    image: { name: "t.png", width: 1, height: 1 },
    legend: [{ id: "A10", rgb: { r: 1, g: 2, b: 3 }, count: 5 }],
    warnings: [],
  }),
}));

describe("api", () => {
  let dir: string;
  let app: ReturnType<typeof createApp>;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "pinpin-api-"));
    app = createApp(new JsonResultStore(dir));
  });
  afterAll(async () => rm(dir, { recursive: true, force: true }));

  it("submits and writes json/csv", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const submit = await request(app)
      .post("/api/submit")
      .send({
        image: { name: "t.png", width: 2, height: 2 },
        legend: [{ id: "A10", rgb: { r: 1, g: 2, b: 3 }, count: 5 }],
        confirmedAt: new Date().toISOString(),
      });
    expect(submit.status).toBe(200);
    expect(submit.body.total).toBe(5);
    const files = await import("node:fs").then((f) => f.readdirSync(dir));
    expect(files.some((f) => f.endsWith(".json"))).toBe(true);
  });
});
