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

`sharp` 读取上传图片，输出原始 RGB 到 `Uint8Array`（`width * height * 3`），后续所有
处理都在这个像素数组上进行，便于单测与引擎替换。

### 5.2 图例区域检测（双通道，布局无关）

图纸里“图例色块区”的形态不固定：最常见的是成行的宽色条（文字印在色块内部或色块上方，
如 `图纸.jpg` 底部），也可能是成行/成列的小方块（编号/数量印在色块旁边），还可能是单列
竖排。`legend.ts` 用“双通道 + 合并”策略，不依赖任何固定坐标：

1. **条带通道（band）**：扫描哪些行里同时存在多条“较长且颜色均匀”的色带，把这类行聚类
   成候选区域后在近空行处切开成“条带”，再按列空隙把每个条带切分成色块格。整行都是色带的
   区域几乎不可能是图案网格，因此能稳定抓出宽条图例（`图纸.jpg` 实测 4 行共 29 格，且不会
   从上方图案区产生虚假候选）。
2. **连通域通道（fallback）**：只有条带通道没有结果时才启用。按“成行或成列、同尺寸、颜色
   单一”的约束收集小方块/单列图例的候选色块，避免把图案区的杂色误当图例。
3. 多行条带共享同一套列边界（抑制单行噪声）；颜色很浅/接近白色的色块靠“与背景主色差异较大
   的文字像素”判断是否真的有内容。

### 5.3 布局无关的文字配对

图例里“编号/数量”相对色块的位置不固定（色块内部、左侧、右侧、上方、下方）。`pairing.ts`
不猜布局，而是对每个色块行生成多个候选 OCR 区域：

1. 在色块行**周边一个窗口**里找深色文字墨迹，也在每个色块**内部**找“少数派极值墨迹”
   （色块内印刷的白字/深字）。
2. 用“相邻色块中点半区”把周边文字水平归属给最近的色块；垂直方向优先归属最近的行带，
   防止行间标签被上下两行重复认领。
3. 同属一个色块、同一文字行的文字词**合并成一个 OCR 区域**（例如印在色块上方的一整行
   `A10(202)` 不会被拆成单字碎片逐个识别）。
4. 每个色块始终把“整块色块”作为第一个候选（覆盖文字印在色块内部、且墨迹对比度低、难以
   单独聚类的图纸），再用色块内文字紧致框、周边文字区域补细节。

### 5.4 OCR（引擎抽象 + 预处理）

`ocr.ts` 只负责“裁剪 → 预处理 → 调用引擎”，真正识别逻辑在 `engines/`：

- 预处理：对裁剪区域灰度化、按高度放大到至少 64px（文字太小是准确率低的主因）、Otsu
  二值化，并自动判断“浅底深字 / 深底浅字”极性后反色，保证深色与浅色文字都能被识别。
- 引擎抽象：`OcrEngine.recognize(imagePath) -> EngineWord[]` 返回词级文本、置信度与包围盒。
  当前实现 `TesseractEngine`（TSV 输出，同时拿到文本/置信度/坐标）；`RapidOcrEngine` 预留，
  通过 `OCR_ENGINE=tesseract|rapidocr` 环境变量选择，上层代码无需改动。
- 图例文字用白名单 `A-Z 0-9 ( )`（括号不能丢），单行区域用 `--psm 7`，整块色块区域用
  `--psm 6`。

### 5.5 编号/数量解析与多候选合并

- `parse.ts` 把 OCR 原始文本清洗成“编号 + 数量”，兼容 `A11(202)`、`A11（202）`、
  `A11 202`、只有编号、只有数量等写法；并修正 0/O、1/I/L、8/B、5/S、2/Z、6/G 等字母数字
  混淆（`2O2 -> 202`、`a1o -> A10`）。
- 同一色块多个候选区域的解析结果用 `mergeRegionReads` 合并：优先完整度最高（编号带字母+数字、
  带数量）的读取，若它缺数量则用其它候选的合法数量补上；带置信度，低于阈值给 warn 交由人工
  核对。

### 5.6 色块取色

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
  - OCR 调用封装（mock tesseract / mock 引擎返回词级结果）。
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
        legend.ts          # 双通道图例检测（band + 连通域 fallback）
        pairing.ts         # 布局无关文字配对 -> 候选 OCR 区域
        text.ts            # 深/浅墨迹连通域 -> 文字词包围盒
        parse.ts           # 编号/数量解析与混淆修正
        ocr.ts             # 裁剪 + 预处理 + 引擎调用
        engines/           # OcrEngine 抽象：tesseract / rapidocr
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
5. 本 spec 随仓库提交维护；识别精度以人工确认为最终兜底。

## 14. 未来扩展

- SQLite 持久化（`SqliteResultStore`）。
- 拼豆仓库管理模块（见 14.1）。
- 移动端 / 微信小程序访问（见 14.2）。
- 历史结果列表与回看界面。
- 颜色名称映射与材料清单导出。
- 图案网格渲染（仅用于视觉复核，不参与计数）。

### 14.1 拼豆仓库管理（后续独立模块）

在现有「识别 + 人工确认 + 提交」链路之上，扩展库存与消耗管理：

- 维护按编号的库存台账：每个编号一个库存记录，含当前库存量、最低安全库存阈值、单位（颗）。
- 提交一张图纸后，将该图纸各编号数量作为消耗流水写入台账，并同步扣减当前库存。
- 提供仓库视图：展示各编号当前库存、累计消耗、最近提交时间。
- 提供待补充视图：展示需要补货的编号，判定规则在该模块设计时确定；候选规则包括「当前库存低于安全阈值」与「按历史消耗速率预测未来缺货」，二者可组合。

该模块依赖 SQLite 持久化；JSON/CSV 阶段的 `ResultStore` 仅负责图纸识别结果，不承载库存数据。仓库模块沿用相同的编号规范（字符串、保留大小写与前导零），保证与识别结果可关联。

### 14.2 移动端 / 微信小程序访问（后续部署变体）

v1 后端按「API-first」设计：识别、仓库、提交均通过 JSON REST API 暴露，Web 前端只是其中一个客户端。未来可将同一套后端部署到可被手机访问的主机（局域网或公网），新增移动 Web 或微信小程序客户端复用现有 API。

该变体带来的额外事项不属于 v1 范围，届时需单独设计：

- 公网/局域网部署与 HTTPS 域名（微信小程序要求合法域名）。
- 登录与多用户隔离；本地 JSON/CSV 需改为服务端多租户存储。
- 微信小程序的上传、图片预览与授权流程封装。
- 本地 `tesseract.exe` 依赖需随服务端部署，或替换为可部署的 OCR 方案。
