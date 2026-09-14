<script setup lang="ts">
import type { InventorySummary } from "@pinpin/shared";

defineProps<{ items: InventorySummary[]; loading?: boolean }>();
defineEmits<{ edit: [item: InventorySummary] }>();

function cssColor(c: string) {
  if (!c) return "transparent";
  const [r, g, b] = c.split(",").map(Number);
  if (![r, g, b].every(Number.isFinite)) return "transparent";
  return `rgb(${r},${g},${b})`;
}

function stockStatus(row: InventorySummary) {
  if (row.currentStock === 0) return { label: "缺货", className: "danger" };
  if (row.deficit > 0) return { label: "需补充", className: "warning" };
  return { label: "正常", className: "success" };
}
</script>

<template>
  <div v-if="loading" class="table-loading">
    <span class="spinner dark"></span>
    <span>正在读取库存...</span>
  </div>

  <div v-else-if="items.length" class="inventory-table">
    <div class="inventory-table-head" aria-hidden="true">
      <span>颜色</span>
      <span>编号</span>
      <span>当前库存</span>
      <span>最低线</span>
      <span>状态</span>
      <span>累计消耗</span>
      <span>备注</span>
      <span>位置</span>
      <span>供应商</span>
      <span></span>
    </div>
    <article v-for="row in items" :key="row.id" class="inventory-row">
      <div class="table-cell color-cell" data-label="颜色">
        <span class="swatch" :style="{ background: cssColor(row.color) }" :title="row.color || '未设置颜色'"></span>
      </div>
      <div class="table-cell id-cell" data-label="编号">
        <strong>{{ row.id }}</strong>
        <span>{{ row.unit || "颗" }}</span>
      </div>
      <div class="table-cell number-cell" data-label="当前库存">
        <strong>{{ row.currentStock }}</strong>
        <span>现有</span>
      </div>
      <div class="table-cell number-cell" data-label="最低线">
        <strong>{{ row.minStock }}</strong>
        <span>安全线</span>
      </div>
      <div class="table-cell status-cell" data-label="状态">
        <span class="badge" :class="stockStatus(row).className">{{ stockStatus(row).label }}</span>
        <small v-if="row.deficit">缺 {{ row.deficit }}</small>
      </div>
      <div class="table-cell number-cell" data-label="累计消耗">
        <strong>{{ row.cumulativeConsumed }}</strong>
        <span>已使用</span>
      </div>
      <div class="table-cell text-cell" data-label="备注">
        <span>{{ row.note || "—" }}</span>
      </div>
      <div class="table-cell text-cell" data-label="位置">
        <span>{{ row.location || "—" }}</span>
      </div>
      <div class="table-cell text-cell" data-label="供应商">
        <span>{{ row.supplier || "—" }}</span>
      </div>
      <div class="table-cell edit-cell">
        <button class="row-action" type="button" aria-label="编辑库存条目" @click="$emit('edit', row)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
          </svg>
          <span>编辑</span>
        </button>
      </div>
    </article>
  </div>

  <div v-else class="empty-state">
    <div>
      <div class="empty-state-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
          <path d="m4 12 8 3.5 8-3.5M4 16.5 12 20l8-3.5" />
        </svg>
      </div>
      <h3>没有找到库存记录</h3>
      <p>调整搜索关键词，或点击“新增色号”建立第一条库存档案。</p>
    </div>
  </div>
</template>

<style scoped>
.table-loading {
  display: flex;
  min-height: 190px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--muted);
  font-size: 12px;
}

.inventory-table {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 15px;
}

.inventory-table-head,
.inventory-row {
  display: grid;
  grid-template-columns: 52px minmax(78px, 0.78fr) minmax(92px, 0.9fr) 82px 92px 92px minmax(110px, 1.2fr) minmax(100px, 1fr) minmax(105px, 1fr) 76px;
  align-items: center;
  gap: 9px;
}

.inventory-table-head {
  min-height: 40px;
  padding: 0 12px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.04em;
  background: var(--surface-soft);
}

.inventory-row {
  min-height: 67px;
  padding: 10px 12px;
  border-top: 1px solid var(--line);
  background: #fff;
  transition: background 150ms ease;
}

.inventory-row:hover {
  background: #fdfbf6;
}

.table-cell {
  min-width: 0;
}

.color-cell {
  display: flex;
  align-items: center;
}

.swatch {
  width: 29px;
  height: 29px;
  border: 3px solid #fff;
  border-radius: 9px;
  box-shadow: 0 0 0 1px rgba(47, 40, 31, 0.15);
}

.id-cell,
.number-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.id-cell strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.id-cell span,
.number-cell span {
  color: var(--muted);
  font-size: 9px;
}

.number-cell strong {
  font-size: 13px;
}

.status-cell {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 4px;
}

.status-cell .badge {
  min-height: 23px;
  padding-inline: 8px;
}

.status-cell small {
  color: var(--danger);
  font-size: 9px;
  font-weight: 700;
}

.text-cell {
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.4;
}

.text-cell span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.edit-cell {
  display: flex;
  justify-content: flex-end;
}

.row-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 34px;
  padding: 0 9px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 680;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
}

.row-action:hover {
  color: var(--accent-deep);
  border-color: #f0c9bf;
  background: var(--accent-soft);
}

.row-action svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 1250px) {
  .inventory-table {
    overflow-x: auto;
  }

  .inventory-table-head,
  .inventory-row {
    min-width: 1030px;
  }
}

@media (max-width: 760px) {
  .inventory-table {
    overflow: visible;
    border: 0;
  }

  .inventory-table-head {
    display: none;
  }

  .inventory-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 13px 16px;
    min-width: 0;
    min-height: 0;
    padding: 16px;
    margin-bottom: 10px;
    border: 1px solid var(--line);
    border-radius: 15px;
  }

  .color-cell {
    grid-column: 1 / -1;
  }

  .swatch {
    width: 35px;
    height: 35px;
    border-radius: 11px;
  }

  .table-cell {
    display: flex;
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }

  .table-cell::before {
    content: attr(data-label);
    color: var(--muted);
    font-size: 9px;
    font-weight: 720;
    letter-spacing: 0.04em;
  }

  .id-cell,
  .number-cell {
    gap: 3px;
  }

  .id-cell {
    grid-column: 1 / -1;
  }

  .id-cell strong {
    font-size: 17px;
  }

  .status-cell {
    gap: 5px;
  }

  .text-cell span {
    -webkit-line-clamp: 3;
  }

  .edit-cell {
    grid-column: 1 / -1;
    justify-content: stretch;
  }

  .row-action {
    width: 100%;
    min-height: 46px;
    justify-content: center;
    color: var(--accent-deep);
    border-color: #f0c9bf;
    background: var(--accent-soft);
  }
}

@media (max-width: 380px) {
  .inventory-row {
    gap: 12px;
    padding: 14px;
  }
}
</style>
