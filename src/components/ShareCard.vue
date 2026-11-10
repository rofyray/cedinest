<script setup lang="ts">
import Brand from './Brand.vue'
import { computed, ref } from 'vue'
import { ROTATIONS } from '../../shared/stamps.js'
import { t } from '../copy/en.js'
import { monthNameLong } from '../lib/format.js'
import { canvasToBlob, drawShareImage } from '../lib/share-image.js'

const props = defineProps<{
  name: string | null
  goalName: string | null
  percent: number | null
  stamps: { day: string; usd: string }[]
  today?: Date
}>()

const showName = ref(true)
const busy = ref(false)
const fallbackUrl = ref('')

const today = computed(() => props.today ?? new Date())
const stampedDays = computed(() => [...new Set(props.stamps.map((s) => Number(s.day.slice(8, 10))))].sort((a, b) => a - b))
const count = computed(() => stampedDays.value.length)
const goalShort = computed(() => (props.goalName ? props.goalName.split(',')[0]!.trim().toLowerCase() : null))
const headline = computed(() => {
  const name = showName.value && props.name ? props.name : null
  if (goalShort.value) return name ? t('share.cardName', { name, goal: goalShort.value }) : t('share.cardNoName', { goal: goalShort.value })
  return name ? t('share.cardNameNoGoal', { name }) : t('share.cardNoGoal')
})
const stampsLine = computed(() => (count.value === 1 ? t('share.stampsOne') : t('share.stamps', { count: count.value })))
const monthLabel = computed(() => t('share.monthCard', { month: monthNameLong(today.value) }))

async function share() {
  busy.value = true
  try {
    const daysInMonth = new Date(Date.UTC(today.value.getUTCFullYear(), today.value.getUTCMonth() + 1, 0)).getUTCDate()
    const canvas = await drawShareImage({
      headline: `${headline.value}.`, percent: props.percent ?? 0, stampedDays: stampedDays.value, daysInMonth,
      monthLabel: monthLabel.value, stampsLine: stampsLine.value,
    })
    const blob = await canvasToBlob(canvas)
    const file = new File([blob], 'cedinest-card.png', { type: 'image/png' })
    const nav = navigator as any
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      try { await nav.share({ files: [file], title: t('brand.name'), text: t('share.imageLine') }); return } catch (e: any) {
        if (e?.name === 'AbortError') return
      }
    }
    fallbackUrl.value = URL.createObjectURL(blob)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="share" :aria-label="t('share.title')">
    <h2>{{ t('share.title') }}</h2>
    <div class="card preview" :aria-label="t('share.previewAria')" data-testid="share-preview">
      <div class="head"><Brand size="small" class="small-brand" /><span class="small muted">{{ monthLabel }}</span></div>
      <div class="headline">{{ headline }}</div>
      <div class="dots" aria-hidden="true">
        <span v-for="(d, i) in stampedDays.slice(0, 6)" :key="d" class="dot stamped" :style="{ transform: `rotate(${ROTATIONS[i % ROTATIONS.length]}deg)` }"></span>
        <span v-for="i in Math.max(1, 7 - Math.min(6, stampedDays.length))" :key="`e${i}`" class="dot"></span>
      </div>
      <div><strong v-if="percent != null">{{ t('share.percent', { percent }) }}</strong><template v-if="percent != null"> · </template>{{ stampsLine }}</div>
    </div>
    <label v-if="name" class="checkbox"><input v-model="showName" type="checkbox" /> {{ t('share.showName') }}</label>
    <p class="small muted">{{ t('share.privacy') }}</p>
    <button class="btn btn-primary" type="button" :disabled="busy" data-testid="share-btn" @click="share">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"></path><path d="M12 3v12"></path><path d="M7 8l5-5 5 5"></path></svg>
      {{ busy ? t('share.preparing') : t('share.cta') }}
    </button>
    <div v-if="fallbackUrl" class="fallback" role="dialog" :aria-label="t('share.title')">
      <img :src="fallbackUrl" :alt="headline" data-testid="share-image" />
      <p>{{ t('share.fallback') }}</p>
      <button class="btn btn-secondary" type="button" @click="fallbackUrl = ''">{{ t('share.close') }}</button>
    </div>
  </section>
</template>

<style scoped>
.share { display: flex; flex-direction: column; gap: 10px; }
h2 { font-size: 18px; }
.preview { display: flex; flex-direction: column; gap: 10px; padding: 16px; }
.head { display: flex; justify-content: space-between; align-items: center; }
.small-brand { font-size: 16px; }
.headline { font-family: var(--font-display); font-weight: 700; font-size: 24px; line-height: 1.1; }
.dots { display: flex; gap: 6px; }
.dot { width: 30px; height: 30px; border-radius: 50%; border: 1px dashed var(--dash); display: inline-block; }
.dot.stamped { border: 2px solid var(--stamp); }
.fallback { position: fixed; inset: 0; background: rgba(35, 48, 31, 0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; z-index: 10; color: var(--card); text-align: center; }
.fallback img { max-height: 70dvh; max-width: 100%; border-radius: 12px; }
.fallback .btn { max-width: 240px; color: var(--card); border-color: var(--card); }
</style>
