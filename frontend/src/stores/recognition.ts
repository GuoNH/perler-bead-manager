import { defineStore } from "pinia";
import type { LegendItem, RecognizeResult } from "@pinpin/shared";
import { recognizeImage, submitRecognition } from "../api/client.js";

export const useRecognitionStore = defineStore("recognition", {
  state: () => ({
    file: null as File | null,
    previewUrl: "",
    result: null as RecognizeResult | null,
    loading: false,
    submitting: false,
    error: "",
    submitError: "",
    submitted: null as { id: string; total: number; jsonPath: string; csvPath: string } | null,
  }),
  actions: {
    async recognize(file: File) {
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.loading = true;
      this.error = "";
      this.submitError = "";
      this.submitted = null;
      this.file = file;
      this.previewUrl = URL.createObjectURL(file);
      try {
        this.result = await recognizeImage(file);
      } catch (err) {
        this.result = null;
        this.error = err instanceof Error ? err.message : "识别失败";
      } finally {
        this.loading = false;
      }
    },
    updateLegend(legend: LegendItem[]) {
      if (this.result) {
        this.result.legend = legend;
        this.submitted = null;
      }
    },
    async submit() {
      if (!this.result || this.submitting) return;
      this.submitting = true;
      this.submitError = "";
      try {
        const payload = {
          image: this.result.image,
          legend: this.result.legend,
          confirmedAt: new Date().toISOString(),
        };
        this.submitted = await submitRecognition(payload);
      } catch (err) {
        this.submitError = err instanceof Error ? err.message : "提交失败";
      } finally {
        this.submitting = false;
      }
    },
  },
});
