<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../copy/en'
import { ghs, ghsWhole, percentChange, shortDate } from '../lib/format'

type Point = { day: string; savingsGhs: number; keptInCedisGhs: number }
const props = defineProps<{ points: Point[] }>()

const W = 318, H = 128, PLOT_W = 282
const GRID = [20, 60, 100]

const first = computed(() => props.points[0]!)
const last = computed(() => props.points[props.points.length - 1]!)
const single = computed(() => props.points.length === 1)

const scale = computed(() => {
  const all = props.points.flatMap((p) => [p.savingsGhs, p.keptInCedisGhs])
  let min = Math.min(...all), max = Math.max(...all)
  if (max === min) { max = max * 1.02 + 1; min = min * 0.98 }
  const pad = (max - min) * 0.05
  min -= pad; max += pad
  return { min, max }
})
const y = (v: number) => {
  const { min, max } = scale.value
  return H - 8 - ((v - min) / (max - min)) * (H - 28)
}
const x = (i: number) => (props.points.length === 1 ? PLOT_W : (i / (props.points.length - 1)) * PLOT_W)
const line = (key: 'savingsGhs' | 'keptInCedisGhs') => props.points.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')
const gridValue = (gy: number) => {
  const { min, max } = scale.value
  return max - ((gy - 20) / (H - 28)) * (max - min)
}

const caption = computed(() => {
  if (single.value) return t('home.captionFirstDay')
  const diff = last.value.savingsGhs - last.value.keptInCedisGhs
  const rel = last.value.keptInCedisGhs ? diff / last.value.keptInCedisGhs : 0
  if (rel > 0.005) return t('home.captionCediFell')
  if (rel < -0.005) return t('home.captionCediRose')
  return t('home.captionFlat')
})
const aria = computed(() => t('home.chartAria', { savings: ghs(last.value.savingsGhs), kept: ghs(last.value.keptInCedisGhs) }))
const savingsChange = computed(() => percentChange(first.value.savingsGhs, last.value.savingsGhs))
const keptChange = computed(() => percentChange(first.value.keptInCedisGhs, last.value.keptInCedisGhs))
const positive = computed(() => last.value.savingsGhs >= first.value.savingsGhs)
</script>

<template>
  <section class="card" :aria-label="t('home.chartTitle')">
    <div class="head">
      <h2>{{ t('home.chartTitle') }}</h2>
      <div class="small muted">{{ t('home.chartRange', { start: shortDate(first.day) }) }}</div>
    </div>
    <div class="small muted sub">{{ t('home.chartSub') }}</div>
    <svg :width="W" :height="H" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="aria" class="chart">
      <g v-for="gy in GRID" :key="gy">
        <line x1="0" :y1="gy" :x2="PLOT_W" :y2="gy" stroke="#E6DCC7" stroke-width="1" />
        <text :x="W" :y="gy + 4" text-anchor="end" font-size="11" fill="#545A49" font-family="Public Sans, sans-serif">{{ Math.round(gridValue(gy)).toLocaleString('en-US') }}</text>
      </g>
      <template v-if="single">
        <circle :cx="PLOT_W" :cy="y(first.keptInCedisGhs)" r="4" fill="#8A8572" />
        <circle :cx="PLOT_W" :cy="y(first.savingsGhs)" r="4.5" fill="#9C3A22" />
      </template>
      <template v-else>
        <polyline :points="line('keptInCedisGhs')" fill="none" stroke="#8A8572" stroke-width="2" stroke-dasharray="5 5" />
        <polyline :points="line('savingsGhs')" fill="none" stroke="#9C3A22" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        <circle :cx="PLOT_W" :cy="y(last.savingsGhs)" r="4.5" fill="#9C3A22" />
      </template>
    </svg>
    <div class="legend">
      <div class="row">
        <span class="swatch solid" aria-hidden="true"></span>
        <span class="name">{{ t('home.legendSavings') }}</span>
        <span class="val">{{ ghsWhole(last.savingsGhs).replace('GH₵ ', '') }}</span>
        <span class="pct" :class="{ up: positive, down: !positive }">{{ savingsChange }}</span>
      </div>
      <div class="row muted">
        <span class="swatch dashed" aria-hidden="true"></span>
        <span class="name">{{ t('home.legendKept') }}</span>
        <span class="val">{{ ghsWhole(last.keptInCedisGhs).replace('GH₵ ', '') }}</span>
        <span class="pct">{{ keptChange }}</span>
      </div>
    </div>
    <p class="small muted caption">{{ caption }}</p>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
h2 { font-size: 18px; }
.sub { margin-top: 2px; }
.chart { display: block; margin-top: 10px; max-width: 100%; height: auto; }
.legend { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; font-size: 14px; }
.row { display: flex; align-items: center; gap: 10px; }
.name { flex: 1; }
.val { font-family: var(--font-display); font-weight: 700; }
.pct { width: 52px; text-align: right; font-weight: 700; }
.pct.up { color: var(--grow); }
.pct.down { color: var(--stamp); }
.row.muted .pct { font-weight: 400; }
.swatch { width: 20px; display: inline-block; flex: none; }
.swatch.solid { height: 3px; background: var(--stamp); }
.swatch.dashed { height: 0; border-top: 2px dashed var(--neutral-line); }
.caption { margin-top: 12px; }
</style>
