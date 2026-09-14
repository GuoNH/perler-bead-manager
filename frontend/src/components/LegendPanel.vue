<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { LegendItem, Warning } from "@pinpin/shared";
import { useRecognitionStore } from "../stores/recognition.js";

const store = useRecognitionStore();
const legend = computed(() => store.result?.legend ?? []);
/** 普通提示条：识别失败的格子单独用「待补录」卡片呈现，避免重复。 */
const warnings = computed(() =>
  (store.result?.warnings ?? []).filter((w) => !/图例(识别失败|OCR 失败)/.test(w.message)),
);
const failedCells = computed(() => store.result?.failedCells ?? []);

interface CellDraft {
  row: number;
  col: number;
  rgb: { r: number; g: number; b: number };
  text: string;
  id: string;
  count: number | null;
}
const drafts = ref<CellDraft[]>([]);
const addedKeys = ref<Set<string>>(new Set());
watch(
  failedCells,
  (cells) => {
    drafts.value = cells.map((c) => ({ ...c, id: "", count: null }));
    addedKeys.value = new Set();
  },
  { immediate: true },
);

function cellKey(c: { row: number; col: number }) {
  return `${c.row}-${c.col}`;
}
function isAdded(c: CellDraft) {
  return addedKeys.value.has(cellKey(c));
}
function addFailedCell(c: CellDraft) {
  const id = c.id.trim().toUpperCase();
  if (!id || isAdded(c)) return;
  const n = Number(c.count);
  const count = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  store.updateLegend([...legend.value, { id, rgb: { ...c.rgb }, count }]);
  addedKeys.value.add(cellKey(c));
}

/** 从警告文本里提取被点名的编号（如「编号 E4 …」→ E4），用于高亮对应行。 */
function mentionedIds(warning: Warning): string[] {
  const ids: string[] = [];
  for (const m of warning.message.matchAll(/编号\s*([A-Za-z0-9]+)/g)) {
    ids.push(m[1]);
  }
  return ids;
}
function isSuspect(item: LegendItem): boolean {
  const id = item.id.trim().toUpperCase();
  return warnings.value.some((w) => mentionedIds(w).some((m) => m.toUpperCase() === id));
}
function toHex(rgb: { r: number; g: number; b: number }) {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}
function fromHex(item: LegendItem, hex: string) {
  item.rgb.r = parseInt(hex.slice(1, 3), 16);
  item.rgb.g = parseInt(hex.slice(3, 5), 16);
  item.rgb.b = parseInt(hex.slice(5, 7), 16);
}
function onColor(item: LegendItem, ev: Event) {
  fromHex(item, (ev.target as HTMLInputElement).value);
  store.updateLegend([...legend.value]);
}
function remove(index: number) {
  store.updateLegend(legend.value.filter((_, i) => i !== index));
}
function add() {
  store.updateLegend([...legend.value, { id: "", rgb: { r: 231, g: 96, b: 72 }, count: 0 }]);
}
</script>

<template>
  <section class="legend section-card">
    <div class="section-heading legend-heading">
      <div>
        <span class="eyebrow">VERIFY</span>
        <h2>图例校对</h2>
        <p>逐项检查编号、颜色与数量，提交前仍可新增或删除条目。</p>
      </div>
      <span class="badge accent">{{ legend.length }} 个色号</span>
    </div>

    <div v-if="warnings.length" class="warnings" data-testid="warnings">
      <article
        v-for="(w, i) in warnings"
        :key="i"
        class="warning-item"
        :class="w.level"
        data-testid="warning"
      >
        <span class="warning-icon" aria-hidden="true">
          <svg v-if="w.level === 'info'" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 11v5M12 8v.1" />
          </svg>
          <svg v-else viewBox="0 0 24 24">
            <path d="M12 4 3.5 19h17L12 4Z" />
            <path d="M12 9v4M12 16.2v.1" />
          </svg>
        </span>
        <div>
          <strong>{{ w.level === "error" ? "识别错误" : w.level === "warn" ? "需要核对" : "识别提示" }}</strong>
          <p>{{ w.message }}</p>
        </div>
      </article>
    </div>

    <section v-if="failedCells.length" class="failed" data-testid="failed-cells">
      <header class="failed-header">
        <div>
          <span class="badge danger">待补录</span>
          <h3>识别失败，请对照原图补录 <span>（{{ failedCells.length }}）</span></h3>
          <p>填写正确编号与数量后，该色块会加入下方图例。</p>
        </div>
      </header>
      <div class="failed-list">
        <article v-for="c in drafts" :key="cellKey(c)" class="failed-cell" data-testid="failed-cell">
          <span class="swatch large" :style="{ background: toHex(c.rgb) }" :title="toHex(c.rgb)"></span>
          <div class="failed-meta">
            <strong>第 {{ c.row }} 行 · 第 {{ c.col }} 个</strong>
            <span>{{ c.text ? `OCR：${c.text}` : "无 OCR 文本" }}</span>
          </div>
          <label class="compact-field">
            <span class="sr-only">补录编号</span>
            <input v-model="c.id" placeholder="编号，如 G20" data-testid="failed-id" />
          </label>
          <label class="compact-field count-field">
            <span class="sr-only">补录数量</span>
            <input v-model.number="c.count" type="number" min="0" placeholder="数量" data-testid="failed-count" />
          </label>
          <button
            class="btn btn-soft"
            :disabled="!c.id.trim() || isAdded(c)"
            data-testid="failed-add"
            @click="addFailedCell(c)"
          >
            {{ isAdded(c) ? "已补录" : "补录" }}
          </button>
        </article>
      </div>
    </section>

    <div v-if="legend.length" class="legend-table">
      <div class="legend-row legend-table-head" aria-hidden="true">
        <span>颜色</span>
        <span>编号</span>
        <span>数量</span>
        <span class="action-column">操作</span>
      </div>
      <div
        v-for="(item, i) in legend"
        :key="i"
        class="legend-row"
        :class="{ suspect: isSuspect(item) }"
      >
        <label class="color-field">
          <span class="swatch" :style="{ background: toHex(item.rgb) }"></span>
          <span class="sr-only">选择颜色</span>
          <input type="color" :value="toHex(item.rgb)" @input="onColor(item, $event)" />
        </label>
        <label class="table-field id-field">
          <span class="mobile-label">编号</span>
          <input v-model="item.id" aria-label="编号" placeholder="如 A10" />
          <span v-if="isSuspect(item)" class="suspect-label">待核对</span>
        </label>
        <label class="table-field">
          <span class="mobile-label">数量</span>
          <input v-model.number="item.count" aria-label="数量" type="number" min="0" />
        </label>
        <button class="btn btn-ghost delete-button" type="button" aria-label="删除图例" @click="remove(i)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14M9 7V5h6v2M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" />
          </svg>
          <span>删除</span>
        </button>
      </div>
    </div>

    <div v-else class="empty-state compact">
      <div>
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
            <path d="m4 12 8 3.5 8-3.5" />
          </svg>
        </div>
        <h3>还没有图例条目</h3>
        <p>可以手动新增一个色号，再填写编号、颜色和数量。</p>
      </div>
    </div>

    <footer class="legend-footer">
      <button class="btn btn-soft" type="button" @click="add">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        新增图例条目
      </button>
      <span>提示：颜色可直接点击色块修改。</span>
    </footer>
  </section>
</template>

<style scoped>
.legend {
  padding: 25px;
}

.legend-heading {
  margin-bottom: 22px;
}

.warnings {
  display: grid;
  gap: 9px;
  margin-bottom: 18px;
}

.warning-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 11px;
  padding: 12px 13px;
  color: #73531b;
  border: 1px solid #ecd5a8;
  border-radius: 13px;
  background: var(--amber-soft);
}

.warning-item.info {
  color: #4d678f;
  border-color: #cedaea;
  background: var(--blue-soft);
}

.warning-item.error {
  color: #8e3d38;
  border-color: #edc4c1;
  background: var(--danger-soft);
}

.warning-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.58);
}

.warning-icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.warning-item strong {
  display: block;
  margin-top: 1px;
  font-size: 12px;
}

.warning-item p {
  margin: 3px 0 0;
  font-size: 11px;
  line-height: 1.55;
}

.failed {
  margin-bottom: 19px;
  padding: 17px;
  border: 1px solid #edc4c1;
  border-radius: 17px;
  background: #fff8f6;
}

.failed-header {
  margin-bottom: 13px;
}

.failed-header .badge {
  margin-bottom: 8px;
}

.failed-header h3 {
  margin: 0;
  font-size: 14px;
}

.failed-header h3 span {
  color: var(--danger);
}

.failed-header p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 11px;
}

.failed-list {
  display: grid;
  gap: 8px;
}

.failed-cell {
  display: grid;
  grid-template-columns: 38px minmax(150px, 1fr) minmax(130px, 0.9fr) 94px auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #f0d8d4;
  border-radius: 13px;
  background: #fff;
}

.swatch {
  display: inline-block;
  width: 23px;
  height: 23px;
  flex: none;
  border: 2px solid #fff;
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(47, 40, 31, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.swatch.large {
  width: 38px;
  height: 38px;
  border-radius: 11px;
}

.failed-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.failed-meta strong {
  font-size: 12px;
}

.failed-meta span {
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-field input,
.table-field input {
  width: 100%;
  height: 39px;
  padding: 0 11px;
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}

.compact-field input:focus,
.table-field input:focus {
  border-color: rgba(231, 96, 72, 0.6);
  outline: none;
  box-shadow: 0 0 0 3px rgba(231, 96, 72, 0.1);
}

.failed-cell .btn {
  min-height: 39px;
  padding-inline: 14px;
}

.legend-table {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 15px;
}

.legend-row {
  display: grid;
  grid-template-columns: 76px minmax(150px, 1fr) 150px 86px;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 9px 12px;
  border-top: 1px solid var(--line);
  background: #fff;
  transition: background 160ms ease;
}

.legend-row:not(.legend-table-head):hover {
  background: #fdfbf6;
}

.legend-table-head {
  min-height: 38px;
  padding-block: 0;
  color: var(--muted);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.05em;
  border-top: 0;
  background: var(--surface-soft);
}

.legend-row.suspect {
  background: #fffbf0;
}

.legend-row.suspect input {
  border-color: #dfb75c;
  background: #fffdf6;
}

.color-field {
  position: relative;
  display: flex;
  width: 42px;
  height: 38px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.color-field input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.table-field {
  position: relative;
  display: block;
}

.id-field {
  padding-right: 62px;
}

.suspect-label {
  position: absolute;
  top: 50%;
  right: 8px;
  padding: 3px 6px;
  color: #8d611b;
  font-size: 9px;
  font-weight: 750;
  border-radius: 6px;
  background: var(--amber-soft);
  transform: translateY(-50%);
}

.mobile-label {
  display: none;
}

.delete-button {
  min-height: 38px;
  padding-inline: 11px;
  color: var(--muted);
}

.delete-button:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-soft);
  box-shadow: none;
}

.delete-button svg {
  width: 17px;
  height: 17px;
}

.legend-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 16px;
}

.legend-footer > span {
  color: var(--muted);
  font-size: 10px;
}

@media (max-width: 760px) {
  .legend {
    padding: 18px;
  }

  .failed-cell {
    grid-template-columns: 38px minmax(0, 1fr) 90px;
  }

  .failed-meta {
    grid-column: 2 / -1;
  }

  .failed-cell .compact-field:first-of-type {
    grid-column: 2;
  }

  .failed-cell .count-field {
    grid-column: 3;
  }

  .failed-cell .btn {
    grid-column: 2 / -1;
  }

  .compact-field input,
  .table-field input,
  .failed-cell .btn {
    min-height: 44px;
  }

  .legend-table {
    overflow: visible;
    border: 0;
  }

  .legend-table-head {
    display: none;
  }

  .legend-row {
    grid-template-columns: 46px minmax(0, 1fr);
    gap: 11px;
    min-height: 0;
    padding: 13px;
    margin-bottom: 9px;
    border: 1px solid var(--line);
    border-radius: 14px;
  }

  .legend-row .color-field {
    grid-row: 1 / 3;
  }

  .legend-row .id-field,
  .legend-row .table-field {
    grid-column: 2;
    padding: 0;
  }

  .legend-row .delete-button {
    grid-column: 2;
    width: fit-content;
    min-height: 40px;
    padding-inline: 10px;
  }

  .mobile-label {
    display: block;
    margin-bottom: 4px;
    color: var(--muted);
    font-size: 9px;
    font-weight: 700;
  }

  .delete-button span {
    display: inline;
  }

  .legend-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .legend-footer .btn {
    width: 100%;
  }
}

@media (max-width: 380px) {
  .legend,
  .failed {
    padding: 14px;
  }

  .failed-cell {
    grid-template-columns: 34px minmax(0, 1fr) 78px;
    gap: 8px;
  }

  .failed-cell .btn {
    min-height: 42px;
  }
}
</style>
