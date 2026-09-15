<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { Drawing, DrawingCategory } from "@pinpin/shared";
import { useDrawingStore } from "../stores/drawings.js";
import { drawingImageUrl } from "../api/drawings.js";
import DrawingCategoryForm from "../components/DrawingCategoryForm.vue";

const store = useDrawingStore();
onMounted(() => {
  store.refresh();
  document.addEventListener("keydown", onKeydown);
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
});

/** 当前选中的分类 ID，null = 全部，undefined = 未分类 */
const selectedCategoryId = ref<string | null>(null);
const showCategoryForm = ref(false);
const editingCategory = ref<DrawingCategory | null>(null);
const deletingCatId = ref("");
const previewDrawing = ref<Drawing | null>(null);
/** 全屏放大预览的图纸 */
const zoomedDrawing = ref<Drawing | null>(null);

/** 缩放与平移状态 */
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartPanX = 0;
let panStartPanY = 0;

// 详情侧栏
const detailDrawing = ref<Drawing | null>(null);
const editNote = ref("");
const editCategoryId = ref<string | null>(null);
const savingDetail = ref(false);
const detailNotice = ref<{ type: "success" | "danger"; message: string } | null>(null);

const filteredDrawings = computed(() => {
  if (selectedCategoryId.value === null) return store.drawings;
  return store.drawings.filter((d) => d.categoryId === selectedCategoryId.value);
});

const previewUrl = computed(() => {
  if (!previewDrawing.value) return "";
  return drawingImageUrl(previewDrawing.value);
});

function selectCategory(id: string | null) {
  selectedCategoryId.value = id;
}

function openNewCategory() {
  editingCategory.value = null;
  showCategoryForm.value = true;
}

function openEditCategory(cat: DrawingCategory, ev: Event) {
  ev.stopPropagation();
  editingCategory.value = cat;
  showCategoryForm.value = true;
}

function onCategorySaved() {
  showCategoryForm.value = false;
  editingCategory.value = null;
}

async function confirmDeleteCategory(cat: DrawingCategory, ev: Event) {
  ev.stopPropagation();
  if (!window.confirm(`确定删除分类「${cat.name}」？该分类下的图纸将变为未分类状态。`)) return;
  deletingCatId.value = cat.id;
  try {
    await store.deleteCategory(cat.id);
    if (selectedCategoryId.value === cat.id) selectedCategoryId.value = null;
  } catch (err) {
    alert(err instanceof Error ? err.message : "删除失败");
  } finally {
    deletingCatId.value = "";
  }
}

function openDetail(d: Drawing) {
  detailDrawing.value = d;
  editNote.value = d.note;
  editCategoryId.value = d.categoryId;
  detailNotice.value = null;
}

function closeDetail() {
  detailDrawing.value = null;
  savingDetail.value = false;
  detailNotice.value = null;
}

function openZoom(d: Drawing) {
  zoomedDrawing.value = d;
  resetZoom();
}

function closeZoom() {
  zoomedDrawing.value = null;
  resetZoom();
}

function resetZoom() {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
  isPanning = false;
}

function zoomIn() {
  zoom.value = Math.min(5, +(zoom.value + 0.25).toFixed(2));
}

function zoomOut() {
  zoom.value = Math.max(0.25, +(zoom.value - 0.25).toFixed(2));
}

function onDblClickZoom() {
  if (zoom.value === 1) zoom.value = 2;
  else resetZoom();
}

function onWheel(ev: WheelEvent) {
  ev.preventDefault();
  const delta = ev.deltaY > 0 ? -0.25 : 0.25;
  zoom.value = Math.max(0.25, Math.min(5, +(zoom.value + delta).toFixed(2)));
}

function startPan(ev: MouseEvent) {
  if (zoom.value <= 1) return;
  isPanning = true;
  panStartX = ev.clientX;
  panStartY = ev.clientY;
  panStartPanX = panX.value;
  panStartPanY = panY.value;
}

function onPan(ev: MouseEvent) {
  if (!isPanning) return;
  panX.value = panStartPanX + (ev.clientX - panStartX);
  panY.value = panStartPanY + (ev.clientY - panStartY);
}

function endPan() {
  isPanning = false;
}

// ESC 键关闭放大预览
function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "Escape" && zoomedDrawing.value) {
    closeZoom();
  }
}

async function saveDetail() {
  if (!detailDrawing.value) return;
  savingDetail.value = true;
  detailNotice.value = null;
  try {
    const updated = await store.updateDrawing(detailDrawing.value.id, {
      categoryId: editCategoryId.value,
      note: editNote.value,
    });
    detailDrawing.value = updated;
    detailNotice.value = { type: "success", message: "保存成功" };
  } catch (err) {
    detailNotice.value = {
      type: "danger",
      message: err instanceof Error ? err.message : "保存失败",
    };
  } finally {
    savingDetail.value = false;
  }
}

async function confirmDeleteDrawing(d: Drawing) {
  if (!window.confirm(`确定删除图纸「${d.imageName}」？此操作不可恢复。`)) return;
  try {
    await store.deleteDrawing(d.id);
    if (detailDrawing.value?.id === d.id) closeDetail();
  } catch (err) {
    alert(err instanceof Error ? err.message : "删除失败");
  }
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

const uncategorized = computed(() => store.drawings.filter((d) => !d.categoryId));
</script>

<template>
  <main class="page library-page">
    <header class="page-header">
      <div class="page-header-copy">
        <span class="eyebrow">DRAWING LIBRARY</span>
        <h1>图纸库</h1>
        <p>浏览和管理已归档的拼豆图纸，按分类整理，方便快速查找。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" :disabled="store.loading" @click="store.refresh()">
          <span v-if="store.loading" class="spinner dark"></span>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" />
          </svg>
          刷新
        </button>
        <button class="btn btn-primary" type="button" @click="openNewCategory">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新建分类
        </button>
      </div>
    </header>

    <div v-if="store.error" class="notice danger" role="alert">
      <span class="notice-dot"></span>
      <span>{{ store.error }}</span>
    </div>

    <div class="library-layout">
      <!-- 分类侧栏 -->
      <aside class="category-sidebar">
        <div class="category-list">
          <button
            class="category-item"
            :class="{ active: selectedCategoryId === null }"
            @click="selectCategory(null)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
              <path d="m4 12 8 3.5 8-3.5M4 16.5 12 20l8-3.5" />
            </svg>
            <span>全部图纸</span>
            <small>{{ store.drawings.length }}</small>
          </button>

          <button
            class="category-item"
            :class="{ active: selectedCategoryId === '__uncategorized__' }"
            @click="selectCategory('__uncategorized__')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 5 6v5c0 4.6 2.9 8.2 7 10 4.1-1.8 7-5.4 7-10V6l-7-3Z" />
            </svg>
            <span>未分类</span>
            <small>{{ uncategorized.length }}</small>
          </button>

          <div v-if="store.categories.length" class="category-divider"></div>

          <div
            v-for="cat in store.categories"
            :key="cat.id"
            class="category-item-row"
          >
            <button
              class="category-item"
              :class="{ active: selectedCategoryId === cat.id }"
              @click="selectCategory(cat.id)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
              </svg>
              <span>{{ cat.name }}</span>
              <small>{{ store.drawings.filter(d => d.categoryId === cat.id).length }}</small>
            </button>
            <div class="category-actions">
              <button
                class="cat-action"
                aria-label="编辑分类"
                title="编辑分类"
                @click="openEditCategory(cat, $event)"
              >
                <svg viewBox="0 0 24 24">
                  <path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
                </svg>
              </button>
              <button
                class="cat-action danger"
                aria-label="删除分类"
                title="删除分类"
                :disabled="deletingCatId === cat.id"
                @click="confirmDeleteCategory(cat, $event)"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M5 7h14M9 7V5h6v2M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- 图纸网格 -->
      <section class="drawing-grid-section">
        <div class="section-heading grid-heading">
          <div>
            <span class="eyebrow">GALLERY</span>
            <h2>
              {{
                selectedCategoryId === null
                  ? "全部图纸"
                  : selectedCategoryId === "__uncategorized__"
                    ? "未分类"
                    : store.categories.find((c) => c.id === selectedCategoryId)?.name ?? "图纸"
              }}
            </h2>
            <p>共 {{ filteredDrawings.length }} 张图纸</p>
          </div>
        </div>

        <div v-if="store.loading && !store.drawings.length" class="grid-loading">
          <span class="spinner dark"></span>
          <span>正在加载图纸库...</span>
        </div>

        <div v-else-if="filteredDrawings.length" class="drawing-grid">
          <article
            v-for="d in filteredDrawings"
            :key="d.id"
            class="drawing-card"
            :class="{ 'is-previewed': previewDrawing?.id === d.id }"
            @mouseenter="previewDrawing = d"
            @mouseleave="previewDrawing = null"
            @click="openDetail(d)"
          >
            <div class="drawing-thumb">
              <img :src="drawingImageUrl(d)" :alt="d.imageName" loading="lazy" />
              <div class="drawing-shade"></div>
              <span class="drawing-badge">{{ d.totalBeads }} 颗</span>
              <button
                class="zoom-trigger"
                type="button"
                title="放大预览"
                @click.stop="openZoom(d)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                  <path d="M8 11h6M11 8v6" />
                </svg>
              </button>
            </div>
            <div class="drawing-info">
              <strong class="drawing-name" :title="d.imageName">{{ d.imageName }}</strong>
              <span class="drawing-meta">
                {{ d.width }} × {{ d.height }}
                <i>·</i>
                {{ d.colorCount }} 色
                <i>·</i>
                {{ formatDate(d.createdAt) }}
              </span>
              <span v-if="d.note" class="drawing-note">{{ d.note }}</span>
            </div>
          </article>
        </div>

        <div v-else class="empty-state">
          <div>
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8M12 8v8" />
              </svg>
            </div>
            <h3>暂无图纸</h3>
            <p>从「上传识别」提交图纸后，归档的图片将显示在这里。</p>
          </div>
        </div>
      </section>
    </div>

    <!-- 图片预览浮层 -->
    <div v-if="previewDrawing" class="preview-float">
      <img :src="previewUrl" :alt="previewDrawing.imageName" />
    </div>

    <!-- 详情侧栏 -->
    <Transition name="slide">
      <aside v-if="detailDrawing" class="detail-panel">
        <header class="detail-header">
          <span class="eyebrow">DETAIL</span>
          <div class="detail-header-row">
            <h2>{{ detailDrawing.imageName }}</h2>
            <button class="btn btn-ghost close-btn" type="button" aria-label="关闭详情" @click="closeDetail">
              <svg viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div class="detail-image" @click="openZoom(detailDrawing)">
          <img :src="drawingImageUrl(detailDrawing)" :alt="detailDrawing.imageName" />
          <div class="detail-image-zoom-hint">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <span>点击查看原图</span>
          </div>
        </div>

        <div v-if="detailNotice" class="notice" :class="detailNotice.type" role="status">
          <span class="notice-dot"></span>
          <span>{{ detailNotice.message }}</span>
        </div>

        <div class="detail-body">
          <div class="detail-meta">
            <div class="meta-row">
              <span>图片尺寸</span>
              <strong>{{ detailDrawing.width }} × {{ detailDrawing.height }}</strong>
            </div>
            <div class="meta-row">
              <span>色号数量</span>
              <strong>{{ detailDrawing.colorCount }} 色</strong>
            </div>
            <div class="meta-row">
              <span>珠子总数</span>
              <strong>{{ detailDrawing.totalBeads }} 颗</strong>
            </div>
            <div class="meta-row">
              <span>归档时间</span>
              <strong>{{ formatDate(detailDrawing.createdAt) }}</strong>
            </div>
          </div>

          <label class="field-label">
            <span>图纸分类</span>
            <select v-model="editCategoryId" class="input">
              <option :value="null">未分类</option>
              <option v-for="cat in store.categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </label>

          <label class="field-label">
            <span>备注</span>
            <textarea v-model="editNote" class="input" rows="3" placeholder="添加备注..."></textarea>
          </label>
        </div>

        <footer class="detail-footer">
          <button class="btn btn-ghost danger-text" type="button" @click="confirmDeleteDrawing(detailDrawing)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 7h14M9 7V5h6v2M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" />
            </svg>
            删除
          </button>
          <div class="detail-footer-right">
            <button class="btn btn-ghost" type="button" @click="closeDetail">取消</button>
            <button class="btn btn-primary" type="button" :disabled="savingDetail" @click="saveDetail">
              <span v-if="savingDetail" class="spinner dark"></span>
              {{ savingDetail ? "保存中..." : "保存" }}
            </button>
          </div>
        </footer>
      </aside>
    </Transition>

    <!-- 分类表单弹窗 -->
    <DrawingCategoryForm
      v-if="showCategoryForm"
      :initial="editingCategory"
      @close="showCategoryForm = false"
      @saved="onCategorySaved"
    />

    <!-- 全屏放大预览（带缩放/平移） -->
    <Transition name="zoom">
      <div v-if="zoomedDrawing" class="zoom-viewer" @click.self="closeZoom">
        <button class="zoom-close" type="button" aria-label="关闭预览" @click="closeZoom">
          <svg viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <!-- 缩放控制栏 -->
        <div class="zoom-toolbar">
          <button class="zoom-tool" type="button" title="缩小" :disabled="zoom <= 0.25" @click="zoomOut">
            <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
          </button>
          <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
          <button class="zoom-tool" type="button" title="放大" :disabled="zoom >= 5" @click="zoomIn">
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <span class="zoom-sep"></span>
          <button class="zoom-tool" type="button" title="适应屏幕" :disabled="zoom === 1" @click="resetZoom">
            <svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /></svg>
          </button>
        </div>

        <!-- 图片容器 -->
        <div
          class="zoom-stage"
          :class="{ grabbing: isPanning }"
          @wheel.prevent="onWheel"
          @mousedown="startPan"
          @mousemove="onPan"
          @mouseup="endPan"
          @mouseleave="endPan"
          @dblclick="onDblClickZoom"
        >
          <img
            class="zoom-image"
            :class="{ panning: zoom > 1 }"
            :src="drawingImageUrl(zoomedDrawing)"
            :alt="zoomedDrawing.imageName"
            :style="{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
            }"
            draggable="false"
            @click.stop
          />
        </div>

        <div class="zoom-footer">
          <strong>{{ zoomedDrawing.imageName }}</strong>
          <span>{{ zoomedDrawing.width }} × {{ zoomedDrawing.height }} · {{ zoomedDrawing.colorCount }} 色 · {{ zoomedDrawing.totalBeads }} 颗 <i>·</i> 滚轮缩放 · 拖拽平移</span>
        </div>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.library-layout {
  display: grid;
  grid-template-columns: 218px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

/* ── 分类侧栏 ── */
.category-sidebar {
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.category-list {
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 40px;
  padding: 7px 10px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  border: 0;
  border-radius: 11px;
  background: transparent;
  cursor: pointer;
  transition: background 140ms ease;
}

.category-item:hover {
  background: var(--surface-soft);
}

.category-item.active {
  color: var(--accent-deep);
  background: var(--accent-soft);
}

.category-item svg {
  width: 16px;
  height: 16px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.category-item span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-item small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 650;
}

.category-divider {
  height: 1px;
  margin: 6px 10px;
  background: var(--line);
}

.category-item-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.category-item-row .category-item {
  flex: 1;
  min-width: 0;
}

.category-actions {
  display: flex;
  gap: 1px;
  padding-right: 4px;
  opacity: 0;
  transition: opacity 120ms ease;
}

.category-item-row:hover .category-actions {
  opacity: 1;
}

.cat-action {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--muted);
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}

.cat-action:hover {
  color: var(--accent-deep);
  background: var(--surface-soft);
}

.cat-action.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}

.cat-action svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ── 图纸网格 ── */
.drawing-grid-section {
  min-height: 300px;
}

.grid-heading {
  margin-bottom: 18px;
}

.grid-loading {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--muted);
  font-size: 12px;
}

.drawing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.drawing-card {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 17px;
  background: #fff;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.drawing-card:hover,
.drawing-card.is-previewed {
  transform: translateY(-3px);
  box-shadow: 0 12px 35px rgba(47, 40, 31, 0.1);
}

.drawing-thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #e9e5dc;
}

.drawing-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.drawing-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 60%, rgba(20, 18, 15, 0.32));
  pointer-events: none;
}

.drawing-badge {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 3px 9px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 7px;
  background: rgba(25, 23, 20, 0.55);
  backdrop-filter: blur(4px);
}

/* ── 卡片预览按钮 ── */
.zoom-trigger {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: #fff;
  border: 0;
  border-radius: 50%;
  background: rgba(25, 23, 20, 0.58);
  backdrop-filter: blur(6px);
  cursor: pointer;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.85);
  transition: opacity 160ms ease, transform 160ms ease, background 160ms ease;
  pointer-events: none;
}

.drawing-card:hover .zoom-trigger {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
  pointer-events: auto;
}

.zoom-trigger:hover {
  background: rgba(231, 96, 72, 0.82);
}

.zoom-trigger svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.drawing-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 13px 14px;
}

.drawing-name {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawing-meta {
  color: var(--muted);
  font-size: 10px;
}

.drawing-meta i {
  margin-inline: 4px;
  font-style: normal;
}

.drawing-note {
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 预览浮层 ── */
.preview-float {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 50;
  width: 260px;
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 18px 50px rgba(47, 40, 31, 0.18);
  background: #fff;
  pointer-events: none;
}

.preview-float img {
  display: block;
  width: 100%;
}

/* ── 全屏放大预览 ── */
.zoom-viewer {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
  background: rgba(15, 14, 12, 0.82);
  backdrop-filter: blur(8px);
}

.zoom-close {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition: background 160ms ease, transform 160ms ease;
}

.zoom-close:hover {
  background: rgba(231, 96, 72, 0.7);
  transform: scale(1.08);
}

.zoom-close svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ── 缩放控制栏 ── */
.zoom-toolbar {
  position: absolute;
  bottom: 80px;
  left: 50%;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  transform: translateX(-50%);
  user-select: none;
}

.zoom-tool {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: rgba(255, 255, 255, 0.8);
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.zoom-tool:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.zoom-tool:disabled {
  opacity: 0.3;
  cursor: default;
}

.zoom-tool svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.zoom-level {
  min-width: 52px;
  text-align: center;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.zoom-sep {
  width: 1px;
  height: 22px;
  margin: 0 2px;
  background: rgba(255, 255, 255, 0.15);
}

/* ── 图片舞台（支持缩放/平移） ── */
.zoom-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 90vw;
  height: 75vh;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.45);
}

.zoom-image {
  display: block;
  max-width: 90vw;
  max-height: 75vh;
  object-fit: contain;
  background: #fff;
  transition: transform 80ms ease;
  user-select: none;
  -webkit-user-drag: none;
}

.zoom-image.panning {
  max-width: none;
  max-height: none;
  object-fit: initial;
}

.zoom-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
}

.zoom-footer strong {
  color: #fff;
  font-size: 13px;
}

.zoom-footer i {
  margin-inline: 4px;
  font-style: normal;
  opacity: 0.4;
}

/* 放大预览动画 */
.zoom-enter-active {
  transition: opacity 200ms ease;
}

.zoom-enter-active .zoom-stage,
.zoom-enter-active .zoom-footer,
.zoom-enter-active .zoom-close,
.zoom-enter-active .zoom-toolbar {
  transition: transform 220ms ease, opacity 220ms ease;
}

.zoom-leave-active {
  transition: opacity 160ms ease;
}

.zoom-leave-active .zoom-stage,
.zoom-leave-active .zoom-footer,
.zoom-leave-active .zoom-close,
.zoom-leave-active .zoom-toolbar {
  transition: transform 140ms ease, opacity 140ms ease;
}

.zoom-enter-from {
  opacity: 0;
}

.zoom-enter-from .zoom-stage {
  transform: scale(0.92);
  opacity: 0;
}

.zoom-enter-from .zoom-footer,
.zoom-enter-from .zoom-close,
.zoom-enter-from .zoom-toolbar {
  transform: translateY(12px);
  opacity: 0;
}

.zoom-leave-to {
  opacity: 0;
}

.zoom-leave-to .zoom-stage {
  transform: scale(0.95);
  opacity: 0;
}

.zoom-leave-to .zoom-footer,
.zoom-leave-to .zoom-close,
.zoom-leave-to .zoom-toolbar {
  transform: translateY(8px);
  opacity: 0;
}

/* ── 详情侧栏 ── */
.detail-panel {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 60;
  width: min(420px, calc(100% - 16px));
  height: 100vh;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--line);
  background: #fff;
  box-shadow: -10px 0 40px rgba(47, 40, 31, 0.08);
}

.detail-header {
  padding: 22px 22px 0;
  flex: none;
}

.detail-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.detail-header h2 {
  margin: 6px 0 0;
  font-size: 18px;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  display: grid;
  place-items: center;
}

.close-btn svg {
  width: 18px;
  height: 18px;
}

.detail-image {
  flex: none;
  margin: 16px 22px;
  border-radius: 12px;
  overflow: hidden;
  background: #e9e5dc;
  aspect-ratio: 4 / 3;
  position: relative;
  cursor: pointer;
}

.detail-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 220ms ease;
}

.detail-image:hover img {
  transform: scale(1.04);
}

.detail-image-zoom-hint {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  color: #fff;
  font-size: 10px;
  font-weight: 680;
  border-radius: 8px;
  background: rgba(25, 23, 20, 0.55);
  backdrop-filter: blur(4px);
  opacity: 0;
  transition: opacity 180ms ease;
  pointer-events: none;
}

.detail-image:hover .detail-image-zoom-hint {
  opacity: 1;
}

.detail-image-zoom-hint svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 22px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.meta-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-soft);
}

.meta-row span {
  font-size: 9px;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.meta-row strong {
  font-size: 13px;
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label > span {
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.03em;
}

.field-label .input {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  font-family: inherit;
}

.field-label .input:focus {
  border-color: rgba(231, 96, 72, 0.6);
  outline: none;
  box-shadow: 0 0 0 3px rgba(231, 96, 72, 0.1);
}

.notice {
  margin: 0 22px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  border-radius: 11px;
  font-size: 12px;
}

.detail-footer {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 22px 22px;
  border-top: 1px solid var(--line-soft);
}

.detail-footer-right {
  display: flex;
  gap: 8px;
}

.detail-footer .btn {
  min-height: 38px;
  padding-inline: 14px;
}

.danger-text {
  color: var(--danger) !important;
}

/* ── 侧栏动画 ── */
.slide-enter-active,
.slide-leave-active {
  transition: transform 200ms ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

/* ── 响应式 ── */
@media (max-width: 860px) {
  .library-layout {
    grid-template-columns: 1fr;
  }

  .category-sidebar {
    order: 1;
  }

  .drawing-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}

@media (max-width: 480px) {
  .drawing-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
  }
}
</style>