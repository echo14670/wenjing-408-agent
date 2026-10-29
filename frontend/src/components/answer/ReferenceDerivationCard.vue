<script setup>
import AppBadge from '@/components/common/AppBadge.vue'
import SegmentBar from './SegmentBar.vue'
import StepRow from './StepRow.vue'
defineProps({
  steps: { type: Array, required: true },
  segments: { type: Array, default: () => [] },
  note: { type: String, default: '' },
  caption: { type: String, default: '预设演示内容' },
  title: { type: String, default: '参考推导' },
  sample: { type: Boolean, default: false }
})
</script>

<template>
  <section class="card">
    <header class="head">
      <h2 class="title">{{ title }}</h2>
      <div class="right">
        <AppBadge v-if="sample" tone="blue">示例</AppBadge>
        <span v-if="caption" class="caption">{{ caption }}</span>
      </div>
    </header>

    <div class="steps">
      <StepRow v-for="s in steps" :key="s.index" :index="s.index" :title="s.title" :formula="s.formula" />
    </div>

    <p v-if="note" class="note">{{ note }}</p>

    <SegmentBar v-if="segments.length" :segments="segments" class="bar" />
  </section>
</template>

<style scoped>
.card {
  padding: 18px 22px 20px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-subtle);
  border: 1px solid var(--wj-border);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wj-text);
}

.right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.caption {
  font-size: 11.5px;
  color: var(--wj-text-3);
}

.steps {
  margin-top: 2px;
}

.note {
  margin-top: 10px;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--wj-text-2);
}

.bar {
  margin-top: 14px;
}
</style>
