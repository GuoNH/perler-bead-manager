<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { BatchUpdateResult, InventorySummary } from "@pinpin/shared";
import InventoryTable from "../components/InventoryTable.vue";
import InventoryForm from "../components/InventoryForm.vue";
import ReplenishPanel from "../components/ReplenishPanel.vue";
import BatchPanel from "../components/BatchPanel.vue";
import { useWarehouseStore } from "../stores/warehouse.js";
import { batchUpdate, importInventory } from "../api/warehouse.js";

const store = useWarehouseStore();
const showForm = ref(false);
const editing = ref<InventorySummary | null>(null);
const csvInput = ref<HTMLInputElement | null>(null);
const search = ref("");
const importing = ref(false);
const replenishing = ref(false);
const batchMode = ref<"replenish" | "minStock" | null>(null);
const notice = ref<{ type: "success" | "warning" | "danger"; message: string } | null>(null);

onMounted(() => store.refresh());

const filteredItems = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  if (!query) return store.items;
  return store.items.filter((item) =>
    [item.id, item.color, item.note, item.location, item.supplier]
      .some((value) => value.toLocaleLowerCase().includes(query)),
  );
});
const totalStock = computed(() => store.items.reduce((sum, item) => sum + item.currentStock, 0));
const totalConsumed = computed(() =>
  store.items.reduce((sum, item) => sum + item.cumulativeConsumed, 0),
);
const healthyCount = computed(() => store.items.length - store.replenish.length);

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

function openBatch(mode: "replenish" | "minStock") {
  batchMode.value = mode;
}
function closeBatch() {
  batchMode.value = null;
}

async function onBatchSaved(result: BatchUpdateResult) {
  await store.refresh();
  closeBatch();
  notice.value = {
    type: result.errors.length ? "warning" : "success",
    message: result.errors.length
      ? `批量操作完成：已更新 ${result.updated} 条，${result.errors.length} 条失败：${result.errors.slice(0, 5).join("；")}${result.errors.length > 5 ? "…" : ""}`
      : `批量操作完成：已更新 ${result.updated} 条。`,
  };
}

async function replenishAll() {
  replenishing.value = true;
  notice.value = null;
  try {
    const items = store.replenish.map((r) => ({ id: r.id, amount: r.deficit }));
    const result = await batchUpdate(items);
    await store.refresh();
    notice.value = {
      type: result.errors.length ? "warning" : "success",
      message: result.errors.length
        ? `一键补满完成：已补 ${result.updated} 条，${result.errors.length} 条失败。`
        : `一键补满完成：已补 ${result.updated} 条至安全线。`,
    };
  } catch (err) {
    notice.value = { type: "danger", message: err instanceof Error ? err.message : "补货失败" };
  } finally {
    replenishing.value = false;
  }
}

async function onCsv(ev: Event) {
  const target = ev.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file) return;
  importing.value = true;
  notice.value = null;
  try {
    const result = await importInventory(file);
    await store.refresh();
    notice.value = {
      type: result.skipped ? "warning" : "success",
      message: `CSV 导入完成：已更新 ${result.imported} 条，跳过 ${result.skipped} 条。`,
    };
  } catch (err) {
    notice.value = {
      type: "danger",
      message: err instanceof Error ? err.message : "CSV 导入失败",
    };
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <main class="page inventory-page">
    <header class="page-header">
      <div class="page-header-copy">
        <span class="eyebrow">库存概览</span>
        <h1>仓库台账</h1>
        <p>集中维护色号库存、最低库存线与存放信息，优先处理低于安全水位的拼豆。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" :disabled="importing" @click="csvInput?.click()">
          <span v-if="importing" class="spinner dark"></span>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v12M8 12l4 4 4-4M5 19h14" />
          </svg>
          {{ importing ? "导入中..." : "CSV 导入" }}
        </button>
        <button class="btn" type="button" @click="openBatch('replenish')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v12M8 12l4 4 4-4M5 19h14" />
          </svg>
          批量补货
        </button>
        <button class="btn" type="button" @click="openBatch('minStock')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
            <path d="m4 12 8 3.5 8-3.5" />
          </svg>
          批量安全线
        </button>
        <button class="btn btn-primary" type="button" @click="openNew">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新增色号
        </button>
        <input ref="csvInput" type="file" accept=".csv,text/csv" hidden @change="onCsv" />
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
            <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
            <path d="m4 12 8 3.5 8-3.5" />
          </svg>
          已建色号
        </span>
        <strong class="metric-value">{{ store.items.length }}</strong>
        <span class="metric-hint">仓库中的独立拼豆编号</span>
      </article>
      <article class="metric-card stock-card">
        <span class="metric-label">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <path d="M8 12h8M12 8v8" />
          </svg>
          当前总库存
        </span>
        <strong class="metric-value">{{ totalStock.toLocaleString() }}</strong>
        <span class="metric-hint">全部色号当前库存合计</span>
      </article>
      <article class="metric-card replenish-card">
        <span class="metric-label">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4 3.5 19h17L12 4Z" />
            <path d="M12 9v4M12 16.2v.1" />
          </svg>
          待补充
        </span>
        <strong class="metric-value">{{ store.replenish.length }}</strong>
        <span class="metric-hint">{{ healthyCount }} 个色号高于最低库存线</span>
      </article>
      <article class="metric-card consumed-card">
        <span class="metric-label">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" />
            <path d="M4 4v4.68h4.68M12 7.5V12l3 2" />
          </svg>
          累计消耗
        </span>
        <strong class="metric-value">{{ totalConsumed.toLocaleString() }}</strong>
        <span class="metric-hint">不包含已撤销的提交记录</span>
      </article>
    </section>

    <ReplenishPanel :items="store.replenish" :busy="replenishing" @replenish-all="replenishAll" />

    <section class="inventory-section section-card">
      <div class="section-heading inventory-heading">
        <div>
          <span class="eyebrow">INVENTORY LIST</span>
          <h2>全部库存</h2>
          <p>共 {{ filteredItems.length }} 条记录{{ search ? `，已按“${search}”筛选` : "" }}。</p>
        </div>
        <div class="input-shell inventory-search">
          <svg class="input-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input v-model="search" class="input" type="search" placeholder="搜索编号、位置或供应商" aria-label="搜索库存" />
        </div>
      </div>

      <InventoryTable :items="filteredItems" :loading="store.loading" @edit="openEdit" />
    </section>

    <InventoryForm
      v-if="showForm"
      :initial="editing ?? undefined"
      @close="closeForm"
      @saved="store.refresh(); closeForm()"
    />

    <BatchPanel v-if="batchMode" :mode="batchMode" @close="closeBatch" @saved="onBatchSaved" />
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

.notice-close:hover {
  background: rgba(255, 255, 255, 0.52);
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
.stock-card { --metric-halo: rgba(231, 96, 72, 0.1); }
.replenish-card { --metric-halo: rgba(198, 139, 47, 0.14); }
.consumed-card { --metric-halo: rgba(93, 154, 131, 0.12); }

.inventory-heading {
  align-items: center;
}

.inventory-search {
  width: min(330px, 100%);
  flex: none;
}

@media (max-width: 760px) {
  .inventory-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .inventory-search {
    width: 100%;
  }

  .notice-close {
    right: 6px;
    width: 40px;
    height: 40px;
  }
}
</style>
