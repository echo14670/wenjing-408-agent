<script setup>
import AppShell from './components/layout/AppShell.vue'
</script>

<template>
  <RouterView v-if="$route.meta.workbench" />
  <AppShell v-else>
    <RouterView />
  </AppShell>
</template>
