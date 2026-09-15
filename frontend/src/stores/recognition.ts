import { defineStore } from "pinia";
import type { LegendItem, RecognizeResult } from "@pinpin/shared";
import { recognizeImage, submitRecognition } from "../api/client.js";
import { checkDrawingName } from "../api/drawings.js";

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
    /** 是否归档到图纸库 */
    shouldArchive: true,
    /** 图纸归档显示名称（空则使用原文件名） */
    archiveName: "",
    /** 名称是否在图纸库中已存在 */
    nameDuplicate: false,
    /** 名称查重中 */
    nameChecking: false,
    /** 查重防抖定时器 */
    _checkTimer: 0 as unknown as ReturnType<typeof setTimeout> | undefined,
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
        // 识别成功后，用原文件名（不含扩展名）作为默认归档名
        const dotIdx = file.name.lastIndexOf(".");
        this.archiveName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
        this.shouldArchive = true;
        this.nameDuplicate = false;
        // 延迟检查一次名称
        this.scheduleNameCheck();
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
    /** 设置归档名称并触发查重。 */
    setArchiveName(name: string) {
      this.archiveName = name;
      this.scheduleNameCheck();
    },
    /** 防抖查重：用户停止输入 400ms 后检查。 */
    scheduleNameCheck() {
      if (this._checkTimer) clearTimeout(this._checkTimer);
      if (!this.archiveName.trim()) {
        this.nameDuplicate = false;
        return;
      }
      this._checkTimer = setTimeout(() => {
        this.checkName(this.archiveName.trim());
      }, 400) as unknown as ReturnType<typeof setTimeout>;
    },
    async checkName(name: string) {
      if (!name) {
        this.nameDuplicate = false;
        return;
      }
      this.nameChecking = true;
      try {
        const { exists } = await checkDrawingName(name);
        this.nameDuplicate = exists;
      } catch {
        this.nameDuplicate = false;
      } finally {
        this.nameChecking = false;
      }
    },
    async submit() {
      if (!this.result || this.submitting) return null;
      this.submitting = true;
      this.submitError = "";
      try {
        const payload = {
          image: this.result.image,
          tempImageName: this.result.tempImageName,
          shouldArchive: this.shouldArchive,
          archiveName: this.archiveName.trim() || undefined,
          legend: this.result.legend,
          confirmedAt: new Date().toISOString(),
        };
        this.submitted = await submitRecognition(payload);
        return this.submitted;
      } catch (err) {
        this.submitError = err instanceof Error ? err.message : "提交失败";
        return null;
      } finally {
        this.submitting = false;
      }
    },
    /** 清空识别/提交流程，回到初始上传态。 */
    reset() {
      if (this._checkTimer) clearTimeout(this._checkTimer);
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.file = null;
      this.previewUrl = "";
      this.result = null;
      this.loading = false;
      this.submitting = false;
      this.error = "";
      this.submitError = "";
      this.submitted = null;
      this.shouldArchive = true;
      this.archiveName = "";
      this.nameDuplicate = false;
      this.nameChecking = false;
      this._checkTimer = undefined;
    },
  },
});