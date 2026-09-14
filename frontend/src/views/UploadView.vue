<script setup lang="ts">
import { computed, ref } from "vue";
import LegendPanel from "../components/LegendPanel.vue";
import SummaryBar from "../components/SummaryBar.vue";
import { useRecognitionStore } from "../stores/recognition.js";

const store = useRecognitionStore();
const input = ref<HTMLInputElement | null>(null);
const dropActive = ref(false);

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
          <img class="preview-image" :src="store.previewUrl" alt="图纸预览" />
          <div class="preview-shade"></div>
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
        <SummaryBar />
      </section>

      <LegendPanel />

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
        <button class="btn btn-primary submit-button" :disabled="!canSubmit" @click="store.submit()">
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

      <div v-if="store.submitted" class="notice success" role="status">
        <span class="notice-dot"></span>
        <div>
          <strong>提交成功</strong>
          <p>共 {{ store.submitted.total }} 颗，库存与提交记录已同步更新。</p>
        </div>
      </div>
    </template>
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
}

.preview-shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(20, 18, 15, 0.42), transparent 24%, transparent 72%, rgba(20, 18, 15, 0.55));
  pointer-events: none;
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
}
</style>
