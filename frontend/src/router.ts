import { createRouter, createWebHistory } from "vue-router";
import UploadView from "./views/UploadView.vue";
import InventoryView from "./views/InventoryView.vue";
import SubmissionsView from "./views/SubmissionsView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: UploadView },
    { path: "/inventory", component: InventoryView },
    { path: "/submissions", component: SubmissionsView },
  ],
});
