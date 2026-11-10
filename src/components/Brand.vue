<script setup lang="ts">
/** The CediNest mark next to the wordmark. */
defineProps<{ size?: 'topbar' | 'small' | 'hero' }>()
</script>

<template>
  <span class="brand" :class="size ?? 'topbar'">
    <img class="mark" src="/logo-mark.png" alt="" width="595" height="482" decoding="async" />
    <span>Cedi<em>Nest</em></span>
  </span>
</template>

<style scoped>
.brand { display: inline-flex; align-items: center; gap: 8px; }
.mark { width: 34px; height: auto; flex: none; }
.small { gap: 6px; }
.small .mark { width: 24px; }
.hero { flex-direction: column; gap: 12px; font-size: 28px; }
.hero .mark { width: 120px; }
</style>
