import { createRouter, createWebHistory } from "vue-router";
import UploadView from "./views/UploadView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/", component: UploadView }],
});
