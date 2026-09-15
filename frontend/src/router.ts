import { createRouter, createWebHistory } from "vue-router";
import UploadView from "./views/UploadView.vue";
import InventoryView from "./views/InventoryView.vue";
import SubmissionsView from "./views/SubmissionsView.vue";
import DrawingLibraryView from "./views/DrawingLibraryView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: UploadView,
      meta: {
        eyebrow: "RECOGNIZE",
        title: "上传识别",
        description: "从图纸图例提取颜色、编号与数量，确认后同步扣减库存。",
      },
    },
    {
      path: "/inventory",
      component: InventoryView,
      meta: {
        eyebrow: "INVENTORY",
        title: "仓库台账",
        description: "查看库存水位、补充预警和每个色号的累计消耗。",
      },
    },
    {
      path: "/submissions",
      component: SubmissionsView,
      meta: {
        eyebrow: "HISTORY",
        title: "提交记录",
        description: "追踪每一次图纸提交，需要时可撤销并回补库存。",
      },
    },
    {
      path: "/drawings",
      component: DrawingLibraryView,
      meta: {
        eyebrow: "LIBRARY",
        title: "图纸库",
        description: "浏览和管理已归档的拼豆图纸，按分类整理。",
      },
    },
  ],
});
