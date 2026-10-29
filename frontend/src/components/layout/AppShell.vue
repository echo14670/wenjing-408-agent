<script setup>
import SideNav from './SideNav.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import DevScenarioPanel from '@/components/dev/DevScenarioPanel.vue'
/**
 * 局部基础样式。与 PR #2 的 main.css 并存：
 * 该文件所有 reset 都限定在 .wj-root 内，不会影响 SearchView / ResultView 等页面。
 */
import '@/styles/wj-base.css'
/** 场景面板只在开发态出现，且允许用环境变量关掉（演示截图时更干净） */
const showDevPanel = import.meta.env.DEV && import.meta.env.VITE_MOCK_PANEL !== 'false'
</script>

<template>
  <div class="shell wj-root">
    <SideNav />
    <main class="main">
      <slot />
    </main>
    <ToastHost />
    <DevScenarioPanel v-if="showDevPanel" />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100%;
  background: var(--wj-bg-page);
}

.main {
  margin-left: var(--wj-nav-w);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

@media (max-width: 1100px) {
  .main {
    margin-left: 72px;
  }
}
</style>
