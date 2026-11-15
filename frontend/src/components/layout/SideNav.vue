<script setup>
import { computed, onMounted, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { PATH, withQuery } from '@/constants/routes'
import { useWjHistoryStore } from '@/store/wjHistory'
import { isDemoMode, useMockStore } from '@/store/mock'
import { useUiStore } from '@/store/ui'
import { healthState, modelStatusHint, modelStatusLabel, refreshHealth } from '@/api/health'

const route = useRoute()
const history = useWjHistoryStore()
const mock = useMockStore()
const ui = useUiStore()

onMounted(() => { void refreshHealth() })
watch(() => route.path, () => { void refreshHealth() })

const modelLabel = computed(() => modelStatusLabel(healthState))
const modelHint = computed(() => modelStatusHint(healthState))
const demoMode = computed(() =>
  isDemoMode(mock.mode) || mock.mode === 'apifox' || (route.meta.studyScenario && ui.scenario !== 'auto')
)

const items = [
  { path: PATH.entry, label: '提问', icon: 'M16 16l4 4M17.5 11a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z' },
  { path: PATH.result, label: '检索结果', icon: 'M6 4h8l4 4v12H6V4ZM14 4v4h4M9 12h6M9 16h6' },
  { path: PATH.answer, label: '答案页', icon: 'M5 5.5h14v10H9l-4 3zM9 10.5h6' },
  { path: PATH.steps, label: '步骤页', icon: 'M5 6.5h2m3 0h9M5 12h2m3 0h9M5 17.5h2m3 0h9' },
  { path: PATH.teaching, label: '教学模式', icon: 'M12 6v13M12 6c-2-2-5-2-8-2v13c3 0 6 0 8 2 2-2 5-2 8-2V4c-3 0-6 0-8 2Z' },
  { path: PATH.history, label: '学习记录', icon: 'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0ZM12 7.5V12l3 1.5' },
  { path: PATH.materials, label: '我的资料', icon: 'M4 7h6l2 2h8v10H4V7Z' }
]

function linkTo(path) {
  return route.path === path ? route.fullPath : withQuery(path, route.query)
}
</script>

<template>
  <aside class="nav">
    <div class="brand">
      <span class="mark" aria-hidden="true">问</span>
      <span class="brand-text">
        <strong>问径</strong>
        <small>专业学科学习 Agent</small>
      </span>
    </div>

    <nav class="group" aria-label="主导航">
      <RouterLink
        v-for="item in items"
        :key="item.path"
        :to="linkTo(item.path)"
        :aria-label="item.label"
        :title="item.label"
        class="item"
      >
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path :d="item.icon" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="label">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="footer">
      <p class="foot-model" :class="'is-' + healthState.status" :title="modelHint">
        <span class="status-dot" aria-hidden="true"></span>
        <span>{{ modelLabel }}</span>
      </p>
      <p v-if="demoMode" class="demo-tag">演示数据</p>
      <div class="foot-record">
        <p class="foot-label">本地记录</p>
        <p class="foot-value">
          <strong>{{ history.index.length }}</strong> 条问答
          <span v-if="!history.storageOk" class="warn">（存储不可用）</span>
        </p>
        <p class="foot-note">资料与记录仅保存在本浏览器</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 22px 14px 18px;
  background: var(--wj-nav-bg);
  color: var(--wj-nav-text);
  z-index: 20;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px;
}

.mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 9px;
  background: var(--wj-primary);
  color: var(--wj-text-inverse);
  font-weight: 700;
  font-size: 17px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.brand-text strong {
  font-size: 16px;
  color: var(--wj-text-inverse);
}

.brand-text small {
  font-size: 11px;
}

.group {
  display: grid;
  gap: 4px;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 9px;
  color: var(--wj-nav-text);
  transition: background var(--wj-dur) var(--wj-ease);
}

.item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.item[aria-current='page'] {
  background: var(--wj-nav-active);
  color: var(--wj-nav-text-active);
}

.icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.06);
}

.item[aria-current='page'] .icon {
  background: var(--wj-primary);
}

.label {
  font-size: 13.5px;
  font-weight: 500;
}

.footer {
  margin-top: auto;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 11.5px;
}

.foot-model {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.status-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
}

.foot-model.is-connected {
  color: #7ee2c8;
}

.foot-model.is-unconfigured,
.warn,
.demo-tag {
  color: #f0b34a;
}

.demo-tag {
  margin-top: 6px;
}

.foot-record {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.14);
}

.foot-value {
  color: var(--wj-nav-text-active);
  font-size: 13px;
}

.foot-note {
  font-size: 11px;
}

@media (max-width: 1100px) {
  .nav {
    padding: 16px 8px;
    gap: 16px;
  }

  .brand,
  .item,
  .foot-model {
    justify-content: center;
  }

  .brand-text,
  .label,
  .foot-record {
    display: none;
  }

  .item {
    padding: 8px;
  }

  .footer {
    padding: 8px 4px;
    text-align: center;
    font-size: 10px;
  }

  .foot-model {
    flex-direction: column;
    gap: 4px;
  }
}

@media (max-width: 720px) {
  .nav {
    position: static;
    height: auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 42%);
    grid-template-areas: 'brand status' 'links links';
    gap: 8px;
    padding: 10px 12px;
  }

  .brand {
    grid-area: brand;
    justify-content: flex-start;
    padding: 0;
  }

  .brand-text {
    display: flex;
  }

  .brand-text small {
    display: none;
  }

  .group {
    grid-area: links;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .item {
    flex-direction: column;
    gap: 3px;
    padding: 5px 2px;
  }

  .label {
    display: block;
    font-size: 11.5px;
  }

  .footer {
    grid-area: status;
    align-self: center;
    margin: 0;
  }

  .foot-model {
    flex-direction: row;
  }
}
</style>
