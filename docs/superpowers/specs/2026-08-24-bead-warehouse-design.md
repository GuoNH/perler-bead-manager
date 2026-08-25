# 拼豆仓库管理模块 - 设计文档

日期：2026-08-24
状态：已确认，待实现
关联文档：`2026-08-24-bead-pattern-recognizer-design.md`

## 1. 目标与范围

在「图纸识别 + 人工确认 + 提交」基础上，扩展拼豆仓库管理：维护每个编号的当前库存、颜色、最低库存线等字段；图纸提交后自动生成消耗流水并扣减库存；支持撤销提交回补库存；提供待补充编号视图。

### 1.1 核心目标

- 维护按编号的库存台账，支持新增、编辑、删除和 CSV 导入。
- 提交图纸时，自动创建/更新消耗流水并扣减库存。
- 撤销某次提交时，自动回补库存，禁止重复撤销。
- 列出 `当前库存 < 最低库存线` 的待补充编号及缺口。

### 1.2 非目标（v1 不做）

- 不做按消耗速率预测缺货，v1 仅按固定最低库存线判定。
- 不做采购单、供应商对账、成本核算。
- 不做多用户和远程部署（移动端/微信小程序见「未来扩展」）。

## 2. 技术栈与约束

- 后端：Node.js + TypeScript，与识别模块同一服务。
- 数据库：SQLite，使用 Node 内置 `node:sqlite`，要求 Node >= 22.5；若运行环境无法直接启用，回退到 `better-sqlite3`。
- 识别结果仍导出 JSON/CSV；仓库台账和消耗流水以 SQLite 为唯一事实源。

## 3. 数据模型

### 3.1 表结构

```sql
CREATE TABLE IF NOT EXISTS inventory_items (
  id            TEXT PRIMARY KEY,
  color         TEXT NOT NULL DEFAULT '',
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock     INTEGER NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT '颗',
  note          TEXT NOT NULL DEFAULT '',
  location      TEXT NOT NULL DEFAULT '',
  supplier      TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id          TEXT PRIMARY KEY,
  image_name  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  reverted_at TEXT
);

CREATE TABLE IF NOT EXISTS consumption_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  bead_id       TEXT NOT NULL REFERENCES inventory_items(id),
  count         INTEGER NOT NULL CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_consumption_bead ON consumption_lines(bead_id);
CREATE INDEX IF NOT EXISTS idx_consumption_submission ON consumption_lines(submission_id);
```

### 3.2 类型定义

`shared/src/warehouse.ts` 前后端共用。

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
  deficit: number;             // max(0, minStock - currentStock)
  cumulativeConsumed: number;  // 累计消耗
}

export interface Submission {
  id: string;
  imageName: string;
  createdAt: string;
  revertedAt: string | null;
  lines: Array<{ beadId: string; count: number }>;
}
```

## 4. 系统架构与集成

```text
识别模块
  └─ POST /api/submit
       ├─ 写入 submissions + consumption_lines（SQLite 事务）
       ├─ 自动创建缺失 inventory_items（current_stock = 0）
       ├─ 扣减 current_stock
       └─ 导出 data/<id>.json / data/<id>.csv
```

仓库模块提供独立 API 与前端视图，但共享同一个 SQLite 文件和 `shared` 类型。

## 5. 消耗与撤销流程

### 5.1 提交消耗

在单个 SQLite 事务中：

1. 生成 `submissionId`。
2. 写入 `submissions`。
3. 对每条图例写入 `consumption_lines`。
4. 若 `inventory_items` 不存在对应 `bead_id`，先插入默认记录（`current_stock = 0`、`min_stock = 0`、空颜色）。
5. 将每条记录的 `current_stock` 减去 `count`，允许结果为负。

### 5.2 撤销提交

1. 校验提交存在且 `reverted_at` 为空，否则返回冲突错误。
2. 在事务中将 `submissions.reverted_at` 设为当前时间。
3. 按 `consumption_lines` 把对应 `count` 加回 `inventory_items.current_stock`。

重复撤销必须被拒绝。

## 6. API 定义

```http
GET /api/inventory
  查询: search? 可选，按编号模糊匹配
  响应: InventorySummary[]

PUT /api/inventory/:id
  请求: InventoryItemInput
  响应: InventorySummary
  说明: upsert；不存在时创建，存在时更新。创建时编号来自路径参数。

DELETE /api/inventory/:id
  响应: 204
  说明: 仅当该编号没有历史消耗流水时允许删除；否则返回 409。

POST /api/inventory/import
  请求: multipart/form-data（字段 file，CSV）
  响应: { imported: number; skipped: number; errors: string[] }

GET /api/inventory/replenish
  响应: InventorySummary[]（仅 current_stock < min_stock）

GET /api/submissions
  响应: Submission[]

POST /api/submissions/:id/revert
  响应: Submission
```

### CSV 导入格式

表头：`编号,颜色,当前库存,最低库存线,单位,备注,位置,供应商`

示例：

```csv
编号,颜色,当前库存,最低库存线,单位,备注,位置,供应商
A10,"254,169,72",500,100,颗,,1号盒,
B03,"30,60,120",80,50,颗,,2号盒,
```

重复编号按「更新当前库存与字段」处理；非法行跳过并计入 `errors`。

## 7. 前端设计

### 7.1 仓库台账视图

- 表格展示：颜色、编号、当前库存、最低库存线、缺口、累计消耗、备注、位置、供应商。
- 顶部工具栏：新增、CSV 导入、搜索、切换到待补充视图。
- 新增/编辑使用表单弹窗；编号在编辑时只读，新增时必填。
- 删除需二次确认；若编号已有消耗流水，后端返回 409，前端提示先将库存归零而不是删除。

### 7.2 待补充视图

- 展示 `current_stock < min_stock` 的编号、当前库存、最低库存线、缺口。
- 按缺口降序排列。

### 7.3 提交记录视图

- 展示提交 ID、图纸名、时间、明细行和撤销状态。
- 未撤销的提交提供「撤销回补」按钮，需二次确认。

### 7.4 与识别流程联动

提交成功后刷新仓库台账和待补充数据；上传识别主界面保持不变。

## 8. 错误处理与校验

- 库存、最低库存线、数量必须为非负整数。
- 编号必须为字符串，保留大小写与前导零；新增时禁止空编号。
- 撤销不存在的提交 → 404；重复撤销 → 409。
- CSV 文件为空、表头缺失或全部行非法 → 返回错误。
- SQLite 事务失败时整体回滚，前端显示失败原因。

## 9. 测试策略

- 单元测试：
  - 仓库仓库层：自动创建缺失编号、扣减/回补、重复撤销拒绝。
  - 待补充查询：阈值边界（等于阈值不算待补充）。
  - CSV 导入解析：重复编号更新、非法行跳过。
- 集成测试：
  - `POST /api/submit` 后库存正确扣减，`POST /api/submissions/:id/revert` 后库存回补。
- 前端测试：
  - 台账增删改、CSV 导入、待补充展示、提交记录撤销链路（Playwright）。

## 10. 目录结构增量

```text
backend/src/
  storage/
    db.ts                 # SQLite 初始化与连接
    warehouse-store.ts    # 库存/流水/待补充逻辑
  api/
    inventory.ts
    submissions.ts
frontend/src/
  views/
    InventoryView.vue
    SubmissionsView.vue
  components/
    InventoryTable.vue
    InventoryForm.vue
    ReplenishPanel.vue
```

## 11. 假设与边界

1. v1 为本地单用户，SQLite 文件存放在 `data/warehouse.sqlite`。
2. 编号作为字符串原样保留，与识别结果使用同一规范。
3. 颜色字段先存 RGB 字符串（如 `254,169,72`），展示时渲染为色块。
4. 删除台账编号时，历史消耗流水保留以保证可审计。
5. 当前工作目录没有 git 仓库，本 spec 未随 git 提交。

## 12. 未来扩展

- 按历史消耗速率预测缺货。
- 采购单、供应商对账与成本核算。
- 移动端 / 微信小程序访问：复用 API-first 后端，需补充公网部署、HTTPS、登录与多用户隔离（见识别 spec `14.2`）。
