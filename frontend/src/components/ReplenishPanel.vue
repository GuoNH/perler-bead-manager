<script setup lang="ts">
import { computed } from "vue";
import type { InventorySummary } from "@pinpin/shared";

const props = defineProps<{ items: InventorySummary[] }>();
const sorted = computed(() => [...props.items].sort((a, b) => b.deficit - a.deficit));

function cssColor(value: string) {
  const parts = value.split(",").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "transparent";
  return `rgb(${parts[0]},${parts[1]},${parts[2]})`;
}
</script>

<template>
  <section class="replenish section-card" :class="{ urgent: sorted.length }">
    <div class="section-heading replenish-heading">
      <div class="replenish-title">
        <span class="replenish-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 4 3.5 19h17L12 4Z" />
            <path d="M12 9v4M12 16.2v.1" />
          </svg>
        </span>
        <div>
          <h2>待补充</h2>
          <p v-if="sorted.length">以下色号已低于最低库存线，缺口按当前提交后的库存计算。</p>
          <p v-else>所有色号都高于最低库存线，暂无补充任务。</p>
        </div>
      </div>
      <span class="badge" :class="sorted.length ? 'warning' : 'success'">
        {{ sorted.length ? `${sorted.length} 个待处理` : "库存健康" }}
      </span>
    </div>

    <div v-if="sorted.length" class="replenish-list">
      <article v-for="row in sorted" :key="row.id" class="replenish-item">
        <span class="replenish-swatch" :style="{ background: cssColor(row.color) }"></span>
        <div class="replenish-meta">
          <strong>{{ row.id }}</strong>
          <span v-if="row.location">{{ row.location }}</span>
          <span v-else>未设置存放位置</span>
        </div>
        <div class="stock-numbers">
          <span><strong>{{ row.currentStock }}</strong> 当前</span>
          <i></i>
          <span><strong>{{ row.minStock }}</strong> 最低</span>
        </div>
        <div class="deficit-chip">缺 {{ row.deficit }}</div>
      </article>
    </div>

    <div v-else class="healthy-state">
      <span class="healthy-check" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-8" /></svg>
      </span>
      <div>
        <strong>暂无待补充编号</strong>
        <p>库存水位稳定，可以继续上传下一张图纸。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.replenish {
  padding: 22px 24px;
}

.replenish.urgent {
  border-color: #e8d4ae;
  background: linear-gradient(135deg, #fffdf8 0%, #fffbf1 100%);
}

.replenish-heading {
  align-items: center;
  margin-bottom: 17px;
}

.replenish-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.replenish-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  color: #93631b;
  border-radius: 13px;
  background: var(--amber-soft);
}

.replenish-icon svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.replenish-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.replenish-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid #ecdbb9;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.8);
}

.replenish-swatch {
  width: 32px;
  height: 32px;
  border: 3px solid #fff;
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(47, 40, 31, 0.14);
}

.replenish-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.replenish-meta strong {
  font-size: 13px;
}

.replenish-meta span {
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stock-numbers {
  grid-column: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 9px;
}

.stock-numbers strong {
  color: var(--ink-soft);
  font-size: 11px;
}

.stock-numbers i {
  width: 1px;
  height: 10px;
  background: var(--line);
}

.deficit-chip {
  grid-row: 1 / 3;
  grid-column: 3;
  padding: 5px 8px;
  color: #8d611b;
  font-size: 10px;
  font-weight: 750;
  border-radius: 8px;
  background: var(--amber-soft);
}

.healthy-state {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  color: #416f5e;
  border: 1px solid #c9e0d7;
  border-radius: 14px;
  background: var(--mint-soft);
}

.healthy-check {
  display: grid;
  width: 38px;
  height: 38px;
  flex: none;
  place-items: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
}

.healthy-check svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.healthy-state strong {
  font-size: 12px;
}

.healthy-state p {
  margin: 3px 0 0;
  color: #5c7d70;
  font-size: 10px;
}

@media (max-width: 1160px) {
  .replenish-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .replenish {
    padding: 18px;
  }

  .replenish-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .replenish-list {
    grid-template-columns: 1fr;
  }
}
</style>
