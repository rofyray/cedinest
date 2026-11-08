<script setup lang="ts">
defineProps<{ title?: string; body: string }>()
</script>

<template>
  <div class="error" role="alert" data-testid="error-note">
    <strong v-if="title">{{ title }}</strong>
    {{ body }}
  </div>
</template>
