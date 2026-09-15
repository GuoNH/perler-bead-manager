<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import LegendPanel from "../components/LegendPanel.vue";
import SummaryBar from "../components/SummaryBar.vue";
import { useRecognitionStore } from "../stores/recognition.js";

const store = useRecognitionStore();
const input = ref<HTMLInputElement | null>(null);
const dropActive = ref(false);
/** 全屏放大预览的图片 URL（预览图 blob URL） */
const zoomedPreviewUrl = ref("");

const warningCount = computed(() => store.result?.warnings.length ?? 0);
const failedCount = computed(() => store.result?.failedCells.length ?? 0);
const hasBlockingError = computed(() =>
  store.result?.warnings.some((warning) => warning.level === "error") ?? false,
);
const canSubmit = computed(() =>
  Boolean(store.result?.legend.length) && !hasBlockingError.value && !store.submitting,
);

function chooseFile() {
  input.value?.click();
}

function onFile(ev: Event) {
  const target = ev.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) void store.recognize(file);
  target.value = "";
}

function onDrop(ev: DragEvent) {
  dropActive.value = false;
  const file = ev.dataTransfer?.files?.[0];
  if (file?.type.startsWith("image/")) void store.recognize(file);
}

function reset() {
  input.value?.click();
}

/* ── 滚动跳转 ── */

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ── 全屏放大预览（支持缩放/平移） ── */

/** 当前缩放倍率（1 = 适应屏幕） */
const zoom = ref(1);
/** 平移偏移量（px） */
const panX = ref(0);
const panY = ref(0);
/** 拖拽平移状态 */
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartPanX = 0;
let panStartPanY = 0;

function openZoom() {
  if (store.previewUrl) {
    zoomedPreviewUrl.value = store.previewUrl;
    resetZoom();
  }
}

function closeZoom() {
  zoomedPreviewUrl.value = "";
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

/** 双击切换 1:1 与适应屏幕 */
function onDblClickZoom() {
  if (zoom.value === 1) {
    zoom.value = 2;
  } else {
    resetZoom();
  }
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

function onZoomKeydown(ev: KeyboardEvent) {
  if (ev.key === "Escape" && zoomedPreviewUrl.value) {
    closeZoom();
  }
}

onMounted(() => document.addEventListener("keydown", onZoomKeydown));
onUnmounted(() => document.removeEventListener("keydown", onZoomKeydown));

const toast = ref<{ total: number; archived: boolean } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

async function submit() {
  const result = await store.submit();
  if (!result) return;
  toast.value = { total: result.total, archived: store.shouldArchive };
  store.reset();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = null; }, 4000);
}
</script>

<template>
  <main class="page upload-page">
    <header class="page-header">
      <div class="page-header-copy">
        <span class="eyebrow">图纸工作台</span>
        <h1>上传识别</h1>
        <p>上传拼豆图纸，自动读取图例中的编号、数量与颜色；人工校对后即可提交并扣减库存。</p>
      </div>
      <div v-if="store.result && !store.loading" class="page-actions">
        <button class="btn" type="button" @click="reset">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" />
          </svg>
          重新上传
        </button>
      </div>
    </header>

    <div class="upload-workspace">
      <section
        class="upload-stage"
        :class="{ active: dropActive, 'has-preview': store.previewUrl }"
        @click="chooseFile"
        @dragenter.prevent="dropActive = true"
        @dragover.prevent="dropActive = true"
        @dragleave.prevent="dropActive = false"
        @drop.prevent="onDrop"
      >
        <input ref="input" type="file" accept="image/*" hidden @change="onFile" />

        <template v-if="store.previewUrl">
          <img
            class="preview-image"
            :src="store.previewUrl"
            alt="图纸预览"
            @click.stop="openZoom"
          />
          <div class="preview-shade"></div>
          <button class="upload-zoom-trigger" type="button" title="放大预览" @click.stop="openZoom">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
              <path d="M8 11h6M11 8v6" />
            </svg>
          </button>
          <div class="preview-topline">
            <span class="badge neutral">图纸预览</span>
            <span class="preview-file">{{ store.file?.name }}</span>
          </div>
          <div class="preview-action">
            <span>点击更换图纸</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
        </template>

        <template v-else>
          <div class="drop-illustration" aria-hidden="true">
            <span class="bead bead-a"></span>
            <span class="bead bead-b"></span>
            <span class="bead bead-c"></span>
            <span class="bead bead-d"></span>
            <div class="drop-cloud">
              <svg viewBox="0 0 24 24">
                <path d="M12 16V4M8 8l4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
              </svg>
            </div>
          </div>
          <div class="drop-copy">
            <span class="eyebrow">STEP 01</span>
            <h2>拖入你的拼豆图纸</h2>
            <p>点击或拖拽上传拼豆图纸</p>
            <button class="btn btn-primary" type="button" @click.stop="chooseFile">
              选择图片
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <small>支持 JPEG、PNG、WebP，单张图片即可完成识别</small>
          </div>
        </template>

        <div v-if="store.loading" class="loading-layer">
          <span class="spinner"></span>
          <strong>正在识别图纸</strong>
          <p>定位图例色块并读取编号与数量...</p>
        </div>
      </section>

      <aside class="workflow-panel">
        <div class="workflow-card">
          <span class="eyebrow">WORKFLOW</span>
          <h2>三步完成入库</h2>
          <ol class="workflow-steps">
            <li>
              <span>1</span>
              <div>
                <strong>上传图纸</strong>
                <p>读取图例区域，不会逐格识别图案。</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>校对数据</strong>
                <p>检查编号、数量和色块，补录失败项。</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>提交扣减</strong>
                <p>生成归档文件，并自动更新仓库库存。</p>
              </div>
            </li>
          </ol>
        </div>

        <div class="privacy-card">
          <div class="privacy-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3 5 6v5c0 4.6 2.9 8.2 7 10 4.1-1.8 7-5.4 7-10V6l-7-3Z" />
              <path d="m9.5 12 1.7 1.7 3.6-3.7" />
            </svg>
          </div>
          <div>
            <strong>本地优先</strong>
            <p>图纸、识别结果与库存数据均保留在当前设备。</p>
          </div>
        </div>
      </aside>
    </div>

    <div v-if="store.error" class="notice danger" role="alert">
      <span class="notice-dot"></span>
      <div>
        <strong>识别失败</strong>
        <p>{{ store.error }}</p>
      </div>
    </div>

    <template v-if="store.result && !store.loading">
      <section class="result-overview">
        <div class="result-heading">
          <div>
            <span class="eyebrow">RESULT</span>
            <h2>识别结果</h2>
            <p>
              {{ store.result.image.name }} ·
              {{ store.result.image.width }} × {{ store.result.image.height }} px
            </p>
          </div>
          <span
            class="badge"
            :class="hasBlockingError ? 'danger' : failedCount ? 'warning' : 'success'"
          >
            {{ hasBlockingError ? "存在错误" : failedCount ? `${failedCount} 项待补录` : "可提交" }}
          </span>
        </div>
        <SummaryBar
          @scroll-to-warnings="scrollToSection('legend-warnings')"
          @scroll-to-failed="scrollToSection('legend-failed')"
        />
      </section>

      <LegendPanel />

      <section class="archive-config">
        <div class="archive-toggle">
          <div class="archive-toggle-copy">
            <span class="archive-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8M12 8v8" />
              </svg>
            </span>
            <div>
              <strong>归档到图纸库</strong>
              <p>提交后将原始图纸归档至图纸库，方便后续浏览查找。</p>
            </div>
          </div>
          <button
            class="toggle-switch"
            :class="{ active: store.shouldArchive }"
            type="button"
            role="switch"
            :aria-checked="store.shouldArchive"
            @click="store.shouldArchive = !store.shouldArchive"
          >
            <span class="toggle-knob"></span>
          </button>
        </div>

        <Transition name="slide-toggle">
          <div v-if="store.shouldArchive" class="archive-name-row">
            <label class="archive-name-field">
              <span class="field-label-text">图纸名称</span>
              <div class="archive-input-shell">
                <input
                  v-model="store.archiveName"
                  class="input"
                  type="text"
                  placeholder="输入图纸显示名称（默认为原文件名）"
                  maxlength="120"
                  @input="store.setArchiveName(($event.target as HTMLInputElement).value)"
                />
                <span v-if="store.nameChecking" class="archive-status spinner dark"></span>
                <span
                  v-else-if="store.archiveName.trim() && store.nameDuplicate"
                  class="archive-status duplicate"
                  title="该名称在图纸库中已存在"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 4 3.5 19h17L12 4Z" />
                    <path d="M12 9v4M12 16.2v.1" />
                  </svg>
                </span>
                <span
                  v-else-if="store.archiveName.trim() && !store.nameDuplicate"
                  class="archive-status available"
                  title="名称可用"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </span>
              </div>
            </label>
            <div v-if="store.archiveName.trim() && store.nameDuplicate" class="archive-warning">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4 3.5 19h17L12 4Z" />
                <path d="M12 9v4M12 16.2v.1" />
              </svg>
              <span>该名称在图纸库中已存在，归档后可能导致重名。</span>
            </div>
          </div>
        </Transition>
      </section>

      <section class="submit-bar">
        <div class="submit-summary">
          <span class="submit-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
              <path d="m4 12 8 3.5 8-3.5M4 16.5 12 20l8-3.5" />
            </svg>
          </span>
          <div>
            <strong>提交后自动扣减库存</strong>
            <p v-if="warningCount || failedCount">
              当前有 {{ warningCount }} 条提示、{{ failedCount }} 个待补录色块，请确认无误后再提交。
            </p>
            <p v-else>识别结果已通过基础校验，可生成 JSON / CSV 归档。</p>
          </div>
        </div>
        <button class="btn btn-primary submit-button" :disabled="!canSubmit" @click="submit">
          <span v-if="store.submitting" class="spinner"></span>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12 4 4L19 6" />
          </svg>
          {{ store.submitting ? "正在提交..." : "确认并提交" }}
        </button>
      </section>

      <div v-if="store.submitError" class="notice danger" role="alert">
        <span class="notice-dot"></span>
        <span>{{ store.submitError }}</span>
      </div>
    </template>

    <Transition name="toast">
      <div v-if="toast" class="toast" role="status">
        <span class="toast-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-8" /></svg>
        </span>
        <div class="toast-copy">
          <strong>提交成功</strong>
          <p>
            共 {{ toast.total }} 颗，库存已更新。
            <router-link v-if="toast.archived" to="/drawings">查看图纸库</router-link>
          </p>
        </div>
        <button class="toast-close" type="button" aria-label="关闭" @click="toast = null">×</button>
      </div>
    </Transition>

    <!-- 全屏放大预览（带缩放/平移） -->
    <Transition name="zoom">
      <div v-if="zoomedPreviewUrl" class="zoom-viewer" @click.self="closeZoom">
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

        <!-- 图片容器（支持滚轮缩放 + 拖拽平移） -->
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
            :src="zoomedPreviewUrl"
            alt="图纸原图"
            :style="{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
            }"
            draggable="false"
            @click.stop
          />
        </div>

        <div class="zoom-footer">
          <strong>{{ store.file?.name ?? "预览" }}</strong>
          <span v-if="store.result">
            {{ store.result.image.width }} × {{ store.result.image.height }}
            <i>·</i>
            滚轮缩放 · 拖拽平移
          </span>
        </div>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.upload-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 296px;
  gap: 18px;
}

.upload-stage {
  position: relative;
  display: grid;
  min-height: 430px;
  overflow: hidden;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 28px;
  background:
    linear-gradient(rgba(255, 253, 248, 0.92), rgba(255, 253, 248, 0.92)),
    repeating-linear-gradient(0deg, transparent 0 31px, rgba(94, 83, 67, 0.06) 31px 32px),
    repeating-linear-gradient(90deg, transparent 0 31px, rgba(94, 83, 67, 0.06) 31px 32px);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.upload-stage::after {
  position: absolute;
  inset: 12px;
  z-index: 0;
  content: "";
  border: 1px dashed var(--line-strong);
  border-radius: 19px;
  pointer-events: none;
  transition: border-color 180ms ease, background 180ms ease;
}

.upload-stage:hover,
.upload-stage.active {
  border-color: rgba(231, 96, 72, 0.65);
  box-shadow: 0 18px 52px rgba(47, 40, 31, 0.1);
}

.upload-stage.active::after {
  border-color: var(--accent);
  background: rgba(231, 96, 72, 0.035);
}

.upload-stage.active {
  transform: translateY(-2px);
}

.drop-illustration {
  position: relative;
  width: 176px;
  height: 126px;
  margin-bottom: 102px;
}

.drop-illustration::after {
  position: absolute;
  bottom: -17px;
  left: 22px;
  width: 135px;
  height: 22px;
  content: "";
  border-radius: 50%;
  background: rgba(52, 46, 38, 0.08);
  filter: blur(10px);
}

.drop-cloud {
  position: absolute;
  top: 29px;
  left: 47px;
  z-index: 2;
  display: grid;
  width: 84px;
  height: 68px;
  place-items: center;
  color: var(--accent);
  border: 1px solid #efc7bd;
  border-radius: 24px;
  background: var(--accent-soft);
  transform: rotate(2deg);
}

.drop-cloud svg {
  width: 32px;
  height: 32px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.bead {
  position: absolute;
  z-index: 1;
  width: 42px;
  height: 42px;
  border: 7px solid rgba(255, 255, 255, 0.72);
  border-radius: 50%;
  box-shadow: 0 7px 18px rgba(47, 40, 31, 0.12);
}

.bead::after {
  position: absolute;
  inset: 7px;
  content: "";
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.46);
}

.bead-a { top: 9px; left: 8px; background: #ef8b74; transform: rotate(-8deg); }
.bead-b { top: 5px; right: 9px; background: #85aa9d; transform: rotate(9deg); }
.bead-c { bottom: 3px; left: 27px; background: #e2b45e; transform: rotate(5deg); }
.bead-d { right: 27px; bottom: 6px; background: #7690b7; transform: rotate(-6deg); }

.drop-copy {
  position: absolute;
  right: 28px;
  bottom: 34px;
  left: 28px;
  z-index: 2;
  text-align: center;
}

.drop-copy .eyebrow {
  margin-bottom: 6px;
}

.drop-copy h2 {
  margin: 0;
  font-size: clamp(22px, 2.5vw, 30px);
  letter-spacing: -0.035em;
}

.drop-copy p {
  margin: 8px 0 18px;
  color: var(--muted);
  font-size: 13px;
}

.drop-copy small {
  display: block;
  margin-top: 14px;
  color: var(--muted-light);
  font-size: 11px;
}

.preview-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #e9e5dc;
  cursor: zoom-in;
}

.preview-shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(20, 18, 15, 0.42), transparent 24%, transparent 72%, rgba(20, 18, 15, 0.55));
  pointer-events: none;
}

/* ── 预览放大按钮 ── */
.upload-zoom-trigger {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 4;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: #fff;
  border: 0;
  border-radius: 50%;
  background: rgba(25, 23, 20, 0.55);
  backdrop-filter: blur(6px);
  cursor: pointer;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.85);
  transition: opacity 180ms ease, transform 180ms ease, background 180ms ease;
  pointer-events: none;
}

.upload-stage.has-preview:hover .upload-zoom-trigger {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
  pointer-events: auto;
}

.upload-zoom-trigger:hover {
  background: rgba(231, 96, 72, 0.8);
}

.upload-zoom-trigger svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 移动端始终显示放大按钮 */
@media (hover: none) {
  .upload-zoom-trigger {
    opacity: 0.7;
    transform: translate(-50%, -50%) scale(1);
    pointer-events: auto;
  }
}

.preview-topline {
  position: absolute;
  top: 23px;
  right: 24px;
  left: 24px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preview-file {
  max-width: 50%;
  overflow: hidden;
  color: #fff;
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
}

.preview-action {
  position: absolute;
  right: 22px;
  bottom: 22px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  color: #fff;
  font-size: 11px;
  font-weight: 650;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 999px;
  background: rgba(25, 23, 20, 0.5);
  backdrop-filter: blur(8px);
}

.preview-action svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.loading-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: #fff;
  background: rgba(37, 35, 31, 0.76);
  backdrop-filter: blur(7px);
  cursor: wait;
}

.loading-layer .spinner {
  width: 34px;
  height: 34px;
  margin-bottom: 15px;
  border-width: 3px;
  color: var(--accent);
}

.loading-layer strong {
  font-size: 17px;
}

.loading-layer p {
  margin: 7px 0 0;
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
}

.workflow-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.workflow-card,
.privacy-card {
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.workflow-card {
  padding: 23px 21px;
}

.workflow-card h2 {
  margin: 0 0 22px;
  font-size: 18px;
  letter-spacing: -0.02em;
}

.workflow-steps {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}

.workflow-steps li {
  position: relative;
  display: grid;
  grid-template-columns: 30px 1fr;
  gap: 11px;
  padding-bottom: 20px;
}

.workflow-steps li:last-child {
  padding-bottom: 0;
}

.workflow-steps li:not(:last-child)::after {
  position: absolute;
  top: 32px;
  bottom: 6px;
  left: 14px;
  width: 1px;
  content: "";
  background: var(--line);
}

.workflow-steps li > span {
  position: relative;
  z-index: 1;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--accent-deep);
  font-size: 11px;
  font-weight: 800;
  border: 1px solid #efc7bd;
  border-radius: 10px;
  background: var(--accent-soft);
}

.workflow-steps strong {
  display: block;
  margin-top: 2px;
  font-size: 13px;
}

.workflow-steps p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.55;
}

.privacy-card {
  display: flex;
  gap: 12px;
  padding: 18px;
  background: #e7f0eb;
  border-color: #cfdfd7;
}

.privacy-icon {
  display: grid;
  width: 37px;
  height: 37px;
  flex: none;
  place-items: center;
  color: #467b68;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
}

.privacy-icon svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.privacy-card strong {
  color: #355f50;
  font-size: 12px;
}

.privacy-card p {
  margin: 4px 0 0;
  color: #5c7d70;
  font-size: 10px;
  line-height: 1.55;
}

.notice p {
  margin: 3px 0 0;
}

.notice a {
  color: var(--accent-deep);
  font-weight: 680;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.result-overview {
  padding: 25px;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.result-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}

.result-heading h2 {
  margin: 0;
  font-size: 21px;
  letter-spacing: -0.025em;
}

.result-heading p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.submit-bar {
  position: sticky;
  bottom: 18px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 17px 19px;
  border: 1px solid rgba(222, 217, 206, 0.94);
  border-radius: 19px;
  background: rgba(255, 253, 248, 0.92);
  box-shadow: 0 16px 45px rgba(47, 40, 31, 0.12);
  backdrop-filter: blur(16px);
}

.submit-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.submit-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  color: var(--accent);
  border-radius: 13px;
  background: var(--accent-soft);
}

.submit-icon svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.submit-summary strong {
  display: block;
  font-size: 13px;
}

.submit-summary p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}

.submit-button {
  min-width: 154px;
  flex: none;
}

/* ── 归档配置 ── */

.archive-config {
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  padding: 18px 20px;
}

.archive-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.archive-toggle-copy {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.archive-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  color: var(--muted);
  border-radius: 11px;
  background: var(--surface-soft);
}

.archive-icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.archive-toggle-copy strong {
  display: block;
  font-size: 13px;
}

.archive-toggle-copy p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.45;
}

/* 开关 */
.toggle-switch {
  position: relative;
  width: 46px;
  height: 26px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 99px;
  background: var(--line-strong);
  cursor: pointer;
  transition: background 160ms ease;
}

.toggle-switch.active {
  background: var(--mint);
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  transition: transform 160ms ease;
}

.toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}

/* 名称输入行 */
.archive-name-row {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.archive-name-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label-text {
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.03em;
}

.archive-input-shell {
  position: relative;
  display: flex;
  align-items: center;
}

.archive-input-shell .input {
  width: 100%;
  height: 42px;
  padding: 0 42px 0 14px;
  font-size: 14px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #fff;
}

.archive-input-shell .input:focus {
  border-color: rgba(231, 96, 72, 0.6);
  outline: none;
  box-shadow: 0 0 0 3px rgba(231, 96, 72, 0.1);
}

.archive-status {
  position: absolute;
  right: 12px;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  pointer-events: none;
}

.archive-status.spinner {
  width: 18px;
  height: 18px;
  border-width: 2px;
}

.archive-status svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.archive-status.duplicate svg {
  color: var(--warning);
}

.archive-status.available svg {
  color: var(--mint);
}

.archive-warning {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  color: #8d611b;
  font-size: 10px;
}

.archive-warning svg {
  width: 14px;
  height: 14px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 展开/收起动画 */
.slide-toggle-enter-active,
.slide-toggle-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.slide-toggle-enter-from,
.slide-toggle-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 1100px) {
  .upload-workspace {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
}

@media (max-width: 900px) {
  .upload-workspace {
    grid-template-columns: 1fr;
  }

  .workflow-panel {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(220px, 1fr);
  }
}

@media (max-width: 640px) {
  .upload-stage {
    min-height: 390px;
    border-radius: 22px;
  }

  .upload-stage::after {
    inset: 9px;
    border-radius: 16px;
  }

  .drop-illustration {
    margin-bottom: 115px;
    transform: scale(0.92);
  }

  .drop-copy {
    right: 23px;
    bottom: 29px;
    left: 23px;
  }

  .drop-copy h2 {
    font-size: 23px;
  }

  .drop-copy small {
    line-height: 1.5;
  }

  .preview-topline {
    top: 18px;
    right: 18px;
    left: 18px;
  }

  .workflow-panel {
    grid-template-columns: 1fr;
  }

  .workflow-card {
    border-radius: 20px;
  }

  .workflow-steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .workflow-steps li {
    display: block;
    padding: 0;
  }

  .workflow-steps li::after {
    display: none;
  }

  .workflow-steps li > span {
    margin-bottom: 9px;
  }

  .workflow-steps p {
    display: none;
  }

  .result-overview {
    padding: 19px;
    border-radius: 20px;
  }

  .result-heading {
    margin-bottom: 17px;
  }

  .submit-bar {
    position: static;
    align-items: stretch;
    flex-direction: column;
    padding: 16px;
  }

  .submit-button {
    width: 100%;
  }

  .archive-config {
    padding: 14px 16px;
  }
}

@media (max-width: 380px) {
  .upload-stage {
    min-height: 360px;
    border-radius: 18px;
  }

  .drop-copy {
    right: 18px;
    bottom: 24px;
    left: 18px;
  }

  .drop-copy h2 {
    font-size: 21px;
  }

  .drop-illustration {
    margin-bottom: 105px;
    transform: scale(0.82);
  }

  .workflow-card,
  .privacy-card,
  .result-overview {
    border-radius: 18px;
  }

  .result-heading {
    flex-wrap: wrap;
  }

  .submit-bar {
    padding: 14px;
    border-radius: 16px;
  }

  .archive-config {
    padding: 12px 14px;
  }
}

.toast {
  position: fixed;
  top: 100px;
  right: 28px;
  z-index: 200;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  max-width: 360px;
  padding: 15px 16px;
  color: var(--ink-soft);
  border: 1px solid #c6e3d8;
  border-radius: 16px;
  background: var(--mint-soft);
  box-shadow: 0 18px 50px rgba(47, 40, 31, 0.16);
}

.toast-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  color: #3f7965;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.62);
}

.toast-icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.toast-copy strong {
  display: block;
  color: #355f50;
  font-size: 13px;
}

.toast-copy p {
  margin: 3px 0 0;
  color: #5c7d70;
  font-size: 11px;
  line-height: 1.5;
}

.toast-copy a {
  color: var(--accent-deep);
  font-weight: 680;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.toast-close {
  flex: none;
  color: #5c7d70;
  font-size: 18px;
  line-height: 1;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 640px) {
  .toast {
    top: 84px;
    right: 16px;
    left: 16px;
    max-width: none;
  }
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
</style>
