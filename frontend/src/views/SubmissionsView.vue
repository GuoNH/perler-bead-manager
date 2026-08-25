<script setup lang="ts">
import { onMounted } from "vue";
import { revertSubmission } from "../api/warehouse.js";
import { useWarehouseStore } from "../stores/warehouse.js";
const store = useWarehouseStore();
onMounted(() => store.refresh());
async function revert(id: string) {
  await revertSubmission(id);
  await store.refresh();
}
</script>

<template>
  <main class="submissions">
    <h1>提交记录</h1>
    <section v-for="s in store.submissions" :key="s.id" class="submission">
      <p>{{ s.imageName }} · {{ s.createdAt }} · {{ s.revertedAt ? "已撤销" : "未撤销" }}</p>
      <ul>
        <li v-for="l in s.lines" :key="l.beadId">{{ l.beadId }} x {{ l.count }}</li>
      </ul>
      <button v-if="!s.revertedAt" @click="revert(s.id)">撤销回补</button>
    </section>
  </main>
</template>
