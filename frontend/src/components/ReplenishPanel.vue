<script setup lang="ts">
import { computed } from "vue";
import type { InventorySummary } from "@pinpin/shared";

const props = defineProps<{ items: InventorySummary[] }>();
const sorted = computed(() => [...props.items].sort((a, b) => b.deficit - a.deficit));
</script>

<template>
  <section class="replenish">
    <h2>待补充</h2>
    <ul>
      <li v-for="row in sorted" :key="row.id">
        {{ row.id }}：当前 {{ row.currentStock }}，最低 {{ row.minStock }}，缺口 {{ row.deficit }}
      </li>
      <li v-if="sorted.length === 0">无待补充编号</li>
    </ul>
  </section>
</template>
