# 拼豆管理（Pinpin）

一个本地优先的拼豆图纸识别与仓库管理工具。上传拼豆图纸后，应用会自动定位图例色块，通过 OCR 识别编号和数量，并提取色块 RGB；人工确认后可保存识别结果，同时按编号扣减仓库库存。

> 当前版本按图例统计，不会逐格识别图案，也不会推断颜色名称。

![拼豆图纸示例](./图纸.jpg)

## 功能

- **图纸识别**：上传或拖拽 JPEG、PNG、WebP 等常见图片，识别图例中的颜色块、编号和数量。
- **人工校正**：提交前可修改编号、数量和颜色，也可新增或删除图例条目。
- **失败补录**：无法识别编号的色块会单独列出原图位置、颜色和 OCR 文本，便于逐项补录。
- **OCR 自动回退**：优先使用本机 Tesseract；未安装或无法执行时自动退回内置 tesseract.js WASM。
- **结果导出**：每次提交会生成 JSON 和 CSV 文件，方便归档或使用 Excel 打开。
- **仓库台账**：维护每个拼豆编号的当前库存、最低库存、颜色、位置、供应商和备注。
- **库存消耗**：提交图纸后，按图例数量自动扣减对应库存，并记录提交流水。
- **缺货提醒**：展示当前库存低于最低库存线的编号及缺口。
- **撤销回补**：撤销一次提交会将已扣减的库存加回，并从累计消耗中排除该次提交。
- **CSV 导入**：批量导入库存数据，按表头读取 `编号`、`当前库存`、`最低库存` 列。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | Vue 3、Vite、TypeScript、Pinia、Vue Router |
| 后端 | Node.js、Express、TypeScript、Multer |
| 图像处理 | Sharp |
| OCR | 系统 Tesseract、tesseract.js WASM，预留 RapidOCR |
| 仓库存储 | Node.js 内置 `node:sqlite` |
| 识别结果存储 | 本地 JSON / CSV |
| 测试 | Vitest、Supertest、Playwright |

## 环境要求

- **Node.js 24 LTS（推荐）**。后端使用内置的 `node:sqlite`，请勿使用 Node.js 18。
- npm 11 或与 Node.js 配套的 npm 版本。
- 系统 Tesseract 为可选依赖。默认识别流程会优先使用本机 `tesseract`，未安装或无法执行时自动退回 tesseract.js WASM。
- 首次运行前端端到端测试时，需要安装 Playwright Chromium。

系统 Tesseract 通常速度更快。需要时可按以下方式安装：

```bash
# macOS
brew install tesseract

# Ubuntu / Debian
sudo apt install tesseract-ocr
```

Windows 默认探测 `C:\Program Files\Tesseract-OCR\tesseract.exe`。如果安装在其他位置，可设置 `TESSERACT_EXE`：

```bash
TESSERACT_EXE="/path/to/tesseract" npm run dev
```

仓库内附带了 `tessdata/eng.traineddata`，tesseract.js 回退引擎会直接使用它；系统 Tesseract 缺少英文语言数据时，也可以强制使用 tesseract.js：

```bash
OCR_ENGINE=tesseractjs npm run dev
```

可用的 OCR 配置：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OCR_ENGINE` | `auto` | 可选 `auto`、`tesseract`、`tesseractjs`、`rapidocr` |
| `TESSERACT_EXE` | 自动探测 | 指定本机 Tesseract 可执行文件路径 |
| `RAPIDOCR_MODEL_DIR` | 无 | 使用可选 RapidOCR 时指定模型目录 |

`rapidocr` 不是默认安装的依赖，需要额外安装 `rapidocr-onnxruntime` 和 `onnxruntime-node`，并准备模型文件。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 首次开发前构建共享类型包
npm run build -w shared

# 3. 同时启动后端和前端
npm run dev
```

启动后访问：

- 前端：<http://localhost:5173>
- 后端 API：<http://localhost:3001/api>

前端开发服务器会把 `/api` 请求代理到后端。仓库内的 `图纸.jpg` 可作为识别测试图片。

## 使用流程

### 识别并提交图纸

1. 进入“上传识别”，点击或拖拽上传拼豆图纸。
2. 等待识别完成，检查图例表中的颜色、编号和数量。
3. 修正错误数据；无法识别的条目会显示告警。
4. 点击“提交”。系统会保存识别结果，并按条目数量扣减库存。
5. 如果提交的编号尚未建档，系统会自动创建一个库存为 0 的条目后再扣减。

### 管理仓库库存

1. 进入“仓库台账”，点击“新增”创建编号。
2. 填写颜色（格式为 `r,g,b`，例如 `254,169,72`）、当前库存和最低库存线。
3. 可在“待补充”面板查看缺货编号。
4. 使用“CSV 导入”批量更新库存。

可解析的 CSV 示例：

```csv
编号,当前库存,最低库存
A10,202,100
B03,56,20
```

CSV 读取器按列名查找字段，因此列顺序可以调整；当前实现是轻量拆分，不支持带引号的逗号字段，请避免在字段内容中使用逗号。导入当前只更新编号、当前库存和最低库存。

### 撤销提交

进入“提交记录”查看历史提交。点击“撤销回补”后，库存会恢复，该记录会标记为“已撤销”，且不再计入累计消耗。同一提交只能撤销一次。

## 可用脚本

在仓库根目录执行：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 并行启动后端开发服务和前端开发服务器 |
| `npm run build` | 依次构建 `shared`、`backend` 和 `frontend` |
| `npm test` | 运行后端测试和前端 Playwright 测试 |
| `npm run build -w shared` | 仅构建共享类型包 |
| `npm run test -w backend` | 仅运行后端 Vitest 测试 |
| `npm run test -w frontend` | 仅运行前端 Playwright 测试 |

`npm run test -w frontend` 不会自动启动服务。运行完整测试前，请先在另一个终端执行 `npm run dev`：

```bash
# 终端 1
npm run dev

# 终端 2
npx playwright install chromium
npm test
```

## 项目结构

```text
.
├── backend/                 # Express API、识别引擎、SQLite 仓储
│   ├── src/api/             # HTTP 路由
│   ├── src/recognizer/      # 解码、色块检测、OCR、取色
│   ├── src/storage/         # JSON/CSV 与 SQLite 存储
│   └── test/                # 后端单元/API 测试
├── frontend/                # Vue 3 单页应用
│   ├── src/views/           # 上传、仓库、提交记录页面
│   ├── src/components/      # 图例、库存表格和表单等组件
│   ├── src/stores/          # Pinia 状态
│   └── test/                # Playwright 端到端测试
├── shared/                  # 前后端共享 TypeScript 类型
├── docs/                    # 设计与实现文档
├── tessdata/                # OCR 英文训练数据
└── 图纸.jpg                 # 示例图纸
```

## API

所有接口以 `/api` 为前缀。错误响应通常为：

```json
{ "error": "错误说明" }
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/recognize` | 识别图纸。`multipart/form-data`，文件字段名为 `image` |
| `POST` | `/submit` | 保存确认结果并扣减库存。请求体为 `SubmitPayload` |
| `GET` | `/results` | 获取识别结果摘要列表 |
| `GET` | `/results/:id` | 获取指定识别结果 JSON |
| `GET` | `/inventory?search=` | 查询库存，可按编号模糊搜索 |
| `PUT` | `/inventory/:id` | 新增或更新库存条目 |
| `DELETE` | `/inventory/:id` | 删除没有消耗流水的库存条目，成功返回 204 |
| `GET` | `/inventory/replenish` | 获取低于最低库存线的条目 |
| `POST` | `/inventory/import` | 导入库存 CSV。`multipart/form-data`，文件字段名为 `file` |
| `GET` | `/submissions` | 获取提交记录 |
| `POST` | `/submissions/:id/revert` | 撤销提交并回补库存 |

识别响应示例：

```json
{
  "image": {
    "name": "图纸.jpg",
    "width": 1200,
    "height": 800
  },
  "legend": [
    {
      "id": "A10",
      "rgb": { "r": 254, "g": 169, "b": 72 },
      "count": 202
    }
  ],
  "warnings": [
    {
      "level": "warn",
      "message": "编号 B03 的 OCR 置信度较低，请人工核对"
    }
  ],
  "failedCells": [
    {
      "row": 4,
      "col": 3,
      "rgb": { "r": 248, "g": 54, "b": 88 },
      "text": "OCR 原文"
    }
  ]
}
```

`failedCells` 是需要人工补录的色块。`warnings` 的级别为 `info`、`warn` 或 `error`。

提交示例：

```json
{
  "image": {
    "name": "图纸.jpg",
    "width": 1200,
    "height": 800
  },
  "legend": [
    {
      "id": "A10",
      "rgb": { "r": 254, "g": 169, "b": 72 },
      "count": 202
    }
  ],
  "confirmedAt": "2026-09-14T12:00:00.000Z"
}
```

提交成功响应：

```json
{
  "id": "1789396800000",
  "jsonPath": "/path/to/data/1789396800000.json",
  "csvPath": "/path/to/data/1789396800000.csv",
  "total": 202
}
```

## 数据存储

开发服务会将数据写入仓库根目录的 `data/`，该目录已被 Git 忽略：

```text
data/
├── warehouse.sqlite         # 库存、提交记录、消耗流水
├── index.json               # 识别结果摘要索引
├── <id>.json                # 完整的确认结果
└── <id>.csv                 # 编号、颜色、数量
```

首次启动时若台账为空，会自动灌入 Mard 291 色号作为初始库存（当前库存 0、最低库存 0、供应商为 `Mard`）；已有台账则跳过，不重复灌入。

CSV 导出示例：

```csv
编号,颜色,数量
"A10","254,169,72",202
"B03","30,60,120",56
```

## 识别原理与限制

1. 使用 Sharp 解码图片并规范化 RGB 数据。
2. 图例检测采用“条带通道 + 连通域回退”的双通道策略，兼容图例文字位于色块内部、左侧、右侧、上方或下方的不同版式。
3. 根据深色/浅色文字墨迹为每个色块规划整块、紧致文字框和周边文字框等多个 OCR 候选区域。
4. OCR 前执行灰度化、放大、二值化和极性处理；默认识别引擎选择顺序为系统 Tesseract、tesseract.js。
5. 解析并合并多个候选结果，处理 `A11(202)` 等写法及 `0/O`、`1/I/L`、`8/B` 等常见混淆。
6. 取色块内部 RGB 中位数作为参考颜色；低置信度、可疑编号和失败条目会显示告警或补录卡片。

当前版本的限制：

- 图例色块需要足够清晰，且与周围图案或背景能够区分。
- OCR 可能受小字号、压缩噪点、低对比度或特殊字体影响。
- tesseract.js 首次启动和首次 OCR 可能较慢；安装系统 Tesseract 可以提升速度。
- 只统计图例数量，不遍历图案网格重新计数。
- 提交不会因库存不足而中止，可能出现负库存。
- 应用没有登录、权限控制或多人协作能力，只适合本机或可信内网使用，不应直接暴露到公网。

## 相关文档

- [图纸识别设计](./docs/superpowers/specs/2026-08-24-bead-pattern-recognizer-design.md)
- [仓库台账设计](./docs/superpowers/specs/2026-08-24-bead-warehouse-design.md)
- [v1 实施计划](./docs/superpowers/plans/2026-08-24-bead-v1-implementation-plan.md)
