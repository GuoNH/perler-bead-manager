import { defineStore } from "pinia";
import type { InventorySummary, Submission } from "@pinpin/shared";
import * as api from "../api/warehouse.js";

export const useWarehouseStore = defineStore("warehouse", {
  state: () => ({
    items: [] as InventorySummary[],
    replenish: [] as InventorySummary[],
    submissions: [] as Submission[],
    loading: false,
  }),
  actions: {
    async refresh() {
      this.loading = true;
      try {
        [this.items, this.replenish, this.submissions] = await Promise.all([
          api.listInventory(),
          api.listReplenish(),
          api.listSubmissions(),
        ]);
      } catch (err) {
        console.error("warehouse refresh failed", err);
      } finally {
        this.loading = false;
      }
    },
  },
});
