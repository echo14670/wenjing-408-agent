<script setup>
import StepDetailCard from './StepDetailCard.vue'
defineProps({
  steps: { type: Array, required: true },
  activeIndex: { type: Number, required: true }
})
defineEmits(['select'])
</script>

<template>
  <section class="timeline" aria-label="分步提示">
    <div
      v-for="(step, i) in steps"
      :key="step.index"
      class="clickable"
      :class="{ 'is-active': activeIndex === i }"
      role="button"
      tabindex="0"
      @click="$emit('select', i)"
      @keydown.enter="$emit('select', i)"
      @keydown.space.prevent="$emit('select', i)"
    >
      <StepDetailCard :step="step" :active="activeIndex === i" :done="i < activeIndex" :last="i === steps.length - 1" />
    </div>
  </section>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
}

.clickable {
  border-radius: 10px;
  transition: background var(--wj-dur) var(--wj-ease);
}

.clickable:hover {
  background: rgba(244, 246, 251, 0.7);
}

.clickable.is-active {
  background: transparent;
}
</style>
