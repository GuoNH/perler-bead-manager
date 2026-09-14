<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

const navItems = [
  { to: "/", label: "上传识别", hint: "读取图纸", icon: "scan" },
  { to: "/inventory", label: "仓库台账", hint: "库存管理", icon: "inventory" },
  { to: "/submissions", label: "提交记录", hint: "消耗流水", icon: "history" },
];

const page = computed(() => ({
  eyebrow: String(route.meta.eyebrow ?? "PINPIN WORKSPACE"),
  title: String(route.meta.title ?? "拼豆工作台"),
  description: String(route.meta.description ?? ""),
}));
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <router-link to="/" class="brand" aria-label="返回上传识别">
        <span class="brand-mark" aria-hidden="true">
          <i></i><i></i><i></i><i></i><i></i>
        </span>
        <span class="brand-copy">
          <strong>拼豆</strong>
          <small>Pinpin Studio</small>
        </span>
      </router-link>

      <nav class="primary-nav" aria-label="主导航">
        <router-link v-for="item in navItems" :key="item.to" :to="item.to">
          <span class="nav-icon" aria-hidden="true">
            <svg v-if="item.icon === 'scan'" viewBox="0 0 24 24">
              <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8M12 8v8" />
            </svg>
            <svg v-else-if="item.icon === 'inventory'" viewBox="0 0 24 24">
              <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
              <path d="m4 12 8 3.5 8-3.5M4 16.5 12 20l8-3.5" />
            </svg>
            <svg v-else viewBox="0 0 24 24">
              <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" />
              <path d="M4 4v4.68h4.68M12 7.5V12l3 2" />
            </svg>
          </span>
          <span class="nav-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
          </span>
          <svg class="nav-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </router-link>
      </nav>

      <div class="sidebar-note">
        <span class="status-dot"></span>
        <div>
          <strong>本地工作区</strong>
          <small>图纸与库存保存在当前设备</small>
        </div>
      </div>
    </aside>

    <div class="app-frame">
      <header class="topbar">
        <div class="topbar-heading">
          <span>{{ page.eyebrow }}</span>
          <strong>{{ page.title }}</strong>
        </div>
        <p class="topbar-description">{{ page.description }}</p>
        <div class="local-badge">
          <span class="status-dot"></span>
          <span>本地模式</span>
        </div>
      </header>

      <main class="app-content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <nav class="mobile-nav" aria-label="移动端主导航">
      <router-link v-for="item in navItems" :key="item.to" :to="item.to">
        <svg v-if="item.icon === 'scan'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8M12 8v8" />
        </svg>
        <svg v-else-if="item.icon === 'inventory'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
          <path d="m4 12 8 3.5 8-3.5M4 16.5 12 20l8-3.5" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" />
          <path d="M4 4v4.68h4.68M12 7.5V12l3 2" />
        </svg>
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>
