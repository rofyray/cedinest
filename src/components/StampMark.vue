<script setup lang="ts">
defineProps<{
  label: string        // "$20"
  line: string         // "8 NOV · RENT"
  size?: number        // px, default 104
  pending?: boolean
  press?: boolean
  aria: string
}>()
</script>

<template>
  <div
    class="stamp-mark"
    :class="{ pending, press }"
    role="img"
    :aria-label="aria"
    :style="{ width: `${size ?? 104}px`, height: `${size ?? 104}px`, borderWidth: (size ?? 104) > 140 ? '4px' : '3px' }"
  >
    <div class="amt" :style="{ fontSize: `${Math.round((size ?? 104) * 0.27)}px` }">{{ label }}</div>
    <div class="line" :style="{ fontSize: `${(size ?? 104) > 140 ? 12 : 10}px`, letterSpacing: (size ?? 104) > 140 ? '1.4px' : '1.2px' }">{{ line }}</div>
  </div>
</template>
