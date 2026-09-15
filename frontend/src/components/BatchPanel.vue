<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { BatchItemInput, BatchUpdateResult } from "@pinpin/shared";
import { batchUpdate } from "../api/warehouse.js";

const props = defineProps<{ mode: "replenish" | "minStock" }>();
const emit = defineEmits<{ close: []; saved: [result: BatchUpdateResult] }>();

const text = ref("");
const saving = ref(false);
const error = ref("");

const isReplenish = computed(() => props.mode === "replenish");

function closeOnEscape(ev: KeyboardEvent) {
  if (ev.key === "Escape" && !saving.value) emit("close");
}
onMounted(() => window.addEventListener("keydown", closeOnEscape));
onUnmounted(() => window.removeEventListener("keydown", closeOnEscape));

function parse(): BatchItemInput[] {
  const items: BatchItemInput[] = [];
  for (const raw of text.value.split(/\r?\n/)) {
    const parts = raw.trim().split(/[\s,，]+/).filter(Boolean);
    if (!parts.length) continue;
    const id = parts[0];
    const num = parts.length > 1 ? Number(parts[1]) : undefined;
    if (isReplenish.value) {
      items.push({ id, amount: num === undefined ? 1000 : num });
    } else {
      items.push({ id, minStock: num });
    }
  }
  return items;
}

async function save() {
  const items = parse();
  if (!items.length) {
    error.value = "请先输入至少一个色号";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const result = await batchUpdate(items);
    emit("saved", result);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "提交失败";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <form class="batch-modal" @submit.prevent="save">
        <header class="modal-header">
          <div>
            <span class="eyebrow">{{ isReplenish ? "RESTOCK" : "SAFETY LINE" }}</span>
            <h2>{{ isReplenish ? "批量补货" : "批量设置安全线" }}</h2>
            <p>
              {{ isReplenish
                ? "每行一个色号，空格后跟数量；省略数量默认补 1000。"
                : "每行一个色号，空格后跟安全线数值。" }}
            </p>
          </div>
          <button class="modal-close" type="button" aria-label="关闭" :disabled="saving" @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div class="modal-body">
          <label class="field">
            <span>{{ isReplenish ? "色号 数量" : "色号 安全线" }}</span>
            <textarea
              v-model="text"
              rows="10"
              autofocus
              :placeholder="isReplenish ? 'A1 500\nB3\nZG2 300' : 'A1 200\nB3 150'"
            ></textarea>
            <small>
              {{ isReplenish
                ? "例如「A1 500」累加 500；只写「A1」则默认补 1000。"
                : "例如「A1 200」把 A1 的安全线设为 200。" }}
            </small>
          </label>

          <div v-if="error" class="notice danger">
            <span class="notice-dot"></span>
            <span>{{ error }}</span>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn" type="button" :disabled="saving" @click="emit('close')">取消</button>
          <button class="btn btn-primary" type="submit" :disabled="saving">
            <span v-if="saving" class="spinner"></span>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 4 4L19 6" />
            </svg>
            {{ saving ? "提交中..." : isReplenish ? "批量补货" : "批量设置" }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.batch-modal {
  width: min(560px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 25px;
  background: var(--surface);
  box-shadow: 0 30px 90px rgba(26, 23, 19, 0.3);
  animation: modal-in 220ms ease both;
}

@supports (max-height: 100dvh) {
  .batch-modal {
    max-height: min(720px, calc(100dvh - 48px));
  }
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 25px 26px 21px;
  border-bottom: 1px solid var(--line);
}

.modal-header h2 {
  margin: 0;
  font-size: 23px;
  letter-spacing: -0.03em;
}

.modal-header p {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.55;
}

.modal-close {
  display: grid;
  width: 38px;
  height: 38px;
  flex: none;
  place-items: center;
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-soft);
  cursor: pointer;
}

.modal-close:hover {
  color: var(--ink);
  border-color: var(--line-strong);
}

.modal-close svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.modal-body {
  padding: 23px 26px;
}

.modal-body .notice {
  margin-top: 15px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 17px 26px 22px;
  border-top: 1px solid var(--line);
  background: var(--surface-soft);
}

.modal-footer .btn {
  min-width: 108px;
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }
}

@media (max-width: 640px) {
  .batch-modal {
    width: 100%;
    max-height: min(92vh, calc(100dvh - 8px));
    border-radius: 24px 24px 0 0;
  }

  .modal-header,
  .modal-body {
    padding-inline: 19px;
  }

  .modal-footer {
    position: sticky;
    bottom: 0;
    padding: 15px 19px calc(17px + env(safe-area-inset-bottom, 0px));
  }

  .modal-footer .btn {
    flex: 1;
  }
}
</style>
