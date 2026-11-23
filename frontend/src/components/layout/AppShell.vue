<script setup>
import { useRoute } from 'vue-router'
import DevMockSwitch from '@/components/DevMockSwitch.vue'
import SideNav from './SideNav.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import DevScenarioPanel from '@/components/dev/DevScenarioPanel.vue'
import '@/styles/wj-base.css'

const route = useRoute()
const showDevTools = import.meta.env.DEV && import.meta.env.VITE_MOCK_PANEL !== 'false'
</script>

<template>
  <div class="shell wj-root" :class="{ 'has-dev-tools': showDevTools }">
    <SideNav />
    <main class="main" :aria-label="route.meta.title">
      <slot />
    </main>
    <ToastHost />
    <DevScenarioPanel v-if="showDevTools && route.meta.studyScenario" />
    <DevMockSwitch v-if="showDevTools" />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--wj-nav-w) minmax(0, 1fr);
  align-items: start;
  min-height: 100vh;
}

.main {
  min-width: 0;
  min-height: 100vh;
}

.has-dev-tools {
  --wj-toast-bottom: 118px;
}

@media (max-width: 1100px) {
  .shell {
    --wj-nav-w: 72px;
  }
}

@media (max-width: 720px) {
  .shell {
    display: block;
  }
}
</style>
