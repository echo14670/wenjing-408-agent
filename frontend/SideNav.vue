<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()

const mainNav = [
  { label: '知识问答', to: '/', icon: '💬' },
  { label: '我的资料', to: '/materials', icon: '📚' },
  { label: '学习记录', to: '/history', icon: '🕘' }
]

// 原型中的“试点建议与扩展”子项（规划内容，暂未接入路由）
const pilotItems = ['Cache地址划分', 'TLB与页表辨析', '其他知识·规划']

const isActive = (to) => route.path === to
</script>

<template>
  <aside class="side-nav">
    <div class="brand">
      <div class="brand-name">问径</div>
      <div class="brand-sub">专业学科知识学习Agent</div>
    </div>

    <nav class="nav">
      <div class="nav-group">我的学习空间</div>
      <RouterLink
        v-for="item in mainNav"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: isActive(item.to) }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </RouterLink>

      <div class="nav-group nav-group-margin">试点建议与扩展</div>
      <div v-for="p in pilotItems" :key="p" class="nav-item nav-item-pilot" :title="'试点内容，待接入'">
        <span class="nav-dot">·</span>
        <span>{{ p }}</span>
      </div>
    </nav>

    <div class="side-foot">
      <span class="dev-tag">交互演示 · 无模型连接</span>
    </div>
  </aside>
</template>

<style scoped>
.side-nav {
  width: 232px;
  flex-shrink: 0;
  background: var(--c-sidebar);
  color: var(--c-sidebar-text);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand {
  padding: 26px 24px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.brand-name {
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 2px;
}
.brand-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--c-sidebar-text);
}
.nav {
  flex: 1;
  padding: 18px 12px;
  overflow-y: auto;
}
.nav-group {
  font-size: 12px;
  color: var(--c-sidebar-text);
  opacity: 0.75;
  padding: 6px 12px 8px;
  letter-spacing: 1px;
}
.nav-group-margin {
  margin-top: 18px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  color: var(--c-sidebar-text);
  text-decoration: none;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
  cursor: pointer;
}
.nav-item:hover {
  background: var(--c-sidebar-hover);
  color: #fff;
}
.nav-item.active {
  background: var(--c-primary);
  color: #fff;
  font-weight: 600;
}
.nav-icon {
  width: 18px;
  text-align: center;
  filter: saturate(0.6);
}
.nav-item-pilot {
  font-size: 13px;
  opacity: 0.85;
  cursor: default;
}
.nav-dot {
  width: 18px;
  text-align: center;
  color: var(--c-primary);
  font-weight: 700;
}
.side-foot {
  padding: 14px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.dev-tag {
  display: inline-block;
  font-size: 11px;
  color: #7f93ab;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  padding: 4px 10px;
}
</style>
