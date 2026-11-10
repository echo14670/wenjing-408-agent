<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { isDemoMode, useMockStore } from '../store/mock'

const route = useRoute()
const mockStore = useMockStore()

const mockModeLabel = {
  backend: '真实后端',
  apifox: 'Apifox Mock',
  local: '演示样例 · 原题',
  original: '演示样例 · 原题',
  similar: '演示样例 · 相似题',
  miss: '演示样例 · 未命中'
}

// 只有显式选择演示/Mock 时才标“演示数据”，默认真实后端不能挂这个标
const demoMode = computed(() => isDemoMode(mockStore.mode) || mockStore.mode === 'apifox')
</script>

<template>
  <header class="top-bar">
    <div class="breadcrumb">
      <span class="crumb-root">学习工作台</span>
      <span class="crumb-sep">/</span>
      <span class="crumb-current">{{ route.meta.title || '知识问答' }}</span>
    </div>
    <div class="top-actions">
      <span class="chip chip-mock" :title="'数据来源：' + (mockModeLabel[mockStore.mode] || mockStore.mode)">
        {{ mockModeLabel[mockStore.mode] || mockStore.mode }}
      </span>
      <span class="chip">HTML交互原型</span>
      <span v-if="demoMode" class="chip chip-demo" title="当前使用演示/Mock 数据，不代表真实接口结果">演示数据</span>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--c-card);
  border-bottom: 1px solid var(--c-border);
}
.breadcrumb {
  font-size: 14px;
  color: var(--c-text-3);
}
.crumb-root {
  color: var(--c-text-2);
}
.crumb-sep {
  margin: 0 8px;
}
.crumb-current {
  color: var(--c-text);
  font-weight: 600;
}
.top-actions {
  display: flex;
  gap: 8px;
}
.chip {
  font-size: 12px;
  color: var(--c-text-2);
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  padding: 4px 12px;
}
.chip-mock {
  color: var(--c-primary);
  background: var(--c-primary-soft);
  border-color: #c6d8ff;
}
</style>
