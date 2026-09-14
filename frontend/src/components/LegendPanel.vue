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
    <div v-if="warnings.length" class="warnings" data-testid="warnings">
      <p v-for="(w, i) in warnings" :key="i" class="warning" :class="w.level" data-testid="warning">
        {{ w.message }}
      </p>
    </div>
    <div v-if="failedCells.length" class="failed" data-testid="failed-cells">
      <h4>识别失败，请对照原图补录（{{ failedCells.length }}）</h4>
      <div v-for="(c, i) in drafts" :key="cellKey(c)" class="failed-cell" data-testid="failed-cell">
        <span class="swatch" :style="{ background: toHex(c.rgb) }" :title="toHex(c.rgb)"></span>
        <span class="meta">第 {{ c.row }} 行第 {{ c.col }} 个</span>
        <span class="hint">{{ c.text ? `OCR：${c.text}` : "无 OCR 文本" }}</span>
        <input v-model="c.id" placeholder="编号，如 G20" data-testid="failed-id" />
        <input v-model.number="c.count" type="number" min="0" placeholder="数量" data-testid="failed-count" />
        <button :disabled="!c.id.trim() || isAdded(c)" data-testid="failed-add" @click="addFailedCell(c)">
          {{ isAdded(c) ? "已补录" : "补录" }}
        </button>
      </div>
    </div>
    <div class="row header"><span>颜色</span><span>编号</span><span>数量</span><span></span></div>
    <div v-for="(item, i) in legend" :key="i" class="row" :class="{ suspect: isSuspect(item) }">
      <input type="color" :value="toHex(item.rgb)" @input="onColor(item, $event)" />
      <input v-model="item.id" />
      <input v-model.number="item.count" type="number" min="0" />
      <button @click="remove(i)">删除</button>
    </div>
    <button @click="add">新增</button>
  </section>
</template>

<style scoped>
.warnings {
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}
.warning {
  margin: 4px 0;
  padding: 6px 10px;
  border: 1px solid;
  border-radius: 6px;
  font-size: 13px;
}
.warning.warn {
  background: #fff7dd;
  border-color: #e6b84c;
  color: #7a5b08;
}
.warning.error {
  background: #fdeaea;
  border-color: #d96666;
  color: #8a1f1f;
}
.row.suspect input {
  outline: 2px solid #e6b84c;
  outline-offset: -2px;
  background: #fff7dd;
}
.failed {
  margin: 0 0 12px;
  padding: 10px;
  border: 1px dashed #d96666;
  border-radius: 8px;
  background: #fffaf7;
}
.failed h4 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #8a1f1f;
}
.failed-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  flex-wrap: wrap;
}
.failed-cell .swatch {
  width: 26px;
  height: 26px;
  border: 1px solid #ccc;
  border-radius: 4px;
  flex: none;
}
.failed-cell .meta {
  font-weight: 600;
  white-space: nowrap;
}
.failed-cell .hint {
  color: #999;
  font-size: 12px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.failed-cell input {
  width: 110px;
}
.failed-cell input[type="number"] {
  width: 80px;
}
.failed-cell button:disabled {
  opacity: 0.6;
}
</style>
