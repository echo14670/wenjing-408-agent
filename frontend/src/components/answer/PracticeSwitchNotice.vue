<script setup>
/**
 * 切题后的隔离说明。
 *
 * 为什么要把"隔离了什么"显式列出来：切题最容易出的 bug 不是崩溃，而是串味——
 * 旧题的作答、旧题的引用、旧题展开的答案悄悄留到了新题上。
 * 把审计结果摆在页面上，QA 一眼就能验收，用户也知道自己的记录没被覆盖。
 */
import AppBadge from '@/components/common/AppBadge.vue'
import { summarizeStem } from '@/utils/practice'
import { computed } from 'vue'
const props = defineProps({
  lastSwitch: { type: Object, required: true }
})
defineEmits(['dismiss'])
const modeLabel = computed(() => (props.lastSwitch?.mode === 'direct' ? '直接讲解' : '引导模式'))
/** 题干前 30 字经常撞车（同一考点题面开头都一样），所以优先用题库编号标识两题 */
const fromLabel = computed(
  () => props.lastSwitch?.from?.questionId || summarizeStem(props.lastSwitch?.from?.stem ?? '', 16) || '上一题'
)
const toLabel = computed(
  () => props.lastSwitch?.to?.questionId || summarizeStem(props.lastSwitch?.to?.stem ?? '', 16) || '当前题'
)
const audit = computed(() => props.lastSwitch?.audit ?? { items: [], clearedCount: 0 })
</script>

<template>
  <section class="switch" role="status">
    <header class="head">
      <AppBadge tone="teal">已切题</AppBadge>
      <p class="title">新题已就位，教学模式保持「{{ modeLabel }}」</p>
      <button type="button" class="close" aria-label="关闭切题说明" @click="$emit('dismiss')">×</button>
    </header>

    <p class="flow">
      <span class="tag">上一题</span>
      <span class="qid" :title="lastSwitch?.from?.stem">{{ fromLabel }}</span>
      <span class="arrow" aria-hidden="true">→</span>
      <span class="tag current">当前题</span>
      <span class="qid current-id" :title="lastSwitch?.to?.stem">{{ toLabel }}</span>
    </p>

    <ul class="chips">
      <li v-for="item in audit.items" :key="item.key" :class="{ active: item.cleared }">
        <span class="tick" aria-hidden="true">{{ item.cleared ? '✓' : '·' }}</span>
        <span><b>{{ item.label }}</b>：{{ item.detail }}</span>
      </li>
    </ul>

    <p class="note">
      新题的追问、作答与工具结果从空白开始，旧题记录仍可在本地历史里找回。
    </p>
  </section>
</template>

<style scoped>
.switch {
  padding: 13px 16px 12px;
  border-radius: var(--wj-r-md);
  background: var(--wj-teal-weak);
  border-left: 3px solid var(--wj-teal);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title {
  flex: 1;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--wj-success-text);
}

.close {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--wj-text-3);
  font-size: 15px;
  line-height: 1;
}

.close:hover {
  background: rgba(15, 118, 110, 0.1);
  color: var(--wj-success-text);
}

.flow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 7px;
  font-size: 12.5px;
  color: var(--wj-text-2);
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 6px;
  border-radius: 5px;
  background: rgba(15, 118, 110, 0.09);
  color: var(--wj-success-text);
  font-size: 11px;
}

.qid {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--wj-font-mono);
  font-size: 11.5px;
  color: var(--wj-text-3);
}

.current-id {
  color: var(--wj-text);
  font-weight: 500;
}

.arrow {
  color: var(--wj-teal);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 9px;
}

.chips li {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--wj-text-3);
}

.chips li.active {
  color: var(--wj-text-2);
}

.tick {
  flex: none;
  font-size: 11px;
  color: var(--wj-text-3);
}

.chips li.active .tick {
  color: var(--wj-success-text);
}

.chips b {
  font-weight: 600;
  color: inherit;
}

.note {
  margin-top: 8px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--wj-text-3);
}
</style>
