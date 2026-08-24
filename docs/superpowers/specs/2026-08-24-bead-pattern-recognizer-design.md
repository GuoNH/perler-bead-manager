# 拼豆图纸识别与统计工具 - 设计文档

日期：2026-08-24
状态：已确认，待实现

## 1. 目标与范围

构建一个本地 Web 应用：上传拼豆图纸图片，自动识别图例中每个颜色条目的「编号、数量、色块颜色」，人工确认/修正后提交，保存为本地 JSON 与 CSV。

### 1.1 核心目标

- 从图纸图例直接读取每个颜色条目的：编号（如 `A10`）、数量（数字）、色块颜色（RGB）。
- 不做图案网格的逐格计数，计数信息直接取自图例。
- 提供人工确认/修正界面，保证最终统计准确。

### 1.2 非目标（v1 不做）

- 不识别颜色名称（如“深蓝”）。
- 不做图案网格渲染或逐格配色。
- 不做历史记录列表界面（接口预留，见 9.2）。
- 不做多用户、远程部署、数据库持久化。

## 2. 输入与输出

### 2.1 输入

- 单张拼豆图纸图片（JPEG/PNG），上传后由后端处理。

### 2.2 输出

- `data/<id>.json`：结构化识别结果。
- `data/<id>.csv`：`编号,颜色,数量` 表格，方便 Excel 打开。
- 前端图例确认表与总数汇总。

CSV 示例：

```csv
编号,颜色,数量
A10,"254,169,72",202
B03,"30,60,120",56
```

## 3. 技术栈

- 前端：Vue 3 + Vite + TypeScript + Pinia。
- 后端：Node.js + TypeScript。
- 图像解码：`sharp`。
- OCR：调用本机 `tesseract.exe`（`C:\Program Files\Tesseract-OCR\tesseract.exe`）。
- 存储：本地 JSON/CSV，`ResultStore` 接口预留 SQLite。
- 仓库结构：npm workspaces 单仓库，`shared` 包共享类型。

## 4. 系统架构

```text
Vue 3 前端
  ├─ 上传图片 → 预览
  ├─ 调 POST /api/recognize 自动识别
  ├─ 图例表人工确认/修正
  └─ 调 POST /api/submit 提交
        │
        ▼
Node.js + TS 后端
  ├─ recognizer（解码 → 图例检测 → OCR → 取色）
  └─ storage（JSON 落盘，预留 SQLite）
        ▼
data/<id>.json + data/<id>.csv
```

## 5. 识别引擎设计

### 5.1 图像解码

`sharp` 读取上传图片，输出原始 RGB 到 `Uint8Array`（`width * height * 3`）。

### 5.2 图例检测（通用，不硬编码坐标）

1. 计算每个像素的饱和度，筛出高饱和像素。
2. 用连通域找出矩形候选块，按面积、长宽比、颜色一致性过滤，得到 swatch 候选。
3. 按 y 坐标聚类成行，按 x 排序得到条目顺序。
4. 每个 swatch 左侧拆出两段文字区：编号、数量。
   - 文字区通过与局部背景/色块颜色对比得到掩码，再用连通域或列间隙分段。
   - 具体相对位置自动判定，不依赖固定像素偏移。
5. 对无法可靠定位的条目写入 `warnings`，由前端人工修正兜底。

### 5.3 OCR

- 编号：字符白名单 `A-Z a-z 0-9`，保留原样（含大小写与前导零）。用 `--psm 7` 或 `--psm 8`。
- 数量：字符白名单 `0-9`，单独识别。
- 对识别为空、包含非法字符、置信度不足的结果写入 `warnings`。

### 5.4 色块取色

取 swatch 内部（避开边框）的中位 RGB 作为该条目的参考颜色。

## 6. 数据模型

类型定义位于 `shared/src/types.ts`，前后端共用。

```ts
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface LegendItem {
  id: string;        // 编号，如 "A10"
  rgb: RGB;          // 色块颜色
  count: number;     // 数量
}

export interface Warning {
  level: "info" | "warn" | "error";
  message: string;
}

export interface RecognizeResult {
  image: { name: string; width: number; height: number };
  legend: LegendItem[];
  warnings: Warning[];
}

export interface SubmitPayload {
  image: { name: string; width: number; height: number };
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
```

## 7. API 定义

```http
POST /api/recognize
  请求: multipart/form-data（字段 image）
  响应: RecognizeResult

POST /api/submit
  请求: SubmitPayload (application/json)
  响应: { id, jsonPath, csvPath, total }

GET /api/results
  响应: RecognitionSummary[]        # v1 预留，暂不做界面

GET /api/results/:id
  响应: RecognitionRecord           # v1 预留
```

## 8. 前端设计

单页应用，主界面为「上传视图 + 图例确认表」。

### 8.1 上传视图

- 拖拽或点击上传图片，本地预览。
- 调用 `/api/recognize`，显示加载态。
- 识别失败或返回 `error` 告警时，展示明确错误提示。

### 8.2 图例确认表（核心）

每行显示并允许编辑：`色块预览 / 编号 / 数量`。

- 编号：文本输入，保留字符串格式。
- 数量：数字输入。
- 色块：点击可用取色器修改。
- 支持新增、删除、合并颜色项。
  - 合并：将两条编号相同的条目合并为一条，数量求和，颜色取第一条的色块。
- 数量、总数、色种数随编辑实时刷新。

### 8.3 提交

- 提交前校验：无空编号、无重复编号、数量为非负整数。
- 存在 `error` 级问题时禁用提交，直到修正或用户明确确认忽略。
- 提交成功显示保存路径与汇总。

## 9. 存储设计

### 9.1 接口

```ts
export interface ResultStore {
  save(record: RecognitionRecord): Promise<{ id: string; jsonPath: string; csvPath: string }>;
  list(): Promise<RecognitionSummary[]>;
  get(id: string): Promise<RecognitionRecord>;
}
```

### 9.2 当前实现

- `JsonResultStore`：写入 `data/<id>.json` 与 `data/<id>.csv`，并在 `data/index.json` 记录摘要列表。
- `id` 使用时间戳生成，如 `20260824-153000`。

### 9.3 未来扩展

- `SqliteResultStore` 实现同一接口（Node 22+ 内置 `node:sqlite`），替换实现即可，上层无感。

## 10. 错误处理与校验

- 无图例 / 图例为空 → 返回 `error`，前端提示无法识别。
- 编号为空或重复 → `warn`/`error`。
- 数量为空、非数字 → `error`；识别阶段数量为 0 → `warn`（提示人工确认，提交阶段允许 0）。
- OCR 低置信度、非法字符 → `warn`。
- 提交前前端再次校验，后端也做基本校验。

## 11. 测试策略

- 单元测试：
  - 图例检测（用 fixture 图片或合成图）。
  - OCR 调用封装（mock tesseract）。
  - swatch 取色。
  - CSV/JSON 序列化。
- 集成测试：
  - 对参考图 `图纸.jpg` 跑 `/api/recognize`，断言图例条目数大于 0，条目含 id/rgb/count，无重复编号或产生对应 warning。
- 前端测试：
  - 图例表编辑、增删、提交链路（Playwright 截图验证）。

## 12. 目录结构

```text
pinpin/
  package.json              # npm workspaces 根
  shared/
    src/types.ts
  backend/
    src/
      index.ts              # HTTP 服务入口
      api/routes.ts
      recognizer/
        decode.ts
        legend.ts
        ocr.ts
        color.ts
      storage/
        store.ts
        json-store.ts
  frontend/
    src/
      api/client.ts
      stores/recognition.ts
      views/UploadView.vue
      components/
        LegendPanel.vue
        SummaryBar.vue
  data/                     # 提交结果
```

## 13. 假设与边界

1. 编号按字符串处理，原样保留大小写与前导零（如 `A10`、`B03`）。
2. 数量来自图例，不做图案网格计数。
3. 通用图例检测不保证 100% 正确，人工确认是最终准确性的兜底。
4. 第一版本地运行，不做历史列表界面，但 `list/get` 接口预留。
5. 当前工作目录没有 git 仓库，本 spec 未随 git 提交。

## 14. 未来扩展

- SQLite 持久化（`SqliteResultStore`）。
- 历史结果列表与回看界面。
- 颜色名称映射与材料清单导出。
- 图案网格渲染（仅用于视觉复核，不参与计数）。
