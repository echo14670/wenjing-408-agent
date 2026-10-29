<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SCENARIO_OPTIONS } from '@/mock/scenarios'
import { useUiStore } from '@/store/ui'
import { useSessionStore } from '@/store/session'
/**
 * 开发态场景切换器。
 * 只在 dev + VITE_MOCK_PANEL 时渲染，用于逐格验收 8 种 UI 状态。
 * 切换时同步写 URL query，刷新/分享链接都能复现同一个状态。
 */
const ui = useUiStore()
const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const open = ref(false)
const current = computed(() => SCENARIO_OPTIONS.find((o) => o.value === ui.scenario))
const patches = computed(() => session.result?.patchedFields ?? [])
function pick(value) {
  ui.setScenario(value)
  const query = { ...route.query, mock: value }
  router.replace({ path: route.path, query })
}
</script>

<template>
  <div class="panel" :class="{ open }">
    <button type="button" class="trigger" @click="open = !open">
      <span class="dot" aria-hidden="true" />
      <span v-if="open">收起场景面板</span>
      <span v-else>场景：{{ current?.label }}</span>
    </button>

    <div v-if="open" class="body">
      <p class="hint">auto 跟随当前接口模式；其他场景为本地演示数据。</p>
      <ul class="list">
        <li v-for="opt in SCENARIO_OPTIONS" :key="opt.value">
          <button type="button" class="opt" :class="{ active: ui.scenario === opt.value }" @click="pick(opt.value)">
            <span class="label">{{ opt.label }}</span>
            <span class="opt-hint">{{ opt.hint }}</span>
          </button>
        </li>
      </ul>

      <div class="meta">
        <p><span class="k">match_type</span>{{ session.result?.rawMatchType ?? '—' }}</p>
        <p><span class="k">归一化</span>{{ session.result?.matchType ?? '—' }}</p>
        <p><span class="k">兜底字段</span>{{ patches.length ? patches.join('、') : '无' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  position: fixed;
  right: 20px;
  bottom: 76px;
  z-index: 80;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: #0f1b2e;
  color: #dbe3f0;
  font-size: 12px;
  box-shadow: 0 6px 20px rgba(15, 27, 46, 0.24);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4ade80;
}

.body {
  width: 280px;
  padding: 12px;
  border-radius: 12px;
  background: #0f1b2e;
  color: #c7d2e4;
  box-shadow: 0 12px 36px rgba(15, 27, 46, 0.3);
  max-height: 62vh;
  overflow: auto;
}

.hint {
  font-size: 11px;
  line-height: 1.5;
  color: #7c8ba6;
  margin-bottom: 8px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.opt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 7px;
  text-align: left;
  color: #c7d2e4;
}

.opt:hover {
  background: rgba(255, 255, 255, 0.07);
}

.opt.active {
  background: rgba(47, 90, 224, 0.9);
  color: #fff;
}

.label {
  font-size: 12.5px;
  font-weight: 500;
}

.opt-hint {
  font-size: 10.5px;
  color: #7c8ba6;
}

.opt.active .opt-hint {
  color: #cdd9f6;
}

.meta {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 10.5px;
  line-height: 1.7;
  color: #9fb0c9;
  word-break: break-all;
}

.k {
  display: inline-block;
  min-width: 62px;
  color: #6c7f9c;
}
</style>
