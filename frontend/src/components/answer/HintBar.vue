<script setup>
defineProps({
  text: { type: String, required: true }
})
</script>

<template>
  <div class="hint" role="note">
    <span class="mark" aria-hidden="true" />
    <p>{{ text }}</p>
  </div>
</template>

<style scoped>
.hint {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 11px 14px;
  border-radius: 0 8px 8px 0;
  border-left: 3px solid var(--wj-teal);
  background: var(--wj-teal-weak);
}

.mark {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--wj-teal);
  margin-top: 9px;
  flex: none;
}

p {
  font-size: 14px;
  line-height: 1.75;
  color: var(--wj-text-2);
}
</style>
