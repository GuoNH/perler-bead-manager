<script setup lang="ts">
import { ref } from "vue";
import type { DrawingCategory } from "@pinpin/shared";
import { useDrawingStore } from "../stores/drawings.js";

const props = defineProps<{
  initial?: DrawingCategory | null;
}>();
const emit = defineEmits<{
  close: [];
  saved: [category: DrawingCategory];
}>();

const store = useDrawingStore();
const name = ref(props.initial?.name ?? "");
const saving = ref(false);
const error = ref("");

async function save() {
  const trimmed = name.value.trim();
  if (!trimmed) {
    error.value = "分类名称不能为空";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    if (props.initial) {
      const updated = await store.updateCategory(props.initial.id, {
        name: trimmed,
        sortOrder: props.initial.sortOrder,
      });
      emit("saved", updated);
    } else {
      const created = await store.createCategory(trimmed);
      emit("saved", created);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <article class="modal-card" role="dialog" aria-modal="true" aria-label="图纸分类">
      <header class="modal-header">
        <span class="eyebrow">DRAWING CATEGORY</span>
        <h2>{{ initial ? "编辑分类" : "新建分类" }}</h2>
      </header>

      <div class="modal-body">
        <label class="field-label">
          <span>分类名称</span>
          <input
            v-model="name"
            class="input"
            type="text"
            placeholder="如：人物、动物、建筑"
            @keyup.enter="save"
          />
        </label>

        <div v-if="error" class="notice danger" role="alert">
          <span class="notice-dot"></span>
          <span>{{ error }}</span>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn btn-ghost" type="button" @click="emit('close')">取消</button>
        <button class="btn btn-primary" type="button" :disabled="saving || !name.trim()" @click="save">
          <span v-if="saving" class="spinner dark"></span>
          {{ saving ? "保存中..." : initial ? "保存修改" : "创建分类" }}
        </button>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(25, 23, 20, 0.38);
  backdrop-filter: blur(4px);
}

.modal-card {
  width: min(420px, calc(100% - 32px));
  border: 1px solid var(--line);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.22);
}

.modal-header {
  padding: 24px 24px 0;
}

.modal-header h2 {
  margin: 6px 0 0;
  font-size: 20px;
  letter-spacing: -0.02em;
}

.modal-body {
  padding: 20px 24px;
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label > span {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.03em;
}

.field-label .input {
  height: 44px;
  padding: 0 14px;
  font-size: 15px;
}

.notice {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border-radius: 11px;
  font-size: 12px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 24px 24px;
}

.modal-footer .btn {
  min-height: 40px;
  padding-inline: 18px;
}
</style>