<script setup lang="ts">
import { reactive } from "vue";
import type { InventoryItemInput, InventorySummary } from "@pinpin/shared";
import { upsertInventory } from "../api/warehouse.js";

const props = defineProps<{ initial?: InventorySummary }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const form = reactive({
  id: props.initial?.id ?? "",
  color: props.initial?.color ?? "",
  currentStock: props.initial?.currentStock ?? 0,
  minStock: props.initial?.minStock ?? 0,
  unit: props.initial?.unit ?? "颗",
  note: props.initial?.note ?? "",
  location: props.initial?.location ?? "",
  supplier: props.initial?.supplier ?? "",
});

async function save() {
  const input: InventoryItemInput = {
    color: form.color,
    currentStock: form.currentStock,
    minStock: form.minStock,
    unit: form.unit,
    note: form.note,
    location: form.location,
    supplier: form.supplier,
  };
  await upsertInventory(form.id, input);
  emit("saved");
}
</script>

<template>
  <div class="modal">
    <form @submit.prevent="save">
      <label>编号 <input v-model="form.id" :readonly="!!initial" /></label>
      <label>颜色 <input v-model="form.color" placeholder="r,g,b" /></label>
      <label>当前库存 <input v-model.number="form.currentStock" type="number" min="0" /></label>
      <label>最低库存线 <input v-model.number="form.minStock" type="number" min="0" /></label>
      <label>单位 <input v-model="form.unit" /></label>
      <label>备注 <input v-model="form.note" /></label>
      <label>位置 <input v-model="form.location" /></label>
      <label>供应商 <input v-model="form.supplier" /></label>
      <button type="submit">保存</button>
      <button type="button" @click="$emit('close')">取消</button>
    </form>
  </div>
</template>
