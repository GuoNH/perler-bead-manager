<script setup lang="ts">
import { computed, ref } from "vue";
import LegendPanel from "../components/LegendPanel.vue";
import SummaryBar from "../components/SummaryBar.vue";
import { useRecognitionStore } from "../stores/recognition.js";

const store = useRecognitionStore();
const input = ref<HTMLInputElement | null>(null);
const hasError = computed(() =>
  store.result?.warnings.some((w) => w.level === "error") ?? false,
);

function onFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (file) void store.recognize(file);
}
</script>

<template>
  <main class="upload">
    <section class="drop" @click="input?.click()" @dragover.prevent @drop.prevent="onFile">
      <input ref="input" type="file" accept="image/*" hidden @change="onFile" />
      <img v-if="store.previewUrl" :src="store.previewUrl" alt="图纸预览" />
      <p v-else>点击或拖拽上传拼豆图纸</p>
    </section>
    <p v-if="store.error" class="error">{{ store.error }}</p>
    <p v-if="store.loading">识别中...</p>
    <LegendPanel v-if="store.result" />
    <SummaryBar v-if="store.result" />
    <button v-if="store.result" :disabled="hasError || !store.result.legend.length" @click="store.submit()">
      提交
    </button>
  </main>
</template>
