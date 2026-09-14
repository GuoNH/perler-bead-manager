<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import type { InventoryItemInput, InventorySummary } from "@pinpin/shared";
import { upsertInventory } from "../api/warehouse.js";

const props = defineProps<{ initial?: InventorySummary }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const form = reactive({
  id: props.initial?.id ?? "",
  color: props.initial?.color ?? "",
  currentStock: props.initial?.currentStock ?? 0,
  minStock: props.initial?.minStock ?? 0,
  unit: props.initial?.unit ?? "颗",
  note: props.initial?.note ?? "",
  location: props.initial?.location ?? "",
  supplier: props.initial?.supplier ?? "",
});
const saving = ref(false);
const error = ref("");

const colorPreview = computed(() => {
  const [r, g, b] = form.color.split(",").map(Number);
  if (![r, g, b].every(Number.isFinite)) return "transparent";
  return `rgb(${r},${g},${b})`;
});

function closeOnEscape(ev: KeyboardEvent) {
  if (ev.key === "Escape" && !saving.value) emit("close");
}

onMounted(() => window.addEventListener("keydown", closeOnEscape));
onUnmounted(() => window.removeEventListener("keydown", closeOnEscape));

async function save() {
  if (!form.id.trim()) {
    error.value = "请填写拼豆编号";
    return;
  }
  saving.value = true;
  error.value = "";
  const input: InventoryItemInput = {
    color: form.color.trim(),
    currentStock: Number(form.currentStock),
    minStock: Number(form.minStock),
    unit: form.unit.trim() || "颗",
    note: form.note.trim(),
    location: form.location.trim(),
    supplier: form.supplier.trim(),
  };
  try {
    await upsertInventory(form.id.trim(), input);
    emit("saved");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <form class="inventory-modal" @submit.prevent="save">
        <header class="modal-header">
          <div>
            <span class="eyebrow">{{ initial ? "EDIT ITEM" : "NEW ITEM" }}</span>
            <h2>{{ initial ? "编辑库存条目" : "新增库存色号" }}</h2>
            <p>{{ initial ? "更新库存、位置或供应商信息。" : "建立编号档案后，图纸提交会自动按数量扣减。" }}</p>
          </div>
          <button class="modal-close" type="button" aria-label="关闭" :disabled="saving" @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div class="modal-body">
          <div class="form-grid">
            <label class="field">
              <span>拼豆编号</span>
              <input v-model="form.id" :readonly="!!initial" required placeholder="如 A10" autofocus />
              <small>编号用于匹配图纸与库存，保存后不可修改。</small>
            </label>
            <label class="field">
              <span>颜色（RGB）</span>
              <div class="color-input">
                <span class="color-preview" :style="{ background: colorPreview }"></span>
                <input v-model="form.color" placeholder="254,169,72" />
              </div>
              <small>按逗号分隔三个 0–255 数值，也可以留空。</small>
            </label>
            <label class="field">
              <span>当前库存</span>
              <input v-model.number="form.currentStock" type="number" min="0" step="1" required />
            </label>
            <label class="field">
              <span>最低库存线</span>
              <input v-model.number="form.minStock" type="number" min="0" step="1" required />
            </label>
            <label class="field">
              <span>单位</span>
              <input v-model="form.unit" placeholder="颗" />
            </label>
            <label class="field">
              <span>存放位置</span>
              <input v-model="form.location" placeholder="如：A 柜 / 第 2 层" />
            </label>
            <label class="field field-wide">
              <span>供应商</span>
              <input v-model="form.supplier" placeholder="品牌、店铺或供应商名称" />
            </label>
            <label class="field field-wide">
              <span>备注</span>
              <textarea v-model="form.note" placeholder="补充色差、替换色或其他说明"></textarea>
            </label>
          </div>

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
            {{ saving ? "保存中..." : "保存条目" }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.inventory-modal {
  width: min(680px, 100%);
  max-height: min(780px, calc(100vh - 48px));
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 25px;
  background: var(--surface);
  box-shadow: 0 30px 90px rgba(26, 23, 19, 0.3);
  animation: modal-in 220ms ease both;
}

@supports (max-height: 100dvh) {
  .inventory-modal {
    max-height: min(780px, calc(100dvh - 48px));
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

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.field-wide {
  grid-column: 1 / -1;
}

.color-input {
  position: relative;
  display: flex;
  align-items: center;
}

.color-input input {
  padding-left: 49px;
}

.color-preview {
  position: absolute;
  left: 9px;
  z-index: 1;
  width: 27px;
  height: 27px;
  border: 2px solid #fff;
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(47, 40, 31, 0.16);
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
  .inventory-modal {
    width: 100%;
    max-height: min(92vh, calc(100dvh - 8px));
    border-radius: 24px 24px 0 0;
  }

  .modal-header,
  .modal-body {
    padding-inline: 19px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .field-wide {
    grid-column: auto;
  }

  .modal-footer {
    position: sticky;
    bottom: 0;
    padding: 15px 19px calc(17px + env(safe-area-inset-bottom, 0px));
  }

  .modal-footer .btn {
    flex: 1;
  }

  .modal-close {
    width: 44px;
    height: 44px;
  }
}
</style>
