<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import CediChart from '../components/CediChart.vue'
import ErrorNote from '../components/ErrorNote.vue'
import GoalRow from '../components/GoalRow.vue'
import StampCard from '../components/StampCard.vue'
import { t } from '../copy/en'
import { apyPercent, cardNumber, ghs, greetingKey, monthName, rawToUsd, usd } from '../lib/format'
import { pendingJob } from '../lib/flow'
import { displayName, loadSummary, store } from '../store'

const router = useRouter()
const s = computed(() => store.summary)

const greeting = computed(() => {
  const key = greetingKey()
  const name = displayName()
  return name ? t(`home.${key}`, { name }) : t(`home.${key}NoName`)
})
const savedUsd = computed(() => (s.value ? rawToUsd(s.value.usdt.saved) : 0))
const savedGhs = computed(() => (s.value ? savedUsd.value * s.value.usdGhs : 0))
const interest = computed(() => (s.value ? Number(s.value.interestUsd) : 0))
const paused = computed(() => !!s.value && (s.value.reserve.paused || s.value.reserve.frozen || !s.value.reserve.active))
const empty = computed(() => !!s.value && s.value.savesCount === 0 && savedUsd.value === 0)
const pending = computed(() => pendingJob.get())

let timer: number | undefined
const onVisible = () => { if (document.visibilityState === 'visible') void loadSummary() }
onMounted(() => {
  void loadSummary()
  timer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadSummary() }, 30_000)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
})
onBeforeUnmount(() => {
  window.clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('focus', onVisible)
})
</script>

<template>
  <main class="screen home">
    <header class="top">
      <div>
        <div class="brand">Cedi<em>Nest</em></div>
        <div class="small muted tag">{{ t('brand.tagline') }}</div>
      </div>
      <div class="small muted" data-testid="card-number">{{ t('home.cardNumber', { number: cardNumber(store.owner), month: monthName(new Date()) }) }}</div>
    </header>

    <template v-if="!s && store.summaryError">
      <ErrorNote :body="t('home.loadError')" />
      <button class="btn btn-secondary" type="button" @click="loadSummary()">{{ t('home.retry') }}</button>
    </template>

    <section v-else-if="!s" class="card balance" aria-busy="true">
      <div class="skeleton" style="width: 40%">&nbsp;</div>
      <div class="label skeleton" style="width: 50%; margin-top: 8px">&nbsp;</div>
      <div class="skeleton" style="height: 46px; width: 80%; margin-top: 6px">&nbsp;</div>
      <div class="skeleton" style="width: 70%">&nbsp;</div>
    </section>

    <template v-else>
      <section class="card balance" :aria-label="t('home.savingsLabel')">
        <div class="hello">{{ greeting }}</div>
        <div class="label">{{ t('home.savingsLabel') }}</div>
        <div class="big" data-testid="savings-ghs">{{ ghs(savedGhs) }}</div>
        <div data-testid="dollars-line">{{ t('home.dollars', { usd: usd(savedUsd), apy: apyPercent(s.apy) }) }}</div>
        <div class="earned" :class="{ muted: interest <= 0 }">
          <svg v-if="interest > 0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V10"></path><path d="M12 10c0-4 3-6 7-6 0 4-3 6-7 6z"></path><path d="M12 13c0-3-2-5-6-5 0 3 2 5 6 5z"></path></svg>
          {{ interest > 0 ? t('home.earned', { ghs: ghs(interest * s.usdGhs) }) : t('home.earnedZero') }}
        </div>
      </section>

      <div v-if="paused" class="note" role="status">{{ t('home.paused') }}</div>

      <div class="actions">
        <button class="btn btn-primary" type="button" :disabled="paused" data-testid="stamp-cta" @click="router.push('/save')">{{ t('home.stampCta') }}</button>
        <button class="btn btn-secondary" type="button" data-testid="take-out-cta" @click="router.push('/take-out')">{{ t('home.takeOut') }}</button>
      </div>

      <router-link v-if="pending" :to="`/job/${pending}`" class="note pending-note">
        <strong>{{ t('home.pendingJob') }}</strong>{{ t('home.pendingJobCta') }}
      </router-link>

      <section v-if="empty" class="card empty">
        <h2>{{ t('home.emptyTitle') }}</h2>
        <p class="muted">{{ t('home.emptyBody') }}</p>
      </section>
      <CediChart v-else-if="s.chart.length" :points="s.chart" />

      <StampCard :stamps="s.stamps" />

      <section class="goals" :aria-label="t('home.goalsTitle')">
        <div class="goals-head">
          <h2>{{ t('home.goalsTitle') }}</h2>
          <router-link to="/goals/new" class="btn btn-ghost" data-testid="new-goal">{{ t('home.newGoal') }}</router-link>
        </div>
        <template v-if="s.goalsLocked">
          <router-link to="/goals/new" class="card small muted locked">{{ t('home.goalsLocked') }}</router-link>
        </template>
        <template v-else-if="s.goals.length === 0">
          <div class="card small muted">{{ t('home.noGoals') }}</div>
        </template>
        <GoalRow v-for="g in s.goals" :key="g.id" :goal="g" link />
      </section>

      <p class="footer"><strong>{{ t('home.footerTrust') }}</strong><br />{{ t('home.footerHow') }}</p>
    </template>
  </main>
</template>

<style scoped>
.top { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
.tag { font-weight: 500; margin-top: 2px; }
.balance { display: flex; flex-direction: column; gap: 4px; padding: 16px; }
.hello { font-size: 15px; font-weight: 600; }
.balance .label { margin-top: 8px; }
.big { font-family: var(--font-display); font-weight: 700; font-size: 44px; line-height: 1.05; letter-spacing: -1px; }
.earned { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 14px; color: var(--grow); font-weight: 600; }
.earned.muted { color: var(--muted); font-weight: 500; }
.actions { display: flex; gap: 10px; }
.actions .btn-primary { flex: 2; }
.actions .btn-secondary { flex: 1; }
.pending-note { text-decoration: none; color: inherit; display: block; }
.empty { display: flex; flex-direction: column; gap: 6px; }
.empty h2 { font-size: 18px; }
.goals { display: flex; flex-direction: column; gap: 8px; }
.goals-head { display: flex; justify-content: space-between; align-items: baseline; }
.goals h2 { font-size: 18px; }
.locked { display: block; text-decoration: none; }
</style>
