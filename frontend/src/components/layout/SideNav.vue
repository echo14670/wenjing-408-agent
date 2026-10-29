<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PATH } from '@/constants/routes'
import { useWjHistoryStore } from '@/store/wjHistory'
const route = useRoute()
const router = useRouter()
const history = useWjHistoryStore()
const items = [
  { path: PATH.entry, label: '提问', hint: '输入题目或概念', icon: 'search' },
  { path: PATH.answer, label: '答案页', hint: '核验解析与答案', icon: 'answer' },
  { path: PATH.steps, label: '步骤页', hint: '分步提示', icon: 'steps' },
  { path: PATH.teaching, label: '教学模式', hint: '完整讲解与依据', icon: 'teach' }
]
const activePath = computed(() => route.path)
/** 切页时把 q / mock / mode 带过去，保证演示链路不中断 */
function go(path) {
  const query = {}
  if (typeof route.query.q === 'string') query.q = route.query.q
  if (typeof route.query.mock === 'string') query.mock = route.query.mock
  if (typeof route.query.mode === 'string') query.mode = route.query.mode
  router.push({ path, query })
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
      <p class="group-label">我的学习空间</p>
      <button
        v-for="item in items"
        :key="item.path"
        type="button"
        class="item"
        :class="{ active: activePath === item.path }"
        :aria-current="activePath === item.path ? 'page' : undefined"
        @click="go(item.path)"
      >
        <span class="icon" aria-hidden="true">
          <svg v-if="item.icon === 'search'" viewBox="0 0 24 24" width="16" height="16" fill="none">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.6" />
            <path d="M16 16l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <svg v-else-if="item.icon === 'answer'" viewBox="0 0 24 24" width="16" height="16" fill="none">
            <path d="M5 5.5h14v10H9l-4 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          </svg>
          <svg v-else-if="item.icon === 'steps'" viewBox="0 0 24 24" width="16" height="16" fill="none">
            <circle cx="6" cy="6.5" r="1.8" stroke="currentColor" stroke-width="1.5" />
            <circle cx="6" cy="12" r="1.8" stroke="currentColor" stroke-width="1.5" />
            <circle cx="6" cy="17.5" r="1.8" stroke="currentColor" stroke-width="1.5" />
            <path
              d="M10.5 6.5h8M10.5 12h8M10.5 17.5h8"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none">
            <path
              d="M4.5 6.5h15M4.5 12h11M4.5 17.5h8"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <span class="labels">
          <span class="label">{{ item.label }}</span>
          <span class="hint">{{ item.hint }}</span>
        </span>
      </button>
    </nav>

    <div class="footer">
      <p class="foot-label">本地记录</p>
      <p class="foot-value">
        <strong>{{ history.index.length }}</strong> 条问答
        <span v-if="!history.storageOk" class="warn">（存储不可用）</span>
      </p>
      <p class="foot-note">资料与记录仅保存在本浏览器</p>
    </div>
  </aside>
</template>

<style scoped>
.nav {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--wj-nav-w);
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
  border-radius: 9px;
  background: var(--wj-primary);
  color: #fff;
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
  color: #fff;
  letter-spacing: 0.02em;
}

.brand-text small {
  font-size: 11px;
  color: #7c8ba6;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-label {
  padding: 0 8px 8px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #64748b;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 9px;
  text-align: left;
  color: var(--wj-nav-text);
  transition: background var(--wj-dur) var(--wj-ease);
}

.item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.item.active {
  background: var(--wj-nav-active);
  color: var(--wj-nav-text-active);
}

.icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.06);
  flex: none;
}

.item.active .icon {
  background: rgba(47, 90, 224, 0.9);
}

.labels {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  min-width: 0;
}

.label {
  font-size: 13.5px;
  font-weight: 500;
}

.hint {
  font-size: 11px;
  color: #74829a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item.active .hint {
  color: #a9b8d4;
}

.footer {
  margin-top: auto;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

.foot-label {
  font-size: 11px;
  color: #64748b;
}

.foot-value {
  margin-top: 3px;
  font-size: 13px;
  color: #dbe3f0;
}

.foot-value strong {
  font-size: 16px;
  color: #fff;
}

.warn {
  color: #f0b34a;
  font-size: 11px;
}

.foot-note {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: #5c6b84;
}

@media (max-width: 1100px) {
  .nav {
    width: 72px;
    padding: 18px 10px;
  }
  .brand-text,
  .labels,
  .group-label,
  .footer {
    display: none;
  }
  .item {
    justify-content: center;
    padding: 10px;
  }
}
</style>
