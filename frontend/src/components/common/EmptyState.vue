<script setup>
import AppButton from './AppButton.vue'
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: String, default: 'empty' },
  actionText: { type: String, default: '' }
})
defineEmits(['action'])
</script>

<template>
  <div class="empty">
    <div class="icon" aria-hidden="true">
      <svg v-if="icon === 'search'" viewBox="0 0 24 24" width="26" height="26" fill="none">
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.6" />
        <path d="M16 16l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <svg v-else-if="icon === 'doc'" viewBox="0 0 24 24" width="26" height="26" fill="none">
        <path d="M6 3.5h7l5 5v12H6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
        <path d="M13 3.5v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="26" height="26" fill="none">
        <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" stroke-width="1.6" />
        <path d="M8 12h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </div>
    <p class="title">{{ title }}</p>
    <p v-if="description" class="desc">{{ description }}</p>
    <AppButton v-if="actionText" variant="outline" size="sm" @click="$emit('action')">
      {{ actionText }}
    </AppButton>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 44px 24px;
  text-align: center;
}

.icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--wj-bg-accent);
  color: var(--wj-primary);
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wj-text);
}

.desc {
  max-width: 380px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--wj-text-3);
}
</style>
