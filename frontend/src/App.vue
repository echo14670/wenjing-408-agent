<script setup>
import { useRoute } from 'vue-router'
import SideNav from './components/SideNav.vue'
import TopBar from './components/TopBar.vue'
import DevMockSwitch from './components/DevMockSwitch.vue'

/**
 * 答案 / 步骤 / 教学模式三页自带完整外壳（components/layout/AppShell.vue），
 * 命中 meta.fullLayout 时不再套 app-shell，否则会出现双层侧栏。
 */
const route = useRoute()
</script>

<template>
  <router-view v-if="route.meta.fullLayout" />
  <div v-else class="app-shell">
    <SideNav />
    <div class="app-main">
      <TopBar />
      <main class="app-content">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>
    <DevMockSwitch />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  background: var(--c-bg);
}
.app-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.app-content {
  flex: 1;
  padding: 20px 24px 40px;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
}
</style>
