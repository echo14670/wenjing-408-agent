<script setup>
import AppBadge from '@/components/common/AppBadge.vue'
import AppButton from '@/components/common/AppButton.vue'
import { computed } from 'vue'
const props = defineProps({
  expanded: { type: Boolean, required: true },
  lines: { type: Array, required: true },
  title: { type: String, default: '先尝试，再核对' },
  description: { type: String, default: '参考答案默认收起，按需主动展开' },
  reviewState: { type: String, default: 'unverified' },
  missing: { type: Boolean, default: false }
})
const emit = defineEmits(['update:expanded', 'toggle'])
const buttonText = computed(() => (props.expanded ? '收起参考答案' : '查看参考答案'))
function toggle() {
  const next = !props.expanded
  emit('update:expanded', next)
  emit('toggle', next)
}
</script>

<template>
  <section class="card" :class="{ open: expanded, missing }">
    <header class="head">
      <div class="left">
        <h2 class="title">
          {{ missing ? '题库暂无参考答案' : title }}
        </h2>
        <p class="desc">{{ missing ? '以下结论来自模型推断，请自行核对。' : description }}</p>
      </div>
      <div class="right">
        <AppBadge v-if="reviewState === 'unverified'" tone="amber">待核验</AppBadge>
        <AppBadge v-else-if="reviewState === 'verified'" tone="teal">已核验</AppBadge>
        <AppButton size="sm" @click="toggle">{{ buttonText }}</AppButton>
      </div>
    </header>

    <div class="wrap" :class="{ open: expanded }">
      <div v-if="expanded" class="inner">
        <div class="content">
          <ul class="lines">
            <li v-for="line in lines" :key="line">
              <span class="tick" aria-hidden="true" />
              <span>{{ line }}</span>
            </li>
          </ul>
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  padding: 16px 20px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  box-shadow: var(--wj-shadow-1);
  transition: border-color var(--wj-dur) var(--wj-ease);
}

.card.open {
  border-color: #cdd9f6;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wj-text);
}

.desc {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--wj-text-3);
}

.right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

/* 用 grid-template-rows 0fr→1fr 过渡，避免测高带来的抖动 */
.wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 240ms var(--wj-ease);
}

.wrap.open {
  grid-template-rows: 1fr;
}

.inner {
  overflow: hidden;
}

.content {
  padding-top: 14px;
  margin-top: 14px;
  border-top: 1px solid var(--wj-divider);
}

.lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lines li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14.5px;
  line-height: 1.7;
  color: var(--wj-text);
}

.tick {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--wj-primary);
  flex: none;
  margin-top: 9px;
}
</style>
