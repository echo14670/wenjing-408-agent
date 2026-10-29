<script setup>
import { ref } from 'vue'
defineProps({
  step: { type: Object, required: true },
  active: { type: Boolean, required: true },
  done: { type: Boolean, required: true },
  last: { type: Boolean, required: true }
})
const showWhy = ref(false)
</script>

<template>
  <div class="step" :class="{ active, done }">
    <div class="rail">
      <span class="dot" aria-hidden="true">
        <svg v-if="done" viewBox="0 0 24 24" width="12" height="12" fill="none">
          <path
            d="M5 12.5l4.2 4.2L19 7"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <template v-else>{{ step.index }}</template>
      </span>
      <span v-if="!last" class="line" aria-hidden="true" />
    </div>

    <div class="body">
      <div class="title-row">
        <h3 class="title">{{ step.title }}</h3>
        <code v-if="step.formula" class="formula">{{ step.formula }}</code>
      </div>

      <p v-if="active" class="detail">{{ step.detail }}</p>

      <div v-if="active && step.hint" class="why">
        <button type="button" class="why-toggle" @click="showWhy = !showWhy">
          {{ showWhy ? '收起这一步的提示' : '这一步为什么这么算？' }}
        </button>
        <p v-if="showWhy" class="why-text">{{ step.hint }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 12px;
}

.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.dot {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--wj-border);
  background: var(--wj-bg-surface);
  color: var(--wj-text-3);
  font-family: var(--wj-font-mono);
  font-size: 11.5px;
  font-weight: 600;
  flex: none;
  transition:
    background var(--wj-dur) var(--wj-ease),
    border-color var(--wj-dur) var(--wj-ease),
    color var(--wj-dur) var(--wj-ease);
}

.done .dot {
  background: var(--wj-success-bg);
  border-color: transparent;
  color: var(--wj-success-text);
}

.active .dot {
  background: var(--wj-primary);
  border-color: transparent;
  color: #fff;
}

.line {
  flex: 1;
  width: 1px;
  min-height: 18px;
  background: var(--wj-border);
  margin: 4px 0;
}

.body {
  padding-bottom: 18px;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 24px;
}

.title {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--wj-text);
}

.done:not(.active) .title {
  color: var(--wj-text-2);
}

.formula {
  font-family: var(--wj-font-mono);
  font-size: 12.5px;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--wj-bg-chip);
  color: var(--wj-text);
}

.detail {
  margin-top: 8px;
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--wj-text-2);
}

.why {
  margin-top: 10px;
}

.why-toggle {
  font-size: 12.5px;
  color: var(--wj-primary-text);
}

.why-toggle:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.why-text {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  border-left: 3px solid var(--wj-teal);
  background: var(--wj-teal-weak);
  font-size: 13px;
  line-height: 1.75;
  color: var(--wj-text-2);
}
</style>
