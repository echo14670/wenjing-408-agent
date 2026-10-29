<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  actions: { type: Boolean, default: true }
})
</script>

<template>
  <header class="header">
    <div class="titles">
      <h1 class="title">{{ title }}</h1>
      <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="actions" class="actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: var(--wj-header-h);
  padding: 0 32px;
  background: rgba(244, 246, 251, 0.92);
  backdrop-filter: saturate(160%) blur(6px);
  border-bottom: 1px solid var(--wj-divider);
}

.titles {
  min-width: 0;
}

.title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--wj-primary-text);
}

.subtitle {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--wj-text-3);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

@media (max-width: 720px) {
  .header {
    padding: 0 18px;
    height: auto;
    min-height: var(--wj-header-h);
    flex-wrap: wrap;
    padding-block: 12px;
  }
}
</style>
