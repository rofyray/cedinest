<script setup lang="ts">
import { computed } from 'vue'
import { monthCells, type Stamp } from '../../shared/stamps.js'
import { t } from '../copy/en.js'
import { monthNameLong, usdShort } from '../lib/format.js'

const props = defineProps<{ stamps: Stamp[]; today?: Date }>()

const today = computed(() => props.today ?? new Date())
const cells = computed(() => monthCells(today.value.getUTCFullYear(), today.value.getUTCMonth(), props.stamps, today.value))
const count = computed(() => props.stamps.length)
const total = computed(() => props.stamps.reduce((s, x) => s + Number(x.usd), 0))
const summary = computed(() => {
  if (count.value === 0) return t('home.cardSummaryNone')
  if (count.value === 1) return t('home.cardSummaryOne', { usd: usdShort(total.value) })
  return t('home.cardSummary', { count: count.value, usd: usdShort(total.value) })
})
</script>

<template>
  <section class="card" :aria-label="t('home.cardTitle', { month: monthNameLong(today) })">
    <div class="head">
      <h2>{{ t('home.cardTitle', { month: monthNameLong(today) }) }}</h2>
      <div class="small muted" data-testid="stamp-summary">{{ summary }}</div>
    </div>
    <div class="grid">
      <div v-for="c in cells" :key="c.n" class="cell" :class="{ today: c.isToday, stamped: !!c.stamp }">
        <span class="n">{{ c.n }}</span>
        <span v-if="c.stamp" class="stamp" :style="{ transform: `rotate(${c.stamp.rotate}deg)` }">{{ c.stamp.label }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; gap: 8px; }
h2 { font-size: 18px; }
.grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
.cell { position: relative; height: 46px; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 1px dashed var(--dash); }
.cell.today { border: 2px solid var(--ink); background: var(--card-today); }
.n { position: absolute; top: 3px; left: 5px; font-size: 10px; color: var(--muted); font-weight: 600; }
.stamp { width: 34px; height: 34px; border: 2px solid var(--stamp); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--stamp); font-family: var(--font-display); font-weight: 700; font-size: 12px; margin-top: 6px; }
</style>
