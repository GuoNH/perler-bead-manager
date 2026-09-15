<script setup lang="ts">
import { computed } from "vue";
import { useRecognitionStore } from "../stores/recognition.js";

const store = useRecognitionStore();
const emit = defineEmits<{
  scrollToWarnings: [];
  scrollToFailed: [];
}>();

const total = computed(() =>
  store.result?.legend.reduce((sum, item) => sum + Number(item.count || 0), 0) ?? 0,
);
const warningCount = computed(() => store.result?.warnings.length ?? 0);
const failedCount = computed(() => store.result?.failedCells.length ?? 0);
</script>

<template>
  <div class="metric-grid recognition-metrics">
    <article class="metric-card">
      <span class="metric-label">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M8 12h8M12 8v8" />
        </svg>
        预计总数
      </span>
      <strong class="metric-value">{{ total.toLocaleString() }}</strong>
      <span class="metric-hint">所有图例数量合计</span>
    </article>
    <article class="metric-card">
      <span class="metric-label">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
          <path d="m4 12 8 3.5 8-3.5" />
        </svg>
        颜色种类
      </span>
      <strong class="metric-value">{{ store.result?.legend.length ?? 0 }}</strong>
      <span class="metric-hint">需要匹配的拼豆色号</span>
    </article>
    <button
      class="metric-card scroll-card"
      :class="{ 'has-warnings': warningCount > 0 }"
      type="button"
      :disabled="warningCount === 0"
      @click="emit('scrollToWarnings')"
    >
      <span class="metric-label">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4 3.5 19h17L12 4Z" />
          <path d="M12 9v4M12 16.2v.1" />
        </svg>
        识别提示
      </span>
      <strong class="metric-value">{{ warningCount }}</strong>
      <span class="metric-hint">低置信度或 OCR 告警</span>
    </button>
    <button
      class="metric-card scroll-card"
      :class="{ 'has-failed': failedCount > 0 }"
      type="button"
      :disabled="failedCount === 0"
      @click="emit('scrollToFailed')"
    >
      <span class="metric-label">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 5h14v14H5zM9 9h6v6H9z" />
        </svg>
        待补录色块
      </span>
      <strong class="metric-value">{{ failedCount }}</strong>
      <span class="metric-hint">{{ failedCount ? "请对照原图补充编号" : "没有遗漏的图例" }}</span>
    </button>
  </div>
</template>

<style scoped>
.recognition-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric-card:nth-child(1) { --metric-halo: rgba(231, 96, 72, 0.1); }
.metric-card:nth-child(2) { --metric-halo: rgba(95, 127, 174, 0.11); }

.scroll-card {
  all: unset;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 16px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  cursor: default;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
  font-family: inherit;
  text-align: left;
  --metric-halo: transparent;
  --halo: transparent;
  background-image: radial-gradient(circle at 0 0, var(--metric-halo) 0%, transparent 50%);
  background-repeat: no-repeat;
}

.scroll-card:not(:disabled) {
  cursor: pointer;
}

.scroll-card:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(47, 40, 31, 0.1);
}

.scroll-card:not(:disabled):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.scroll-card.has-warnings {
  --metric-halo: rgba(198, 139, 47, 0.14);
}

.scroll-card.has-failed {
  --metric-halo: rgba(189, 78, 72, 0.12);
}

.scroll-card:disabled {
  opacity: 0.55;
}

.metric-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.metric-label svg {
  width: 15px;
  height: 15px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.metric-value {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
}

.metric-hint {
  font-size: 10px;
  color: var(--muted);
}

@media (max-width: 1080px) {
  .recognition-metrics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .recognition-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>