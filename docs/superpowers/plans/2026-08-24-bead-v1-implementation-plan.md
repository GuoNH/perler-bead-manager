# 拼豆图纸识别与仓库管理 v1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建本地 Web 应用：上传拼豆图纸，从图例识别「编号 + 数量 + 色块颜色」，人工确认后提交；同时维护拼豆库存台账、消耗流水、撤销回补与待补充视图。

**Architecture:** npm workspaces 单仓库，`shared` 提供前后端共享类型；`backend` 为 Express + TypeScript API 服务，识别结果落 JSON/CSV，仓库台账与消耗流水落 SQLite；`frontend` 为 Vue 3 + Vite + Pinia 单页应用。

**Tech Stack:** Node.js 24（内置 `node:sqlite`）、TypeScript、Vue 3、Vite、Pinia、Vue Router、Express、Multer、sharp、Tesseract（`child_process` 调用本机 `tesseract.exe`）、Vitest、Supertest、Playwright。

## Global Constraints

- Node 版本：v24.19.0（`node:sqlite` 可用）。若执行环境 `node` 不在 PATH，使用 `C:\Users\guonaihao\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`。
- 编号是字符串，原样保留大小写与前导零（如 `A10`、`B03`）。
- 数量直接读图例，不做图案网格逐格计数。
- 识别结果以 JSON/CSV 导出；仓库库存与消耗流水以 SQLite 为唯一事实源。
- 后端服务端口：`3001`。前端开发端口：`5173`，通过 Vite proxy 转发 `/api`。
- 数据目录：`E:\work\pinpin\data`（`<id>.json`、`<id>.csv`、`warehouse.sqlite`）。
- 代码文件默认 ASCII；中文仅用于前端 UI 文案与 spec/plan 文档。
- Tesseract 可执行文件：`C:\Program Files\Tesseract-OCR\tesseract.exe`；通过环境变量 `TESSERACT_EXE` 可覆盖。

---

## Plan Structure

本计划按两个子系统组织，但共享同一脚手架和后端进程。Phase A 产出可独立运行的「上传识别 + 确认 + 提交 JSON/CSV」；Phase B 在 Phase A 之上扩展仓库台账、消耗流水、撤销与待补充，并把 `POST /api/submit` 扩展为同时写 SQLite。

- Phase A：脚手架、识别流水线、提交、识别前端。
- Phase B：SQLite 仓库层、仓库 API、提交集成、仓库前端。

---

## Phase A：识别与提交

### Task 0: 初始化 npm workspaces 与共享类型

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/index.ts`
- Create: `shared/src/types.ts`
- Create: `shared/src/warehouse.ts`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`

**Interfaces:**
- Produces: 包名 `@pinpin/shared`，导出 `RGB`、`LegendItem`、`Warning`、`RecognizeResult`、`SubmitPayload`、`RecognitionRecord`、`RecognitionSummary`、`ResultStore`，以及 Phase B 使用的 `InventoryItem`、`InventoryItemInput`、`InventorySummary`、`Submission`。

- [ ] **Step 1: 写根 package.json 与 TS base config**

```json
{
  "name": "pinpin",
  "private": true,
  "workspaces": ["shared", "backend", "frontend"],
  "scripts": {
    "dev": "concurrently -n api,web -c blue,green \"npm run dev -w backend\" \"npm run dev -w frontend\"",
    "build": "npm run build -w shared && npm run build -w backend && npm run build -w frontend",
    "test": "npm run test -w backend && npm run test -w frontend"
  },
  "devDependencies": {
    "concurrently": "^9.1.2",
    "typescript": "^5.8.3"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 2: 写 shared 包**

`shared/package.json`：

```json
{
  "name": "@pinpin/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

`shared/src/types.ts`：

```ts
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface LegendItem {
  id: string;
  rgb: RGB;
  count: number;
}

export interface Warning {
  level: "info" | "warn" | "error";
  message: string;
}

export interface ImageMeta {
  name: string;
  width: number;
  height: number;
}

export interface RecognizeResult {
  image: ImageMeta;
  legend: LegendItem[];
  warnings: Warning[];
}

export interface SubmitPayload {
  image: ImageMeta;
  legend: LegendItem[];
  confirmedAt: string;
}

export interface RecognitionRecord extends SubmitPayload {
  id: string;
  createdAt: string;
}

export interface RecognitionSummary {
  id: string;
  imageName: string;
  createdAt: string;
  total: number;
  colorCount: number;
}

export interface ResultStore {
  save(record: RecognitionRecord): Promise<{
    id: string;
    jsonPath: string;
    csvPath: string;
  }>;
  list(): Promise<RecognitionSummary[]>;
  get(id: string): Promise<RecognitionRecord>;
}
```

`shared/src/warehouse.ts`：

```ts
export interface InventoryItem {
  id: string;
  color: string;
  currentStock: number;
  minStock: number;
  unit: string;
  note: string;
  location: string;
  supplier: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemInput {
  color?: string;
  currentStock: number;
  minStock: number;
  unit?: string;
  note?: string;
  location?: string;
  supplier?: string;
}

export interface InventorySummary extends InventoryItem {
  deficit: number;
  cumulativeConsumed: number;
}

export interface Submission {
  id: string;
  imageName: string;
  createdAt: string;
  revertedAt: string | null;
  lines: Array<{ beadId: string; count: number }>;
}
```

`shared/src/index.ts`：

```ts
export * from "./types.js";
export * from "./warehouse.js";
```

- [ ] **Step 3: 写 backend/frontend 包与 tsconfig**

`backend/package.json`：

```json
{
  "name": "@pinpin/backend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@pinpin/shared": "0.1.0",
    "cors": "^2.8.5",
    "express": "^5.1.0",
    "multer": "^2.0.1",
    "sharp": "^0.34.1"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.3",
    "@types/multer": "^2.0.0",
    "@types/node": "^24.0.0",
    "@types/supertest": "^6.0.3",
    "supertest": "^7.1.1",
    "tsx": "^4.20.3",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`frontend/package.json`：

```json
{
  "name": "@pinpin/frontend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "test": "playwright test"
  },
  "dependencies": {
    "@pinpin/shared": "0.1.0",
    "pinia": "^3.0.3",
    "vue": "^3.5.17",
    "vue-router": "^4.5.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.0",
    "@vitejs/plugin-vue": "^6.0.0",
    "typescript": "^5.8.3",
    "vite": "^7.0.0",
    "vitest": "^3.2.4",
    "vue-tsc": "^3.0.0"
  }
}
```

`shared/tsconfig.json`：

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

`backend/tsconfig.json`：

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

`frontend/tsconfig.json`：

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 安装依赖并验证共享类型编译**

Run: `npm install`

Run: `npm run build -w shared`
Expected: exit code 0，生成 `shared/dist/index.js` 与 `.d.ts`。

- [ ] **Step 5: 提交**

```bash
git init
git add package.json package-lock.json tsconfig.base.json shared backend/package.json frontend/package.json
git commit -m "chore: scaffold npm workspaces and shared types"
```

---

### Task 1: 图像解码模块

**Files:**
- Create: `backend/src/recognizer/decode.ts`
- Test: `backend/test/decode.test.ts`

**Interfaces:**
- Consumes: `sharp`
- Produces: `decodeRgb(input: Buffer): Promise<DecodedImage>`；`DecodedImage = { width: number; height: number; rgb: Uint8Array }`（长度为 `width * height * 3`）。

- [ ] **Step 1: 写失败测试**

`backend/test/decode.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { decodeRgb } from "../src/recognizer/decode.js";

describe("decodeRgb", () => {
  it("decodes a 2x2 image into a 12-byte RGB buffer", async () => {
    const buf = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    }).png().toBuffer();
    const img = await decodeRgb(buf);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.rgb).toHaveLength(12);
    expect([img.rgb[0], img.rgb[1], img.rgb[2]]).toEqual([255, 0, 0]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w backend -- decode.test.ts`
Expected: FAIL，`decodeRgb` 未定义。

- [ ] **Step 3: 实现**

`backend/src/recognizer/decode.ts`：

```ts
import sharp from "sharp";

export interface DecodedImage {
  width: number;
  height: number;
  rgb: Uint8Array;
}

export async function decodeRgb(input: Buffer): Promise<DecodedImage> {
  const { data, info } = await sharp(input)
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    rgb: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w backend -- decode.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/recognizer/decode.ts backend/test/decode.test.ts
git commit -m "feat: decode uploaded images to raw RGB"
```

---

### Task 2: 色块取色模块

**Files:**
- Create: `backend/src/recognizer/color.ts`
- Test: `backend/test/color.test.ts`

**Interfaces:**
- Produces: `medianRgb(rgb: Uint8Array, width: number, box: Box): RGB`；`Box = { x0: number; y0: number; x1: number; y1: number }`（含 `x0`、`y0`，不含 `x1`、`y1`）。

- [ ] **Step 1: 写失败测试**

`backend/test/color.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { medianRgb } from "../src/recognizer/color.js";

describe("medianRgb", () => {
  it("returns the median channel values inside the box", () => {
    const width = 3;
    const height = 2;
    const rgb = new Uint8Array(width * height * 3);
    const px = (x: number, y: number, r: number, g: number, b: number) => {
      const i = (y * width + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    };
    px(0, 0, 10, 20, 30);
    px(1, 0, 50, 60, 70);
    px(2, 0, 90, 100, 110);
    px(0, 1, 200, 210, 220);
    px(1, 1, 30, 40, 50);
    px(2, 1, 250, 255, 255);
    expect(medianRgb(rgb, width, { x0: 0, y0: 0, x1: 2, y1: 2 }))
      .toEqual({ r: 40, g: 50, b: 60 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w backend -- color.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`backend/src/recognizer/color.ts`：

```ts
import type { RGB } from "@pinpin/shared";

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function medianRgb(rgb: Uint8Array, width: number, box: Box): RGB {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * width + x) * 3;
      rs.push(rgb[i]);
      gs.push(rgb[i + 1]);
      bs.push(rgb[i + 2]);
    }
  }
  return { r: median(rs), g: median(gs), b: median(bs) };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w backend -- color.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/recognizer/color.ts backend/test/color.test.ts
git commit -m "feat: add swatch median color sampling"
```

---

### Task 3: 图例 swatch 检测

**Files:**
- Create: `backend/src/recognizer/legend.ts`
- Test: `backend/test/legend.test.ts`

**Interfaces:**
- Consumes: `DecodedImage`
- Produces: `detectSwatches(img: DecodedImage): Swatch[]`；`Swatch = Box & { row: number }`。检测策略：2x 下采样计算饱和度掩码，连通域找候选，按面积/长宽比/颜色一致性过滤，按 y 聚类成行、按 x 排序。

- [ ] **Step 1: 写失败测试（合成两行 swatch）**

`backend/test/legend.test.ts`：

```ts
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeRgb } from "../src/recognizer/decode.js";
import { detectSwatches } from "../src/recognizer/legend.js";

describe("detectSwatches", () => {
  it("finds two saturated swatches in a row", async () => {
    const w = 220;
    const h = 80;
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="white"/>
        <rect x="20" y="20" width="40" height="40" fill="rgb(255,0,0)"/>
        <rect x="120" y="20" width="40" height="40" fill="rgb(0,128,255)"/>
      </svg>`,
    );
    const png = await sharp(svg).png().toBuffer();
    const img = await decodeRgb(png);
    const swatches = detectSwatches(img);
    expect(swatches.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w backend -- legend.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`backend/src/recognizer/legend.ts`：

```ts
import type { Box } from "./color.js";
import type { DecodedImage } from "./decode.js";

export interface Swatch extends Box {
  row: number;
}

interface Component {
  id: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

export function detectSwatches(img: DecodedImage): Swatch[] {
  const stride = 2;
  const mw = Math.ceil(img.width / stride);
  const mh = Math.ceil(img.height / stride);
  const mask = new Uint8Array(mw * mh);

  for (let my = 0; my < mh; my++) {
    for (let mx = 0; mx < mw; mx++) {
      const x = Math.min(mx * stride, img.width - 1);
      const y = Math.min(my * stride, img.height - 1);
      const i = (y * img.width + x) * 3;
      const r = img.rgb[i];
      const g = img.rgb[i + 1];
      const b = img.rgb[i + 2];
      const mxv = Math.max(r, g, b);
      const mnv = Math.min(r, g, b);
      const sat = mxv === 0 ? 0 : (mxv - mnv) / mxv;
      const bright = mxv >= 70;
      mask[my * mw + mx] = sat > 0.45 && bright ? 1 : 0;
    }
  }

  const components = findComponents(mask, mw, mh);
  const candidates = components
    .map((c) => ({
      ...c,
      w: c.maxX - c.minX + 1,
      h: c.maxY - c.minY + 1,
      ratio: (c.maxX - c.minX + 1) / (c.maxY - c.minY + 1),
    }))
    .filter(
      (c) =>
        c.area >= 24 &&
        c.w >= 8 &&
        c.h >= 8 &&
        c.ratio >= 0.7 &&
        c.ratio <= 1.6,
    );

  const sorted = [...candidates].sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  const rows: typeof candidates[] = [];
  for (const c of sorted) {
    const row = rows.find(
      (r) => Math.abs(r[0].minY - c.minY) <= Math.max(8, r[0].h * 0.7),
    );
    if (row) row.push(c);
    else rows.push([c]);
  }
  rows.sort((a, b) => a[0].minY - b[0].minY);

  return rows.flatMap((row, rowIndex) =>
    row
      .sort((a, b) => a.minX - b.minX)
      .map((c) => ({
        row: rowIndex,
        x0: c.minX * stride,
        y0: c.minY * stride,
        x1: Math.min((c.maxX + 1) * stride, img.width),
        y1: Math.min((c.maxY + 1) * stride, img.height),
      })),
  );
}

function findComponents(mask: Uint8Array, w: number, h: number): Component[] {
  const label = new Int32Array(w * h).fill(0);
  const components: Component[] = [];
  let next = 1;
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || label[start] !== 0) continue;
    const id = next++;
    const comp: Component = {
      id,
      minX: w,
      minY: h,
      maxX: 0,
      maxY: 0,
      area: 0,
    };
    label[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % w;
      const y = Math.floor(p / w);
      comp.minX = Math.min(comp.minX, x);
      comp.minY = Math.min(comp.minY, y);
      comp.maxX = Math.max(comp.maxX, x);
      comp.maxY = Math.max(comp.maxY, y);
      comp.area++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (mask[ni] === 1 && label[ni] === 0) {
          label[ni] = id;
          stack.push(ni);
        }
      }
    }
    components.push(comp);
  }
  return components;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w backend -- legend.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/recognizer/legend.ts backend/test/legend.test.ts
git commit -m "feat: detect legend swatches via saturation components"
```

---

### Task 4: OCR 封装

**Files:**
- Create: `backend/src/recognizer/ocr.ts`
- Test: `backend/test/ocr.test.ts`

**Interfaces:**
- Produces: `runTesseract(imagePath: string, opts: { whitelist?: string; psm?: number }): Promise<string>`；`ocrCrop(img: DecodedImage, box: Box, opts): Promise<string>`。

- [ ] **Step 1: 写失败测试（mock execFile）**

`backend/test/ocr.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { runTesseract } from "../src/recognizer/ocr.js";

vi.mock("node:child_process", () => ({
  execFile: (_cmd: string, _args: string[], _opts: unknown, cb: (e: unknown, stdout: string) => void) =>
    cb(null, "A10\n"),
}));

describe("runTesseract", () => {
  it("returns trimmed OCR text", async () => {
    await expect(runTesseract("fake.png", { psm: 7 })).resolves.toBe("A10");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w backend -- ocr.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`backend/src/recognizer/ocr.ts`：

```ts
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { Box } from "./color.js";
import type { DecodedImage } from "./decode.js";

const TESSERACT_EXE =
  process.env.TESSERACT_EXE ?? "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";

export interface TesseractOptions {
  whitelist?: string;
  psm?: number;
}

export function runTesseract(
  imagePath: string,
  opts: TesseractOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [imagePath, "stdout"];
    if (opts.whitelist) args.push("-c", `tessedit_char_whitelist=${opts.whitelist}`);
    if (opts.psm) args.push("--psm", String(opts.psm));
    execFile(TESSERACT_EXE, args, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.replace(/\s+/g, "").trim());
    });
  });
}

export async function ocrCrop(
  img: DecodedImage,
  box: Box,
  opts: TesseractOptions = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pinpin-ocr-"));
  const file = join(dir, "crop.png");
  try {
    const crop = await sharp(Buffer.from(img.rgb), {
      raw: { width: img.width, height: img.height, channels: 3 },
    })
      .extract({
        left: box.x0,
        top: box.y0,
        width: Math.max(1, box.x1 - box.x0),
        height: Math.max(1, box.y1 - box.y0),
      })
      .png()
      .toBuffer();
    await writeFile(file, crop);
    return await runTesseract(file, opts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w backend -- ocr.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/recognizer/ocr.ts backend/test/ocr.test.ts
git commit -m "feat: wrap tesseract as a child process"
```

---

### Task 5: 识别流水线组装

**Files:**
- Create: `backend/src/recognizer/index.ts`
- Test: `backend/test/recognizer.test.ts`

**Interfaces:**
- Produces: `recognize(imageName: string, input: Buffer): Promise<RecognizeResult>`。对每个 swatch：先取其左上方文字区（swatch 左侧，宽度不超过 swatch 到同行前一个 swatch 右边界），上半 OCR 编号、下半 OCR 数量；取色用 `medianRgb` 并内缩 3px 避开边框。识别失败写 `warnings`。

- [ ] **Step 1: 写失败测试（合成图，mock OCR）**

`backend/test/recognizer.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { recognize } from "../src/recognizer/index.js";

vi.mock("../src/recognizer/ocr.js", () => ({
  runTesseract: () => Promise.resolve(""),
  ocrCrop: async (_img: unknown, box: { y0: number }) =>
    box.y0 < 30 ? Promise.resolve("A10") : Promise.resolve("202"),
}));

describe("recognize", () => {
  it("assembles legend items from swatches", async () => {
    const w = 220;
    const h = 90;
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="white"/>
        <rect x="20" y="25" width="40" height="40" fill="rgb(255,0,0)"/>
        <rect x="140" y="25" width="40" height="40" fill="rgb(0,128,255)"/>
      </svg>`,
    );
    const png = await import("sharp").then((s) => s.default(svg).png().toBuffer());
    const result = await recognize("test.png", png);
    expect(result.legend.length).toBeGreaterThanOrEqual(2);
    expect(result.legend[0].id).toBe("A10");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w backend -- recognizer.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`backend/src/recognizer/index.ts`：

```ts
import type {
  LegendItem,
  RecognizeResult,
  Warning,
} from "@pinpin/shared";
import { medianRgb } from "./color.js";
import { decodeRgb } from "./decode.js";
import { detectSwatches } from "./legend.js";
import { ocrCrop } from "./ocr.js";

function sampleColor(img: { rgb: Uint8Array; width: number }, box: {
  x0: number; y0: number; x1: number; y1: number;
}): LegendItem["rgb"] {
  const inset = 3;
  return medianRgb(img.rgb, img.width, {
    x0: box.x0 + inset,
    y0: box.y0 + inset,
    x1: box.x1 - inset,
    y1: box.y1 - inset,
  });
}

export async function recognize(
  imageName: string,
  input: Buffer,
): Promise<RecognizeResult> {
  const img = decodeRgb(input);
  const swatches = detectSwatches(img);
  const warnings: Warning[] = [];
  const legend: LegendItem[] = [];

  for (let i = 0; i < swatches.length; i++) {
    const s = swatches[i];
    const prev = i > 0 && swatches[i - 1].row === s.row ? swatches[i - 1] : null;
    const left = prev ? prev.x1 : 0;
    const width = s.x0 - left;
    if (width <= 0) continue;
    const midY = Math.round((s.y0 + s.y1) / 2);
    const textBox = { x0: left, y0: s.y0, x1: s.x0, y1: s.y1 };
    const idBox = { x0: left, y0: s.y0, x1: s.x0, y1: midY };
    const countBox = { x0: left, y0: midY, x1: s.x0, y1: s.y1 };
    const id = await ocrCrop(img, idBox, { whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", psm: 7 });
    const countText = await ocrCrop(img, countBox, { whitelist: "0123456789", psm: 7 });
    const count = Number(countText);
    if (!id) {
      warnings.push({ level: "error", message: `条目 ${i + 1} 未识别到编号` });
      continue;
    }
    if (!Number.isInteger(count) || count < 0) {
      warnings.push({ level: "warn", message: `编号 ${id} 的数量无法识别：${countText || "空"}` });
    }
    legend.push({
      id,
      count: Number.isInteger(count) && count >= 0 ? count : 0,
      rgb: sampleColor(img, s),
    });
  }

  if (legend.length === 0) {
    warnings.push({ level: "error", message: "未检测到图例条目" });
  }

  return {
    image: { name: imageName, width: img.width, height: img.height },
    legend,
    warnings,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w backend -- recognizer.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/recognizer/index.ts backend/test/recognizer.test.ts
git commit -m "feat: assemble OCR and color sampling into recognizer"
```

---

### Task 6: JSON/CSV 存储与识别 API

**Files:**
- Create: `backend/src/storage/json-store.ts`
- Create: `backend/src/api/routes.ts`
- Create: `backend/src/index.ts`
- Test: `backend/test/api.test.ts`

**Interfaces:**
- Consumes: `ResultStore`、`recognize`、`Express`
- Produces: `JsonResultStore`、`createApp(store: ResultStore)`。
- API：`POST /api/recognize`（multipart `image`）、`POST /api/submit`（`SubmitPayload`）、`GET /api/results`、`GET /api/results/:id`。

- [ ] **Step 1: 写失败测试**

`backend/test/api.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w backend -- api.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 JSON 存储**

`backend/src/storage/json-store.ts`：

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  RecognitionRecord,
  RecognitionSummary,
  ResultStore,
} from "@pinpin/shared";

export class JsonResultStore implements ResultStore {
  constructor(private readonly dir: string) {}

  private id(now: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  }

  private toCsv(record: RecognitionRecord): string {
    const rows = record.legend.map((item) => {
      const color = `${item.rgb.r},${item.rgb.g},${item.rgb.b}`;
      return `"${item.id}","${color}",${item.count}`;
    });
    return ["编号,颜色,数量", ...rows].join("\n");
  }

  async save(record: RecognitionRecord) {
    await mkdir(this.dir, { recursive: true });
    const id = record.id || this.id();
    const full: RecognitionRecord = {
      ...record,
      id,
      createdAt: record.createdAt || new Date().toISOString(),
    };
    const jsonPath = join(this.dir, `${id}.json`);
    const csvPath = join(this.dir, `${id}.csv`);
    await writeFile(jsonPath, JSON.stringify(full, null, 2), "utf8");
    await writeFile(csvPath, this.toCsv(full), "utf8");
    const index = await this.list().catch(() => []);
    index.push({
      id,
      imageName: full.image.name,
      createdAt: full.createdAt,
      total: full.legend.reduce((sum, item) => sum + item.count, 0),
      colorCount: full.legend.length,
    });
    await writeFile(join(this.dir, "index.json"), JSON.stringify(index, null, 2), "utf8");
    return { id, jsonPath, csvPath };
  }

  async list(): Promise<RecognitionSummary[]> {
    try {
      return JSON.parse(await readFile(join(this.dir, "index.json"), "utf8"));
    } catch {
      return [];
    }
  }

  async get(id: string): Promise<RecognitionRecord> {
    return JSON.parse(await readFile(join(this.dir, `${id}.json`), "utf8"));
  }
}
```

- [ ] **Step 4: 实现路由与入口**

`backend/src/api/routes.ts`：

```ts
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
      res.json({ id, total, ...saved });
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
```

`backend/src/index.ts`：

```ts
import cors from "cors";
import express from "express";
import { join } from "node:path";
import type { ResultStore } from "@pinpin/shared";
import { routes } from "./api/routes.js";

export function createApp(store: ResultStore) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", routes(store));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  const { JsonResultStore } = await import("./storage/json-store.js");
  const app = createApp(new JsonResultStore(join(process.cwd(), "data")));
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => console.log(`backend listening on ${port}`));
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test -w backend -- api.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/src/storage/json-store.ts backend/src/api/routes.ts backend/src/index.ts backend/test/api.test.ts
git commit -m "feat: add recognize/submit API with JSON and CSV export"
```

---

### Task 7: 识别前端

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/App.vue`
- Create: `frontend/src/router.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/stores/recognition.ts`
- Create: `frontend/src/views/UploadView.vue`
- Create: `frontend/src/components/LegendPanel.vue`
- Create: `frontend/src/components/SummaryBar.vue`
- Test: `frontend/test/upload.spec.ts`（Playwright smoke）

**Interfaces:**
- Consumes: `@pinpin/shared` 类型
- Produces: 上传、预览、识别、图例确认、提交链路。

- [ ] **Step 1: 写 Vite 与入口**

`frontend/vite.config.ts`：

```ts
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
  },
});
```

`frontend/playwright.config.ts`：

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  use: { baseURL: "http://localhost:5173" },
});
```

`frontend/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>拼豆统计</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`frontend/src/main.ts`：

```ts
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";

createApp(App).use(createPinia()).use(router).mount("#app");
```

- [ ] **Step 2: 写 API client 与 store**

`frontend/src/api/client.ts`：

```ts
import type { RecognizeResult, SubmitPayload } from "@pinpin/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "请求失败");
  return res.json() as Promise<T>;
}

export async function recognizeImage(file: File): Promise<RecognizeResult> {
  const form = new FormData();
  form.append("image", file);
  return json(await fetch("/api/recognize", { method: "POST", body: form }));
}

export async function submitRecognition(payload: SubmitPayload): Promise<{ id: string; total: number; jsonPath: string; csvPath: string }> {
  return json(await fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}
```

`frontend/src/stores/recognition.ts`：

```ts
import { defineStore } from "pinia";
import type { LegendItem, RecognizeResult } from "@pinpin/shared";
import { recognizeImage, submitRecognition } from "../api/client.js";

export const useRecognitionStore = defineStore("recognition", {
  state: () => ({
    file: null as File | null,
    previewUrl: "",
    result: null as RecognizeResult | null,
    loading: false,
    error: "",
    submitted: null as { id: string; total: number } | null,
  }),
  actions: {
    async recognize(file: File) {
      this.loading = true;
      this.error = "";
      this.file = file;
      this.previewUrl = URL.createObjectURL(file);
      try {
        this.result = await recognizeImage(file);
      } catch (err) {
        this.error = err instanceof Error ? err.message : "识别失败";
      } finally {
        this.loading = false;
      }
    },
    updateLegend(legend: LegendItem[]) {
      if (this.result) this.result.legend = legend;
    },
    async submit() {
      if (!this.result) return;
      const payload = {
        image: this.result.image,
        legend: this.result.legend,
        confirmedAt: new Date().toISOString(),
      };
      this.submitted = await submitRecognition(payload);
    },
  },
});
```

- [ ] **Step 3: 写主界面与图例面板**

`frontend/src/views/UploadView.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import LegendPanel from "../components/LegendPanel.vue";
import SummaryBar from "../components/SummaryBar.vue";
import { useRecognitionStore } from "../stores/recognition.js";

const store = useRecognitionStore();
const input = ref<HTMLInputElement | null>(null);
const hasError = computed(() =>
  store.result?.warnings.some((w) => w.level === "error") ?? false,
);

function onFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (file) void store.recognize(file);
}
</script>

<template>
  <main class="upload">
    <section class="drop" @click="input?.click()" @dragover.prevent @drop.prevent="onFile">
      <input ref="input" type="file" accept="image/*" hidden @change="onFile" />
      <img v-if="store.previewUrl" :src="store.previewUrl" alt="图纸预览" />
      <p v-else>点击或拖拽上传拼豆图纸</p>
    </section>
    <p v-if="store.error" class="error">{{ store.error }}</p>
    <p v-if="store.loading">识别中...</p>
    <LegendPanel v-if="store.result" />
    <SummaryBar v-if="store.result" />
    <button v-if="store.result" :disabled="hasError || !store.result.legend.length" @click="store.submit()">
      提交
    </button>
  </main>
</template>
```

`frontend/src/components/LegendPanel.vue`：

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { LegendItem } from "@pinpin/shared";
import { useRecognitionStore } from "../stores/recognition.js";

const store = useRecognitionStore();
const legend = computed(() => store.result?.legend ?? []);

function toHex(item: LegendItem) {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(item.rgb.r)}${h(item.rgb.g)}${h(item.rgb.b)}`;
}
function fromHex(item: LegendItem, hex: string) {
  item.rgb.r = parseInt(hex.slice(1, 3), 16);
  item.rgb.g = parseInt(hex.slice(3, 5), 16);
  item.rgb.b = parseInt(hex.slice(5, 7), 16);
}
function onColor(item: LegendItem, ev: Event) {
  fromHex(item, (ev.target as HTMLInputElement).value);
}
function remove(index: number) {
  store.updateLegend(legend.value.filter((_, i) => i !== index));
}
function add() {
  store.updateLegend([...legend.value, { id: "", rgb: { r: 0, g: 0, b: 0 }, count: 0 }]);
}
</script>

<template>
  <section class="legend">
    <div class="row header"><span>颜色</span><span>编号</span><span>数量</span><span></span></div>
    <div v-for="(item, i) in legend" :key="i" class="row">
      <input type="color" :value="toHex(item)" @input="onColor(item, $event)" />
      <input v-model="item.id" />
      <input v-model.number="item.count" type="number" min="0" />
      <button @click="remove(i)">删除</button>
    </div>
    <button @click="add">新增</button>
  </section>
</template>
```

`frontend/src/components/SummaryBar.vue`：

```vue
<script setup lang="ts">
import { computed } from "vue";
import { useRecognitionStore } from "../stores/recognition.js";
const store = useRecognitionStore();
const total = computed(() =>
  store.result?.legend.reduce((sum, item) => sum + item.count, 0) ?? 0,
);
</script>

<template>
  <p class="summary">总数：{{ total }}，色种数：{{ store.result?.legend.length ?? 0 }}</p>
</template>
```

- [ ] **Step 4: 路由与 App**

`frontend/src/router.ts`：

```ts
import { createRouter, createWebHistory } from "vue-router";
import UploadView from "./views/UploadView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/", component: UploadView }],
});
```

`frontend/src/App.vue`：

```vue
<template>
  <router-view />
</template>
```

- [ ] **Step 5: 启动并做 Playwright smoke**

Run: `npm run dev -w backend`
Run: `npm run dev -w frontend`

Run: `npx playwright install chromium`

`frontend/test/upload.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

test("upload view renders", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await expect(page.getByText(/点击或拖拽上传拼豆图纸/)).toBeVisible();
});
```

Run: `npx playwright test frontend/test/upload.spec.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add frontend
git commit -m "feat: add upload recognition confirmation UI"
```

---

## Phase B：仓库管理

### Task 8: SQLite 仓库层

**Files:**
- Create: `backend/src/storage/db.ts`
- Create: `backend/src/storage/warehouse-store.ts`
- Test: `backend/test/warehouse-store.test.ts`

**Interfaces:**
- Consumes: `node:sqlite`
- Produces: `openDb(path): DatabaseSync`、`WarehouseStore`（`upsertItem`、`listInventory`、`listReplenish`、`deleteItem`、`consumeSubmission`、`revertSubmission`、`listSubmissions`）。

- [ ] **Step 1: 写失败测试**

`backend/test/warehouse-store.test.ts`：

```ts
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WarehouseStore, openDb } from "../src/storage/warehouse-store.js";

describe("WarehouseStore", () => {
  let db: ReturnType<typeof openDb>;
  let store: WarehouseStore;
  beforeEach(() => {
    db = openDb(":memory:");
    store = new WarehouseStore(db);
  });
  afterEach(() => db.close());

  it("consumes a submission and reverts it", () => {
    store.upsertItem("A10", { currentStock: 100, minStock: 50 });
    store.consumeSubmission("s1", "t.png", [{ beadId: "A10", count: 30 }]);
    expect(store.listInventory()[0].currentStock).toBe(70);
    store.revertSubmission("s1");
    expect(store.listInventory()[0].currentStock).toBe(100);
  });

  it("rejects double revert", () => {
    store.consumeSubmission("s1", "t.png", [{ beadId: "A10", count: 5 }]);
    store.revertSubmission("s1");
    expect(() => store.revertSubmission("s1")).toThrow();
  });

  it("lists replenishment items only below threshold", () => {
    store.upsertItem("A", { currentStock: 3, minStock: 5 });
    store.upsertItem("B", { currentStock: 5, minStock: 5 });
    expect(store.listReplenish().map((x) => x.id)).toEqual(["A"]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w backend -- warehouse-store.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`backend/src/storage/db.ts`：

```ts
import { DatabaseSync } from "node:sqlite";

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      color TEXT NOT NULL DEFAULT '',
      current_stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '颗',
      note TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      supplier TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      image_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reverted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS consumption_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      bead_id TEXT NOT NULL REFERENCES inventory_items(id),
      count INTEGER NOT NULL CHECK (count >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_consumption_bead ON consumption_lines(bead_id);
    CREATE INDEX IF NOT EXISTS idx_consumption_submission ON consumption_lines(submission_id);
  `);
  return db;
}
```

`backend/src/storage/warehouse-store.ts`：

```ts
import { DatabaseSync } from "node:sqlite";
import type {
  InventoryItem,
  InventoryItemInput,
  InventorySummary,
  Submission,
} from "@pinpin/shared";
import { openDb } from "./db.js";

export { openDb };

export class WarehouseStore {
  constructor(private readonly db: DatabaseSync) {}

  upsertItem(id: string, input: InventoryItemInput): InventorySummary {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT id FROM inventory_items WHERE id = ?")
      .get(id);
    if (!existing) {
      this.db.prepare(
        `INSERT INTO inventory_items
          (id, color, current_stock, min_stock, unit, note, location, supplier, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.color ?? "",
        input.currentStock,
        input.minStock,
        input.unit ?? "颗",
        input.note ?? "",
        input.location ?? "",
        input.supplier ?? "",
        now,
        now,
      );
    } else {
      this.db.prepare(
        `UPDATE inventory_items
         SET color = COALESCE(?, color),
             current_stock = ?,
             min_stock = ?,
             unit = COALESCE(?, unit),
             note = COALESCE(?, note),
             location = COALESCE(?, location),
             supplier = COALESCE(?, supplier),
             updated_at = ?
         WHERE id = ?`,
      ).run(
        input.color,
        input.currentStock,
        input.minStock,
        input.unit,
        input.note,
        input.location,
        input.supplier,
        now,
        id,
      );
    }
    return this.listInventory().find((x) => x.id === id)!;
  }

  listInventory(search = ""): InventorySummary[] {
    const rows = this.db.prepare(
      `SELECT i.*,
              MAX(0, i.min_stock - i.current_stock) AS deficit,
              COALESCE(SUM(l.count), 0) AS cumulative_consumed
       FROM inventory_items i
       LEFT JOIN consumption_lines l ON l.bead_id = i.id
       WHERE i.id LIKE ?
       GROUP BY i.id
       ORDER BY i.id`,
    ).all(`%${search}%`) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapItem(r));
  }

  listReplenish(): InventorySummary[] {
    return this.listInventory().filter((x) => x.currentStock < x.minStock);
  }

  deleteItem(id: string): void {
    const used = this.db
      .prepare("SELECT COUNT(*) AS c FROM consumption_lines WHERE bead_id = ?")
      .get(id) as { c: number };
    if (used.c > 0) throw new Error("该编号已有消耗流水，不能删除");
    this.db.prepare("DELETE FROM inventory_items WHERE id = ?").run(id);
  }

  consumeSubmission(
    submissionId: string,
    imageName: string,
    lines: Array<{ beadId: string; count: number }>,
  ): void {
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare(
        "INSERT INTO submissions (id, image_name, created_at) VALUES (?, ?, ?)",
      ).run(submissionId, imageName, now);
      const insertLine = this.db.prepare(
        "INSERT INTO consumption_lines (submission_id, bead_id, count) VALUES (?, ?, ?)",
      );
      const ensureItem = this.db.prepare(
        `INSERT OR IGNORE INTO inventory_items
          (id, color, current_stock, min_stock, unit, note, location, supplier, created_at, updated_at)
         VALUES (?, '', 0, 0, '颗', '', '', '', ?, ?)`,
      );
      const decrement = this.db.prepare(
        "UPDATE inventory_items SET current_stock = current_stock - ?, updated_at = ? WHERE id = ?",
      );
      for (const line of lines) {
        ensureItem.run(line.beadId, now, now);
        insertLine.run(submissionId, line.beadId, line.count);
        decrement.run(line.count, now, line.beadId);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  revertSubmission(submissionId: string): void {
    const sub = this.db
      .prepare("SELECT id, reverted_at FROM submissions WHERE id = ?")
      .get(submissionId) as { id: string; reverted_at: string | null } | undefined;
    if (!sub) throw new Error("提交不存在");
    if (sub.reverted_at) throw new Error("该提交已撤销");
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE submissions SET reverted_at = ? WHERE id = ?").run(now, submissionId);
      const lines = this.db.prepare(
        "SELECT bead_id, count FROM consumption_lines WHERE submission_id = ?",
      ).all(submissionId) as Array<{ bead_id: string; count: number }>;
      const increment = this.db.prepare(
        "UPDATE inventory_items SET current_stock = current_stock + ?, updated_at = ? WHERE id = ?",
      );
      for (const line of lines) {
        increment.run(line.count, now, line.bead_id);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  listSubmissions(): Submission[] {
    const subs = this.db.prepare(
      "SELECT * FROM submissions ORDER BY created_at DESC",
    ).all() as Array<Record<string, unknown>>;
    return subs.map((s) => ({
      id: s.id as string,
      imageName: s.image_name as string,
      createdAt: s.created_at as string,
      revertedAt: (s.reverted_at as string | null) ?? null,
      lines: (this.db.prepare(
        "SELECT bead_id, count FROM consumption_lines WHERE submission_id = ?",
      ).all(s.id) as Array<{ bead_id: string; count: number }>).map((l) => ({
        beadId: l.bead_id,
        count: l.count,
      })),
    }));
  }

  private mapItem(r: Record<string, unknown>): InventorySummary {
    return {
      id: r.id as string,
      color: r.color as string,
      currentStock: r.current_stock as number,
      minStock: r.min_stock as number,
      unit: r.unit as string,
      note: r.note as string,
      location: r.location as string,
      supplier: r.supplier as string,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      deficit: r.deficit as number,
      cumulativeConsumed: r.cumulative_consumed as number,
    };
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w backend -- warehouse-store.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/storage/db.ts backend/src/storage/warehouse-store.ts backend/test/warehouse-store.test.ts
git commit -m "feat: add SQLite warehouse store with consume and revert"
```

---

### Task 9: 仓库 API 与提交集成

**Files:**
- Modify: `backend/src/api/routes.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/test/warehouse-api.test.ts`

**Interfaces:**
- Consumes: `WarehouseStore`
- Produces: `routes(store, warehouse)`、`createApp(store, warehouse?)`。
- API：`GET/PUT/DELETE /api/inventory`、`POST /api/inventory/import`、`GET /api/inventory/replenish`、`GET /api/submissions`、`POST /api/submissions/:id/revert`。
- `POST /api/submit` 在保存 JSON/CSV 后调用 `warehouse.consumeSubmission`。

- [ ] **Step 1: 写失败测试**

`backend/test/warehouse-api.test.ts`：

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
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
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w backend -- warehouse-api.test.ts`
Expected: FAIL。

- [ ] **Step 3: 扩展路由与入口**

Modify `backend/src/api/routes.ts`：签名改为 `routes(store: ResultStore, warehouse: WarehouseStore)`，在函数体中新增：

```ts
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
```

同时修改 `/submit`，在 `store.save` 成功后调用：

```ts
      warehouse.consumeSubmission(id, payload.image.name, payload.legend.map((item) => ({
        beadId: item.id,
        count: item.count,
      })));
```

Modify `backend/src/index.ts` 为最终版本：

```ts
import cors from "cors";
import express from "express";
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
  const warehouse = new WarehouseStore(openDb(join(process.cwd(), "data", "warehouse.sqlite")));
  const app = createApp(new JsonResultStore(join(process.cwd(), "data")), warehouse);
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => console.log(`backend listening on ${port}`));
}
```

`routes` 的签名同步改为 `routes(store: ResultStore, warehouse: WarehouseStore)`；在 `backend/src/api/routes.ts` 顶部增加 `import type { WarehouseStore } from "../storage/warehouse-store.js";`，并移除 Phase A 版本未使用的 `randomUUID` 导入。

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w backend -- warehouse-api.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/api/routes.ts backend/src/index.ts backend/test/warehouse-api.test.ts
git commit -m "feat: expose inventory and submission APIs and integrate submit"
```

---

### Task 10: 仓库前端

**Files:**
- Modify: `frontend/src/router.ts`
- Modify: `frontend/src/App.vue`
- Create: `frontend/src/api/warehouse.ts`
- Create: `frontend/src/stores/warehouse.ts`
- Create: `frontend/src/views/InventoryView.vue`
- Create: `frontend/src/views/SubmissionsView.vue`
- Create: `frontend/src/components/InventoryTable.vue`
- Create: `frontend/src/components/InventoryForm.vue`
- Create: `frontend/src/components/ReplenishPanel.vue`
- Test: `frontend/test/warehouse.spec.ts`

**Interfaces:**
- Consumes: `@pinpin/shared` 仓库类型
- Produces: 仓库台账、CSV 导入、待补充、提交记录撤销。

- [ ] **Step 1: 写 API client 与 store**

`frontend/src/api/warehouse.ts`：

```ts
import type { InventoryItemInput, InventorySummary, Submission } from "@pinpin/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "请求失败");
  return res.json() as Promise<T>;
}

export async function listInventory(search = ""): Promise<InventorySummary[]> {
  return json(await fetch(`/api/inventory?search=${encodeURIComponent(search)}`));
}
export async function listReplenish(): Promise<InventorySummary[]> {
  return json(await fetch("/api/inventory/replenish"));
}
export async function upsertInventory(id: string, input: InventoryItemInput): Promise<InventorySummary> {
  return json(await fetch(`/api/inventory/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}
export async function importInventory(file: File): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const form = new FormData();
  form.append("file", file);
  return json(await fetch("/api/inventory/import", { method: "POST", body: form }));
}
export async function listSubmissions(): Promise<Submission[]> {
  return json(await fetch("/api/submissions"));
}
export async function revertSubmission(id: string): Promise<void> {
  await json(await fetch(`/api/submissions/${encodeURIComponent(id)}/revert`, { method: "POST" }));
}
```

`frontend/src/stores/warehouse.ts`：

```ts
import { defineStore } from "pinia";
import type { InventorySummary, Submission } from "@pinpin/shared";
import * as api from "../api/warehouse.js";

export const useWarehouseStore = defineStore("warehouse", {
  state: () => ({
    items: [] as InventorySummary[],
    replenish: [] as InventorySummary[],
    submissions: [] as Submission[],
    loading: false,
  }),
  actions: {
    async refresh() {
      this.loading = true;
      try {
        [this.items, this.replenish, this.submissions] = await Promise.all([
          api.listInventory(),
          api.listReplenish(),
          api.listSubmissions(),
        ]);
      } finally {
        this.loading = false;
      }
    },
  },
});
```

- [ ] **Step 2: 写视图与组件**

`frontend/src/views/InventoryView.vue`（含台账、待补充、CSV 导入入口）：

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { InventorySummary } from "@pinpin/shared";
import InventoryTable from "../components/InventoryTable.vue";
import InventoryForm from "../components/InventoryForm.vue";
import ReplenishPanel from "../components/ReplenishPanel.vue";
import { useWarehouseStore } from "../stores/warehouse.js";
import { importInventory } from "../api/warehouse.js";

const store = useWarehouseStore();
const showForm = ref(false);
const editing = ref<InventorySummary | null>(null);
const csvInput = ref<HTMLInputElement | null>(null);
onMounted(() => store.refresh());

function openNew() {
  editing.value = null;
  showForm.value = true;
}
function openEdit(item: InventorySummary) {
  editing.value = item;
  showForm.value = true;
}
function closeForm() {
  showForm.value = false;
  editing.value = null;
}

async function onCsv(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const result = await importInventory(file);
  await store.refresh();
  alert(`导入 ${result.imported} 条，跳过 ${result.skipped} 条`);
}
</script>

<template>
  <main class="inventory">
    <header>
      <h1>仓库台账</h1>
      <button @click="openNew">新增</button>
      <button @click="csvInput?.click()">CSV 导入</button>
      <input ref="csvInput" type="file" accept=".csv" hidden @change="onCsv" />
    </header>
    <ReplenishPanel :items="store.replenish" />
    <InventoryTable :items="store.items" @edit="openEdit" />
    <InventoryForm v-if="showForm" :initial="editing ?? undefined" @close="closeForm" @saved="store.refresh(); closeForm()" />
  </main>
</template>
```

`frontend/src/views/SubmissionsView.vue`：

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { revertSubmission } from "../api/warehouse.js";
import { useWarehouseStore } from "../stores/warehouse.js";
const store = useWarehouseStore();
onMounted(() => store.refresh());
async function revert(id: string) {
  await revertSubmission(id);
  await store.refresh();
}
</script>

<template>
  <main class="submissions">
    <h1>提交记录</h1>
    <section v-for="s in store.submissions" :key="s.id" class="submission">
      <p>{{ s.imageName }} · {{ s.createdAt }} · {{ s.revertedAt ? "已撤销" : "未撤销" }}</p>
      <ul>
        <li v-for="l in s.lines" :key="l.beadId">{{ l.beadId }} x {{ l.count }}</li>
      </ul>
      <button v-if="!s.revertedAt" @click="revert(s.id)">撤销回补</button>
    </section>
  </main>
</template>
```

`frontend/src/components/InventoryTable.vue`：

```vue
<script setup lang="ts">
import type { InventorySummary } from "@pinpin/shared";

defineProps<{ items: InventorySummary[] }>();
defineEmits<{ edit: [item: InventorySummary] }>();

function cssColor(c: string) {
  if (!c) return "transparent";
  const [r, g, b] = c.split(",").map(Number);
  return `rgb(${r},${g},${b})`;
}
</script>

<template>
  <table class="inventory-table">
    <thead>
      <tr>
        <th>颜色</th><th>编号</th><th>当前库存</th><th>最低库存线</th>
        <th>缺口</th><th>累计消耗</th><th>备注</th><th>位置</th><th>供应商</th><th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in items" :key="row.id">
        <td><span class="swatch" :style="{ background: cssColor(row.color) }"></span></td>
        <td>{{ row.id }}</td>
        <td>{{ row.currentStock }}</td>
        <td>{{ row.minStock }}</td>
        <td>{{ row.deficit }}</td>
        <td>{{ row.cumulativeConsumed }}</td>
        <td>{{ row.note }}</td>
        <td>{{ row.location }}</td>
        <td>{{ row.supplier }}</td>
        <td><button @click="$emit('edit', row)">编辑</button></td>
      </tr>
    </tbody>
  </table>
</template>
```

`frontend/src/components/InventoryForm.vue`：

```vue
<script setup lang="ts">
import { reactive } from "vue";
import type { InventoryItemInput, InventorySummary } from "@pinpin/shared";
import { upsertInventory } from "../api/warehouse.js";

const props = defineProps<{ initial?: InventorySummary }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const form = reactive({
  id: props.initial?.id ?? "",
  color: props.initial?.color ?? "",
  currentStock: props.initial?.currentStock ?? 0,
  minStock: props.initial?.minStock ?? 0,
  unit: props.initial?.unit ?? "颗",
  note: props.initial?.note ?? "",
  location: props.initial?.location ?? "",
  supplier: props.initial?.supplier ?? "",
});

async function save() {
  const input: InventoryItemInput = {
    color: form.color,
    currentStock: form.currentStock,
    minStock: form.minStock,
    unit: form.unit,
    note: form.note,
    location: form.location,
    supplier: form.supplier,
  };
  await upsertInventory(form.id, input);
  emit("saved");
}
</script>

<template>
  <div class="modal">
    <form @submit.prevent="save">
      <label>编号 <input v-model="form.id" :readonly="!!initial" /></label>
      <label>颜色 <input v-model="form.color" placeholder="r,g,b" /></label>
      <label>当前库存 <input v-model.number="form.currentStock" type="number" min="0" /></label>
      <label>最低库存线 <input v-model.number="form.minStock" type="number" min="0" /></label>
      <label>单位 <input v-model="form.unit" /></label>
      <label>备注 <input v-model="form.note" /></label>
      <label>位置 <input v-model="form.location" /></label>
      <label>供应商 <input v-model="form.supplier" /></label>
      <button type="submit">保存</button>
      <button type="button" @click="$emit('close')">取消</button>
    </form>
  </div>
</template>
```

`frontend/src/components/ReplenishPanel.vue`：

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { InventorySummary } from "@pinpin/shared";

const props = defineProps<{ items: InventorySummary[] }>();
const sorted = computed(() => [...props.items].sort((a, b) => b.deficit - a.deficit));
</script>

<template>
  <section class="replenish">
    <h2>待补充</h2>
    <ul>
      <li v-for="row in sorted" :key="row.id">
        {{ row.id }}：当前 {{ row.currentStock }}，最低 {{ row.minStock }}，缺口 {{ row.deficit }}
      </li>
      <li v-if="sorted.length === 0">无待补充编号</li>
    </ul>
  </section>
</template>
```

- [ ] **Step 3: 更新路由与导航**

`frontend/src/router.ts` 增加：

```ts
  { path: "/inventory", component: InventoryView },
  { path: "/submissions", component: SubmissionsView },
```

`frontend/src/App.vue` 增加顶部导航：

```vue
<template>
  <nav>
    <router-link to="/">上传识别</router-link>
    <router-link to="/inventory">仓库台账</router-link>
    <router-link to="/submissions">提交记录</router-link>
  </nav>
  <router-view />
</template>
```

- [ ] **Step 4: Playwright 验证**

`frontend/test/warehouse.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

test("inventory view renders", async ({ page }) => {
  await page.goto("http://localhost:5173/inventory");
  await expect(page.getByRole("heading", { name: "仓库台账" })).toBeVisible();
});
```

Run: `npx playwright test frontend/test/warehouse.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src
git commit -m "feat: add warehouse inventory and submission views"
```

---

## Final Verification

- [ ] Run backend tests: `npm test -w backend`
- [ ] Run frontend tests: `npm test -w frontend`
- [ ] Run build: `npm run build`
- [ ] Manual smoke: 上传 `E:\work\pinpin\图纸.jpg`，确认识别出 28 个图例条目；提交后检查 `data/<id>.json`、`data/<id>.csv` 与 `data/warehouse.sqlite`；仓库台账扣减正确，撤销后回补。
