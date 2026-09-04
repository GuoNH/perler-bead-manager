<script setup lang="ts">
import { computed } from "vue";
import type { LegendItem, Warning } from "@pinpin/shared";
import { useRecognitionStore } from "../stores/recognition.js";

const store = useRecognitionStore();
const legend = computed(() => store.result?.legend ?? []);
const warnings = computed(() => store.result?.warnings ?? []);

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
    <div v-if="warnings.length" class="warnings" data-testid="warnings">
      <p v-for="(w, i) in warnings" :key="i" class="warning" :class="w.level" data-testid="warning">
        {{ w.message }}
      </p>
    </div>
    <div class="row header"><span>颜色</span><span>编号</span><span>数量</span><span></span></div>
    <div v-for="(item, i) in legend" :key="i" class="row" :class="{ suspect: isSuspect(item) }">
      <input type="color" :value="toHex(item)" @input="onColor(item, $event)" />
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
</style>
