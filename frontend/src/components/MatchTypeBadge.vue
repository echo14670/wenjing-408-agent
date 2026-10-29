<script setup>
import { computed } from 'vue'
import { MATCH_TYPE_META } from '../config/mock'

const props = defineProps({
  type: { type: String, default: 'unknown' }
})

const meta = computed(() => MATCH_TYPE_META[props.type] || { label: props.type || '未知', cls: 'neutral' })
</script>

<template>
  <span class="badge" :class="`badge-${meta.cls}`">{{ meta.label }}</span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  border-radius: 999px;
  padding: 5px 12px;
  white-space: nowrap;
}
.badge-success { color: var(--c-success); background: var(--c-success-bg); border: 1px solid #bbe7c9; }
.badge-warning { color: var(--c-warning); background: var(--c-warning-bg); border: 1px solid #f5d9a8; }
.badge-danger  { color: var(--c-danger);  background: var(--c-danger-bg);  border: 1px solid #f3c1c1; }
.badge-neutral { color: var(--c-text-2);  background: var(--c-bg);         border: 1px solid var(--c-border); }
</style>
