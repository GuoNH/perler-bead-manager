<script setup lang="ts">
import { computed } from "vue";
import { useRecognitionStore } from "../stores/recognition.js";
const store = useRecognitionStore();
const total = computed(() =>
  store.result?.legend.reduce((sum, item) => sum + item.count, 0) ?? 0,
);
</script>

<template>
  <p class="summary">总数：{{ total }}，色种数：{{ store.result?.legend.length ?? 0 }}</p>
</template>
