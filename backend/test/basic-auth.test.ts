import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/index.js";
import { JsonResultStore } from "../src/storage/json-store.js";

describe("basic-auth", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "pinpin-auth-"));
  });
  afterAll(async () => rm(dir, { recursive: true, force: true }));

  it("未设置 AUTH_PASS 时放行", async () => {
    const app = createApp(new JsonResultStore(dir));
    const res = await request(app).get("/api/inventory");
    expect(res.status).toBe(200);
  });

  describe("设置 AUTH_PASS 后", () => {
    beforeAll(() => {
      vi.stubEnv("AUTH_USER", "admin");
      vi.stubEnv("AUTH_PASS", "secret123");
    });
    afterAll(() => vi.unstubAllEnvs());

    it("无凭据返回 401 并带 WWW-Authenticate", async () => {
      const app = createApp(new JsonResultStore(dir));
      const res = await request(app).get("/api/inventory");
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toContain("Basic");
    });

    it("错误密码返回 401", async () => {
      const app = createApp(new JsonResultStore(dir));
      const res = await request(app)
        .get("/api/inventory")
        .set("Authorization", `Basic ${Buffer.from("admin:wrong").toString("base64")}`);
      expect(res.status).toBe(401);
    });

    it("正确凭据返回 200", async () => {
      const app = createApp(new JsonResultStore(dir));
      const res = await request(app)
        .get("/api/inventory")
        .set("Authorization", `Basic ${Buffer.from("admin:secret123").toString("base64")}`);
      expect(res.status).toBe(200);
    });
  });
});
