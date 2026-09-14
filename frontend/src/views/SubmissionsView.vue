<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Submission } from "@pinpin/shared";
import { revertSubmission } from "../api/warehouse.js";
import { useWarehouseStore } from "../stores/warehouse.js";

type Filter = "all" | "active" | "reverted";
const store = useWarehouseStore();
const filter = ref<Filter>("all");
const revertingId = ref("");
const confirmingId = ref("");
const notice = ref<{ type: "success" | "danger"; message: string } | null>(null);

onMounted(() => store.refresh());

const activeCount = computed(() => store.submissions.filter((item) => !item.revertedAt).length);
const revertedCount = computed(() => store.submissions.length - activeCount.value);
const totalConsumed = computed(() =>
  store.submissions
    .filter((item) => !item.revertedAt)
    .reduce((sum, item) => sum + item.lines.reduce((lineSum, line) => lineSum + line.count, 0), 0),
);
const filteredSubmissions = computed(() => {
  if (filter.value === "active") return store.submissions.filter((item) => !item.revertedAt);
  if (filter.value === "reverted") return store.submissions.filter((item) => item.revertedAt);
  return store.submissions;
});

function submissionTotal(item: Submission) {
  return item.lines.reduce((sum, line) => sum + line.count, 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function revert(item: Submission) {
  revertingId.value = item.id;
  notice.value = null;
  try {
    await revertSubmission(item.id);
    await store.refresh();
    confirmingId.value = "";
    notice.value = { type: "success", message: `提交 ${item.id} 已撤销，库存已完成回补。` };
  } catch (err) {
    notice.value = {
      type: "danger",
      message: err instanceof Error ? err.message : "撤销失败",
    };
  } finally {
    revertingId.value = "";
  }
}
</script>

<template>
  <main class="page submissions-page">
    <header class="page-header">
      <div class="page-header-copy">
        <span class="eyebrow">消耗流水</span>
        <h1>提交记录</h1>
        <p>每次确认图纸都会生成一条消耗记录；撤销后将恢复对应库存，并保留完整历史。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" :disabled="store.loading" @click="store.refresh()">
          <span v-if="store.loading" class="spinner dark"></span>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" />
          </svg>
          刷新记录
        </button>
      </div>
    </header>

    <div v-if="notice" class="notice" :class="notice.type" role="status">
      <span class="notice-dot"></span>
      <span>{{ notice.message }}</span>
      <button class="notice-close" type="button" aria-label="关闭提示" @click="notice = null">×</button>
    </div>

    <section class="metric-grid">
      <article class="metric-card">
        <span class="metric-label">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" />
            <path d="M4 4v4.68h4.68M12 7.5V12l3 2" />
          </svg>
          全部提交
        </span>
        <strong class="metric-value">{{ store.submissions.length }}</strong>
        <span class="metric-hint">包含已撤销的历史记录</span>
      </article>
      <article class="metric-card active-card">
        <span class="metric-label">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12 4 4L19 6" />
          </svg>
          生效记录
        </span>
        <strong class="metric-value">{{ activeCount }}</strong>
        <span class="metric-hint">当前已扣减库存的提交</span>
      </article>
      <article class="metric-card consumed-card">
        <span class="metric-label">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
            <path d="m4 12 8 3.5 8-3.5" />
          </svg>
          生效消耗
        </span>
        <strong class="metric-value">{{ totalConsumed.toLocaleString() }}</strong>
        <span class="metric-hint">所有生效记录的数量合计</span>
      </article>
      <article class="metric-card reverted-card">
        <span class="metric-label">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7 4 12l5 5M5 12h9a5 5 0 0 1 5 5v1" />
          </svg>
          已撤销
        </span>
        <strong class="metric-value">{{ revertedCount }}</strong>
        <span class="metric-hint">库存已回补的历史提交</span>
      </article>
    </section>

    <section class="history-section section-card">
      <div class="section-heading history-heading">
        <div>
          <span class="eyebrow">TIMELINE</span>
          <h2>提交时间线</h2>
          <p>按时间倒序排列，展开可查看每次提交涉及的全部色号。</p>
        </div>
        <div class="filter-tabs" role="tablist" aria-label="提交记录筛选">
          <button :class="{ active: filter === 'all' }" type="button" @click="filter = 'all'">
            全部 <span>{{ store.submissions.length }}</span>
          </button>
          <button :class="{ active: filter === 'active' }" type="button" @click="filter = 'active'">
            生效 <span>{{ activeCount }}</span>
          </button>
          <button :class="{ active: filter === 'reverted' }" type="button" @click="filter = 'reverted'">
            已撤销 <span>{{ revertedCount }}</span>
          </button>
        </div>
      </div>

      <div v-if="store.loading && !store.submissions.length" class="history-loading">
        <span class="spinner dark"></span>
        <span>正在读取提交记录...</span>
      </div>

      <div v-else-if="filteredSubmissions.length" class="submission-list">
        <article
          v-for="s in filteredSubmissions"
          :key="s.id"
          class="submission-card"
          :class="{ reverted: s.revertedAt }"
        >
          <div class="timeline-marker" aria-hidden="true">
            <span></span>
          </div>

          <div class="submission-main">
            <header class="submission-header">
              <div class="submission-title">
                <span class="file-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 4h10l4 4v12H5z" />
                    <path d="M15 4v4h4M8 13h8M8 16h5" />
                  </svg>
                </span>
                <div>
                  <h3>{{ s.imageName }}</h3>
                  <p>记录编号 {{ s.id }} · {{ formatDate(s.createdAt) }}</p>
                </div>
              </div>
              <span class="badge" :class="s.revertedAt ? 'neutral' : 'success'">
                {{ s.revertedAt ? "已撤销" : "已扣减库存" }}
              </span>
            </header>

            <div class="line-list">
              <span v-for="line in s.lines" :key="`${s.id}-${line.beadId}`" class="line-chip">
                <strong>{{ line.beadId }}</strong>
                <i>×</i>
                <span>{{ line.count }}</span>
              </span>
            </div>

            <footer class="submission-footer">
              <div class="submission-total">
                <span>本次合计</span>
                <strong>{{ submissionTotal(s).toLocaleString() }} 颗</strong>
                <small>{{ s.lines.length }} 个色号</small>
              </div>

              <div v-if="!s.revertedAt" class="revert-action">
                <template v-if="confirmingId === s.id">
                  <span>撤销后将回补库存，确认继续？</span>
                  <button class="btn btn-ghost" type="button" @click="confirmingId = ''">取消</button>
                  <button class="btn btn-danger" type="button" :disabled="revertingId === s.id" @click="revert(s)">
                    <span v-if="revertingId === s.id" class="spinner dark"></span>
                    {{ revertingId === s.id ? "回补中..." : "确认撤销" }}
                  </button>
                </template>
                <button v-else class="btn btn-ghost" type="button" @click="confirmingId = s.id">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 7 4 12l5 5M5 12h9a5 5 0 0 1 5 5v1" />
                  </svg>
                  撤销回补
                </button>
              </div>
              <div v-else class="reverted-note">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m5 12 4 4L19 6" />
                </svg>
                已于 {{ formatDate(s.revertedAt) }} 回补
              </div>
            </footer>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">
        <div>
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" />
              <path d="M4 4v4.68h4.68M12 7.5V12l3 2" />
            </svg>
          </div>
          <h3>{{ filter === "all" ? "还没有提交记录" : "没有符合条件的记录" }}</h3>
          <p>从“上传识别”完成一次图纸提交后，消耗流水会显示在这里。</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.notice {
  position: relative;
  padding-right: 44px;
}

.notice-close {
  position: absolute;
  top: 50%;
  right: 12px;
  width: 28px;
  height: 28px;
  color: currentColor;
  font-size: 20px;
  line-height: 1;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transform: translateY(-50%);
}

.metric-label svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.metric-card:nth-child(1) { --metric-halo: rgba(95, 127, 174, 0.11); }
.active-card { --metric-halo: rgba(93, 154, 131, 0.12); }
.consumed-card { --metric-halo: rgba(231, 96, 72, 0.1); }
.reverted-card { --metric-halo: rgba(125, 119, 109, 0.1); }

.history-section {
  padding: 25px;
}

.history-heading {
  align-items: center;
  margin-bottom: 23px;
}

.filter-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-soft);
}

.filter-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 11px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 680;
  border: 0;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
}

.filter-tabs button span {
  display: grid;
  min-width: 18px;
  height: 18px;
  padding-inline: 4px;
  place-items: center;
  font-size: 9px;
  border-radius: 6px;
  background: rgba(47, 40, 31, 0.06);
}

.filter-tabs button.active {
  color: var(--ink);
  background: #fff;
  box-shadow: 0 2px 7px rgba(47, 40, 31, 0.08);
}

.history-loading {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--muted);
  font-size: 12px;
}

.submission-list {
  display: grid;
  gap: 13px;
}

.submission-card {
  position: relative;
  display: grid;
  grid-template-columns: 27px minmax(0, 1fr);
  gap: 13px;
}

.timeline-marker {
  position: relative;
  display: flex;
  justify-content: center;
}

.timeline-marker::after {
  position: absolute;
  top: 24px;
  bottom: -19px;
  width: 1px;
  content: "";
  background: var(--line);
}

.submission-card:last-child .timeline-marker::after {
  display: none;
}

.timeline-marker span {
  position: relative;
  z-index: 1;
  width: 11px;
  height: 11px;
  margin-top: 24px;
  border: 3px solid var(--surface);
  border-radius: 99px;
  background: var(--mint);
  box-shadow: 0 0 0 1px #b8d7cb;
}

.submission-card.reverted .timeline-marker span {
  background: var(--muted-light);
  box-shadow: 0 0 0 1px var(--line-strong);
}

.submission-main {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 17px;
  background: #fff;
}

.submission-card.reverted .submission-main {
  background: #fbfaf7;
}

.submission-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 17px 18px;
}

.submission-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
}

.file-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  color: var(--accent);
  border-radius: 12px;
  background: var(--accent-soft);
}

.submission-card.reverted .file-icon {
  color: var(--muted);
  background: var(--surface-strong);
}

.file-icon svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.submission-title h3 {
  overflow: hidden;
  margin: 0;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.submission-title p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 10px;
}

.line-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0 18px 17px;
}

.line-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 29px;
  padding: 0 9px;
  color: var(--ink-soft);
  font-size: 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-soft);
}

.line-chip strong {
  font-size: 11px;
}

.line-chip i {
  color: var(--muted-light);
  font-style: normal;
}

.submission-card.reverted .line-chip {
  color: var(--muted);
}

.submission-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 63px;
  padding: 12px 18px;
  border-top: 1px solid var(--line);
  background: var(--surface-soft);
}

.submission-total {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.submission-total > span,
.submission-total small {
  color: var(--muted);
  font-size: 10px;
}

.submission-total strong {
  color: var(--accent-deep);
  font-size: 15px;
}

.submission-card.reverted .submission-total strong {
  color: var(--muted);
}

.revert-action {
  display: flex;
  align-items: center;
  gap: 7px;
}

.revert-action > span {
  color: var(--danger);
  font-size: 10px;
}

.revert-action .btn {
  min-height: 36px;
  padding-inline: 12px;
}

.reverted-note {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 10px;
}

.reverted-note svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--mint);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 760px) {
  .notice-close {
    right: 6px;
    width: 40px;
    height: 40px;
  }

  .history-section {
    padding: 18px;
  }

  .history-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-tabs {
    width: 100%;
  }

  .filter-tabs button {
    flex: 1;
    justify-content: center;
    min-height: 42px;
  }

  .submission-card {
    grid-template-columns: 17px minmax(0, 1fr);
    gap: 8px;
  }

  .timeline-marker span {
    margin-top: 22px;
  }

  .submission-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 11px;
  }

  .submission-title {
    width: 100%;
  }

  .submission-title > div {
    min-width: 0;
  }

  .submission-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .revert-action {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .revert-action > span {
    width: 100%;
  }

  .revert-action .btn {
    flex: 1;
    min-height: 46px;
  }
}

@media (max-width: 380px) {
  .history-section {
    padding: 14px;
  }

  .filter-tabs button {
    gap: 3px;
    padding-inline: 7px;
  }

  .submission-header,
  .line-list,
  .submission-footer {
    padding-inline: 14px;
  }

  .submission-footer {
    gap: 10px;
  }
}
</style>
