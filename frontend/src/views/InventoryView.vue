<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { InventorySummary } from "@pinpin/shared";
import InventoryTable from "../components/InventoryTable.vue";
import InventoryForm from "../components/InventoryForm.vue";
import ReplenishPanel from "../components/ReplenishPanel.vue";
import { useWarehouseStore } from "../stores/warehouse.js";
import { importInventory } from "../api/warehouse.js";

const store = useWarehouseStore();
const showForm = ref(false);
const editing = ref<InventorySummary | null>(null);
const csvInput = ref<HTMLInputElement | null>(null);
onMounted(() => store.refresh());

function openNew() {
  editing.value = null;
  showForm.value = true;
}
function openEdit(item: InventorySummary) {
  editing.value = item;
  showForm.value = true;
}
function closeForm() {
  showForm.value = false;
  editing.value = null;
}

async function onCsv(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const result = await importInventory(file);
  await store.refresh();
  alert(`导入 ${result.imported} 条，跳过 ${result.skipped} 条`);
}
</script>

<template>
  <main class="inventory">
    <header>
      <h1>仓库台账</h1>
      <button @click="openNew">新增</button>
      <button @click="csvInput?.click()">CSV 导入</button>
      <input ref="csvInput" type="file" accept=".csv" hidden @change="onCsv" />
    </header>
    <ReplenishPanel :items="store.replenish" />
    <InventoryTable :items="store.items" @edit="openEdit" />
    <InventoryForm v-if="showForm" :initial="editing ?? undefined" @close="closeForm" @saved="store.refresh(); closeForm()" />
  </main>
</template>
