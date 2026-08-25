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
