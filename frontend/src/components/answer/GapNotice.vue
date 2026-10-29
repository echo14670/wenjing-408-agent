<script setup>
import AppBadge from '@/components/common/AppBadge.vue'
defineProps({
  items: { type: Array, default: () => ['未检索到教材页码', '未匹配到真题年份', '无题库核验解析可比对'] },
  title: { type: String, default: '依据不足，以下为模型推断' },
  note: { type: String, default: '按项目规则，未命中题库时模型可以尝试解题，但不会编造真题出处与教材页码。' }
})
</script>

<template>
  <section class="gap">
    <header class="head">
      <AppBadge tone="gray">依据缺口</AppBadge>
      <p class="title">{{ title }}</p>
    </header>
    <ul class="list">
      <li v-for="item in items" :key="item">
        <span class="dash" aria-hidden="true">–</span>
        <span>{{ item }}</span>
      </li>
    </ul>
    <p class="note">{{ note }}</p>
  </section>
</template>

<style scoped>
.gap {
  padding: 14px 18px;
  border-radius: var(--wj-r-md);
  background: var(--wj-warn-bg);
  border: 1px solid #f6e0bd;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--wj-warn-text);
}

.list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-top: 8px;
}

.list li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #7c4a03;
}

.dash {
  color: #b4700f;
}

.note {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.65;
  color: #8a5a12;
}
</style>
