<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string        // "$20"
  line: string         // "8 NOV · RENT ADVANCE": the date, then the goal
  size?: number        // px, default 104
  pending?: boolean
  press?: boolean
  aria: string
}>()

const px = computed(() => props.size ?? 104)
const big = computed(() => px.value > 140)
// The date and the goal each get their own line so a long goal never spills past the rim.
const lines = computed(() => props.line.split(' · '))
</script>

<template>
  <div
    class="stamp-mark"
    :class="{ pending, press }"
    role="img"
    :aria-label="aria"
    :style="{ width: `${px}px`, height: `${px}px`, borderWidth: big ? '4px' : '3px' }"
  >
    <div class="amt" :style="{ fontSize: `${Math.round(px * 0.27)}px` }">{{ label }}</div>
    <div
      v-for="(part, i) in lines" :key="i" class="line" :class="{ goal: i > 0 }"
      :style="{ fontSize: `${big ? 12 : i > 0 ? 9 : 10}px`, letterSpacing: big ? '1.4px' : i > 0 ? '0.6px' : '1.2px' }"
    >{{ part }}</div>
  </div>
</template>
