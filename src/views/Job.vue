<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ErrorNote from '../components/ErrorNote.vue'
import GoalRow from '../components/GoalRow.vue'
import ShareCard from '../components/ShareCard.vue'
import StampMark from '../components/StampMark.vue'
import { t } from '../copy/en.js'
import { api, type Job } from '../lib/api.js'
import { pendingJob } from '../lib/flow.js'
import { rawToUsd, shortDate, stampLine, usd, usdShort, usdt } from '../lib/format.js'
import { displayName, loadSummary, store } from '../store.js'

const props = defineProps<{ id: string }>()
const router = useRouter()
const job = ref<Job | null>(null)
const loadError = ref('')
const pressed = ref(false)
const feeNim = ref<number | null>(null)
let timer: number | undefined

const isDeposit = computed(() => job.value?.kind !== 'withdraw')
const isMax = computed(() => job.value?.amountRaw === '115792089237316195423570985008687907853269984665640564039457584007913129639935')
const amountUsd = computed(() => {
  if (!job.value) return 0
  if (job.value.usdAmount) return Number(job.value.usdAmount)
  return isMax.value ? 0 : rawToUsd(job.value.amountRaw)
})
const goal = computed(() => store.summary?.goals.find((g) => g.id === job.value?.goalId) ?? null)
const done = computed(() => job.value?.status === 'done')
const failed = computed(() => job.value?.status === 'failed' || job.value?.status === 'refund_due')
const feeStep = computed<'done' | 'waiting'>(() => (job.value && job.value.status !== 'fee_pending' ? 'done' : 'waiting'))
const moveStep = computed<'done' | 'active' | 'queued'>(() => (done.value ? 'done' : job.value?.status === 'fee_pending' ? 'queued' : 'active'))
const explorer = computed(() => (job.value?.polygonTxHash ? `https://polygonscan.com/tx/${job.value.polygonTxHash}` : ''))
const addedPercent = computed(() => {
  if (!goal.value || !store.summary || amountUsd.value === 0) return 0
  return Math.min(goal.value.percent, Math.round(((amountUsd.value * store.summary.usdGhs) / goal.value.targetGhs) * 100))
})
const stampLabel = computed(() => usdShort(Math.round(amountUsd.value * 100) / 100))
const stampDate = computed(() => new Date(job.value?.updatedAt ?? Date.now()))
const errorCopy = computed(() => {
  if (!job.value) return ''
  const fee = feeNim.value ?? 50
  if (job.value.status === 'failed') return t('errors.feeInvalid')
  if (!job.value.error || /cancelled the signature/.test(job.value.error)) return t('errors.signCancelled', { fee })
  return isDeposit.value ? t('errors.relayFailed', { amount: usdShort(amountUsd.value), fee }) : t('errors.relayFailedTakeOut', { fee })
})

async function poll() {
  try {
    job.value = await api.job(props.id)
    loadError.value = ''
    if (['done', 'failed', 'refund_due'].includes(job.value.status)) {
      window.clearInterval(timer)
      pendingJob.clear()
    }
  } catch (e: any) {
    loadError.value = e?.code === 'not_found' ? t('errors.notFound') : t('errors.offline')
    if (e?.code === 'not_found') window.clearInterval(timer)
  }
}

watch(done, (d) => {
  if (d) {
    void loadSummary()
    requestAnimationFrame(() => { pressed.value = true })
  }
})

onMounted(() => {
  feeNim.value = store.summary?.fee[isDeposit.value ? 'deposit' : 'withdraw'].nim ?? null
  void poll()
  timer = window.setInterval(poll, 2_000)
  if (!store.summary) void loadSummary()
})
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <main class="screen job" :class="{ done }">
    <div class="topbar"><div class="brand">Cedi<em>Nest</em></div></div>

    <ErrorNote v-if="loadError" :body="loadError" />

    <template v-else-if="job && failed">
      <h1 class="title">{{ isDeposit ? t('pending.title') : t('takeOut.pendingTitle') }}</h1>
      <ErrorNote :body="errorCopy" />
      <button class="btn btn-secondary back" type="button" @click="router.replace('/')">{{ t('pending.back') }}</button>
    </template>

    <template v-else-if="job && done">
      <div class="done-head">
        <StampMark :label="stampLabel" :line="stampLine(stampDate, goal?.name)" :size="104" :press="pressed"
          :aria="t('pending.stampAria', { usd: amountUsd, date: shortDate(stampDate), goal: goal ? `, ${goal.name}` : '' })" />
        <div>
          <h1 class="done-title" data-testid="done-title">{{ isDeposit ? t('done.title') : t('takeOut.doneTitle', { usd: usd(amountUsd) }) }}</h1>
          <p v-if="isDeposit" class="done-body">{{ goal ? t('done.body', { usd: usdShort(amountUsd), goal: goal.name.split(',')[0] }) : t('done.bodyNoGoal', { usd: usdShort(amountUsd) }) }}</p>
        </div>
      </div>

      <GoalRow v-if="goal" :goal="goal" :added="addedPercent" />

      <ShareCard v-if="isDeposit && store.summary" :name="displayName() || null" :goal-name="goal?.name ?? null" :percent="goal?.percent ?? null" :stamps="store.summary.stamps" />

      <section class="slip receipt" :aria-label="t('done.receiptProof')">
        <div class="row"><span class="k">{{ isDeposit ? t('done.receiptSaved') : t('done.receiptTakenOut') }}</span><strong>{{ usdt(amountUsd) }}</strong></div>
        <div class="row"><span class="k">{{ t('done.receiptFee') }}</span><strong>{{ t('save.slipFeeValue', { nim: feeNim ?? '' }) }}</strong></div>
        <div class="row"><span class="k">{{ t('done.receiptProof') }}</span><a v-if="explorer" :href="explorer" target="_blank" rel="noopener" data-testid="explorer-link">{{ t('pending.explorer') }}</a></div>
      </section>

      <button class="btn btn-secondary back" type="button" data-testid="back-home" @click="router.replace('/')">{{ t('done.back') }}</button>
    </template>

    <template v-else>
      <div class="pending-head">
        <StampMark :label="stampLabel" :line="stampLine(stampDate, goal?.name)" :size="168" pending
          :aria="t('pending.stampAria', { usd: amountUsd, date: shortDate(stampDate), goal: goal ? `, ${goal.name}` : '' })" />
        <h1 class="title" data-testid="pending-title">{{ isDeposit ? t('pending.title') : t('takeOut.pendingTitle') }}</h1>
        <p class="muted body">{{ t('pending.body') }}</p>
      </div>

      <ol class="steps card" :aria-label="t('pending.title')">
        <li :data-state="feeStep">
          <svg v-if="feeStep === 'done'" class="tick" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M7.5 12.5l3 3 6-6.5"></path></svg>
          <svg v-else class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke-dasharray="4 4"></circle></svg>
          <div><div class="step-title">{{ t('pending.stepFee') }}</div><div class="small muted">{{ feeStep === 'done' ? t('pending.stepFeeDetail', { nim: feeNim ?? '' }) : t('pending.stepFeeWaiting') }}</div></div>
        </li>
        <li data-state="done">
          <svg class="tick" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M7.5 12.5l3 3 6-6.5"></path></svg>
          <div><div class="step-title">{{ t('pending.stepSigned') }}</div><div class="small muted">{{ isDeposit ? t('pending.stepSignedDetail', { amount: Math.round(amountUsd) }) : isMax ? t('takeOut.stepSignedDetailAll') : t('takeOut.stepSignedDetail', { amount: Math.round(amountUsd) }) }}</div></div>
        </li>
        <li :data-state="moveStep">
          <svg v-if="moveStep === 'done'" class="tick" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M7.5 12.5l3 3 6-6.5"></path></svg>
          <svg v-else class="spin" :class="{ queued: moveStep === 'queued' }" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke-dasharray="4 4"></circle></svg>
          <div><div class="step-title">{{ isDeposit ? t('pending.stepMove') : t('takeOut.stepMove') }}</div><div class="small muted">{{ moveStep === 'queued' ? t('pending.stepMoveQueued') : t('pending.stepMoveDetail') }}</div></div>
        </li>
      </ol>

      <div class="bottom">
        <button class="btn btn-secondary" type="button" @click="router.replace('/')">{{ t('pending.back') }}</button>
        <a v-if="explorer" :href="explorer" target="_blank" rel="noopener" class="explorer">{{ t('pending.explorer') }}</a>
      </div>
    </template>
  </main>
</template>

<style scoped>
.job { gap: 18px; }
.job.done { gap: 16px; }
.pending-head { display: flex; flex-direction: column; align-items: center; gap: 14px; padding-top: 20px; text-align: center; }
.title { font-size: 26px; }
.body { white-space: pre-line; line-height: 1.5; }
.steps { list-style: none; margin: 0; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.steps li { display: flex; gap: 12px; align-items: flex-start; }
.step-title { font-weight: 700; font-size: 15px; }
.tick { color: var(--grow); flex: none; }
.spin { color: var(--stamp); flex: none; animation: spin 2.4s linear infinite; }
.spin.queued { color: var(--dash); animation: none; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
.bottom { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
.explorer { text-align: center; font-size: 14px; font-weight: 600; padding: 12px; }
.done-head { display: flex; align-items: center; gap: 16px; }
.done-title { font-size: 32px; line-height: 1.05; }
.done-body { margin-top: 6px; font-size: 15px; line-height: 1.45; }
.receipt { padding: 4px 14px; gap: 0; font-size: 14px; }
.receipt .row { padding: 9px 0; border-bottom: 1px solid var(--rule-soft); }
.receipt .row:last-child { border-bottom: none; }
.receipt a { font-weight: 700; }
.back { margin-top: auto; font-weight: 700; }
</style>
