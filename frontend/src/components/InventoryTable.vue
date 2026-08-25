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
