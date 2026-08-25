import { defineStore } from "pinia";
import type { LegendItem, RecognizeResult } from "@pinpin/shared";
import { recognizeImage, submitRecognition } from "../api/client.js";

export const useRecognitionStore = defineStore("recognition", {
  state: () => ({
    file: null as File | null,
    previewUrl: "",
    result: null as RecognizeResult | null,
    loading: false,
    error: "",
    submitted: null as { id: string; total: number } | null,
  }),
  actions: {
    async recognize(file: File) {
      this.loading = true;
      this.error = "";
      this.file = file;
      this.previewUrl = URL.createObjectURL(file);
      try {
        this.result = await recognizeImage(file);
      } catch (err) {
        this.error = err instanceof Error ? err.message : "识别失败";
      } finally {
        this.loading = false;
      }
    },
    updateLegend(legend: LegendItem[]) {
      if (this.result) this.result.legend = legend;
    },
    async submit() {
      if (!this.result) return;
      const payload = {
        image: this.result.image,
        legend: this.result.legend,
        confirmedAt: new Date().toISOString(),
      };
      this.submitted = await submitRecognition(payload);
    },
  },
});
