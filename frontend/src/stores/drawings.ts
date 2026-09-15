import { defineStore } from "pinia";
import type { Drawing, DrawingCategory } from "@pinpin/shared";
import * as api from "../api/drawings.js";

export const useDrawingStore = defineStore("drawings", {
  state: () => ({
    drawings: [] as Drawing[],
    categories: [] as DrawingCategory[],
    loading: false,
    error: "",
  }),
  getters: {
    /** 按分类 ID 分组后的图纸列表。 */
    drawingsByCategory(state): Record<string, Drawing[]> {
      const map: Record<string, Drawing[]> = {};
      for (const d of state.drawings) {
        const key = d.categoryId ?? "__uncategorized__";
        if (!map[key]) map[key] = [];
        map[key].push(d);
      }
      return map;
    },
    /** 活跃分类列表（包含图纸数量）。 */
    categoriesWithCount(state): Array<DrawingCategory & { count: number }> {
      const counts: Record<string, number> = {};
      for (const d of state.drawings) {
        const key = d.categoryId ?? "__uncategorized__";
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return state.categories.map((c) => ({
        ...c,
        count: counts[c.id] ?? 0,
      }));
    },
    uncategorizedCount(state): number {
      return state.drawings.filter((d) => !d.categoryId).length;
    },
  },
  actions: {
    async refresh() {
      this.loading = true;
      this.error = "";
      try {
        const [drawings, categories] = await Promise.all([
          api.listDrawings(),
          api.listCategories(),
        ]);
        this.drawings = drawings;
        this.categories = categories;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "加载图纸库失败";
      } finally {
        this.loading = false;
      }
    },
    async refreshByCategory(categoryId?: string) {
      this.loading = true;
      this.error = "";
      try {
        const [drawings, categories] = await Promise.all([
          api.listDrawings(categoryId),
          api.listCategories(),
        ]);
        this.drawings = drawings;
        this.categories = categories;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "加载图纸库失败";
      } finally {
        this.loading = false;
      }
    },
    async createCategory(name: string, sortOrder = 0) {
      const cat = await api.createCategory({ name, sortOrder });
      this.categories.push(cat);
      return cat;
    },
    async updateCategory(id: string, input: { name: string; sortOrder?: number }) {
      const updated = await api.updateCategory(id, input);
      const idx = this.categories.findIndex((c) => c.id === id);
      if (idx >= 0) this.categories[idx] = updated;
      return updated;
    },
    async deleteCategory(id: string) {
      await api.deleteCategory(id);
      this.categories = this.categories.filter((c) => c.id !== id);
    },
    async updateDrawing(id: string, input: { categoryId?: string | null; note?: string }) {
      const updated = await api.updateDrawing(id, input);
      const idx = this.drawings.findIndex((d) => d.id === id);
      if (idx >= 0) this.drawings[idx] = updated;
      return updated;
    },
    async deleteDrawing(id: string) {
      await api.deleteDrawing(id);
      this.drawings = this.drawings.filter((d) => d.id !== id);
    },
  },
});