<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ErrorNote from '../components/ErrorNote.vue'
import { t } from '../copy/en.js'
import { apyPercent, feeUsd, ghs, lunaToNim, nim, rawToUsd, usd, usdToRaw, usdt } from '../lib/format.js'
import { useRelayFlow } from '../lib/flow.js'
import { loadSummary, store } from '../store.js'

const router = useRouter()
const flow = useRelayFlow('deposit')
const amount = ref('20.00')
const goalId = ref<string | null>(null)
const picking = ref(false)
const CHIPS = [5, 10, 20, 50]

onMounted(() => { if (!store.summary) void loadSummary() })

const s = computed(() => store.summary)
const raw = computed(() => usdToRaw(amount.value))
const amountUsd = computed(() => (raw.value ? rawToUsd(raw.value) : 0))
const walletUsd = computed(() => (s.value ? rawToUsd(s.value.usdt.wallet) : 0))
const rate = computed(() => s.value?.usdGhs ?? 0)
const fee = computed(() => s.value?.fee.deposit ?? { nim: 50, usd: 0.013 })
const nimBalance = computed(() => (store.nimBalanceLuna != null ? lunaToNim(store.nimBalanceLuna) : null))
const goal = computed(() => s.value?.goals.find((g) => g.id === goalId.value) ?? null)
const valid = computed(() => !!raw.value && amountUsd.value >= 1 && amountUsd.value <= walletUsd.value)
const busy = computed(() => flow.state.value !== 'idle')
const paused = computed(() => !!s.value && (s.value.reserve.paused || s.value.reserve.frozen))

watch(() => s.value?.goals, (goals) => { if (goals && goals.length && goalId.value === null && !picking.value) goalId.value = goals[0]!.id }, { immediate: true })

const ctaLabel = computed(() => ({
  idle: t('save.cta'), quoting: t('save.working'), 'approve-fee': t('save.waitingFee'), 'approve-permit': t('save.waitingSign'), sending: t('save.sending'),
}[flow.state.value]))

function pick(n: number) { amount.value = n.toFixed(2) }

async function stampIt() {
  if (!valid.value || busy.value) return
  const jobId = await flow.run({ amountRaw: raw.value!, goalId: goalId.value })
  if (jobId) router.replace(`/job/${jobId}`)
}
</script>

<template>
  <main class="screen">
    <div class="topbar">
      <button class="icon-btn" type="button" :aria-label="t('save.back')" @click="router.back()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>
      </button>
      <h1>{{ t('save.title') }}</h1>
    </div>

    <div class="field">
      <label class="label" for="amt">{{ t('save.amountLabel') }}</label>
      <div class="amount">
        <span class="cur">$</span>
        <input id="amt" v-model="amount" inputmode="decimal" autocomplete="off" :disabled="busy" data-testid="amount-input" />
        <span class="small muted">{{ t('common.usdt') }}</span>
      </div>
      <div data-testid="amount-helper">{{ t('save.amountHelper', { ghs: ghs(amountUsd * rate), usd: usd(walletUsd) }) }}</div>
    </div>

    <div class="chips">
      <button v-for="c in CHIPS" :key="c" class="chip" type="button" :aria-pressed="amountUsd === c" :disabled="busy" :data-testid="`chip-${c}`" @click="pick(c)">${{ c }}</button>
    </div>

    <div class="goal-pick">
      <div class="goal-row">
        <div>
          <div class="label">{{ t('save.goalLabel') }}</div>
          <div class="goal-name" data-testid="goal-picked">{{ goal ? goal.name : t('save.noGoal') }}</div>
        </div>
        <button v-if="s && !s.goalsLocked && s.goals.length" class="btn btn-ghost" type="button" :disabled="busy" @click="picking = !picking">{{ t('save.change') }}</button>
        <router-link v-else to="/goals/new" class="btn btn-ghost">{{ t('home.newGoal') }}</router-link>
      </div>
      <div v-if="picking && s" class="goal-list" role="listbox" :aria-label="t('save.pickGoal')">
        <button v-for="g in s.goals" :key="g.id" type="button" role="option" :aria-selected="goalId === g.id" class="opt" @click="goalId = g.id; picking = false">{{ g.name }}</button>
        <button type="button" role="option" :aria-selected="goalId === null" class="opt" @click="goalId = null; picking = false">{{ t('save.noGoal') }}</button>
      </div>
    </div>

    <section class="slip" :aria-label="t('save.title')">
      <div class="row"><span class="k">{{ t('save.slipSave') }}</span><strong>{{ usdt(amountUsd) }}</strong></div>
      <div class="row"><span class="k">{{ t('save.slipGoesTo') }}</span><span>{{ t('save.slipGoesToValue') }}</span></div>
      <div class="row"><span class="k">{{ t('save.slipRate') }}</span><span>{{ t('save.slipRateValue', { apy: apyPercent(s?.apy ?? 0.037) }) }}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="k">{{ t('save.slipFee') }}</span><span><strong>{{ t('save.slipFeeValue', { nim: fee.nim }) }}</strong> <span class="small muted">{{ t('save.slipFeeUsd', { usd: feeUsd(fee.usd) }) }}</span></span></div>
      <div class="small muted">{{ t('save.slipFeeNote', { balance: nimBalance != null ? nim(nimBalance).replace(' NIM', '') : '…', amount: Math.round(amountUsd) }) }}</div>
    </section>

    <div class="note">
      <strong>{{ t('save.approvalsTitle') }}</strong>
      {{ t('save.approval1', { nim: fee.nim }) }}<br />
      {{ t('save.approval2', { amount: Math.round(amountUsd) }) }}
    </div>

    <ErrorNote v-if="flow.error.value" :title="flow.error.value.title" :body="flow.error.value.body" />
    <ErrorNote v-else-if="paused" :body="t('errors.paused')" />
    <ErrorNote v-else-if="raw && amountUsd > 0 && amountUsd < 1" :body="t('errors.minimum')" />
    <ErrorNote v-else-if="raw && s && amountUsd > walletUsd" :body="t('errors.notEnoughUsdt', { have: usd(walletUsd) })" />

    <button class="btn btn-primary btn-tall cta" type="button" :disabled="!valid || busy || paused" data-testid="stamp-it" @click="stampIt">{{ ctaLabel }}</button>
  </main>
</template>

<style scoped>
.amount { display: flex; align-items: baseline; gap: 6px; border-bottom: 2px solid var(--ink); padding-bottom: 6px; }
.cur { font-family: var(--font-display); font-size: 40px; font-weight: 700; }
.amount input { flex: 1; min-width: 0; border: none; background: transparent; font-family: var(--font-display); font-size: 48px; font-weight: 700; color: var(--ink); padding: 0; outline: none; }
.chips { display: flex; gap: 8px; }
.goal-pick { background: var(--card); border: 1px solid var(--rule); border-radius: 12px; padding: 12px 14px; }
.goal-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.goal-pick .label { font-size: 12px; }
.goal-name { font-weight: 700; font-size: 16px; margin-top: 2px; }
.goal-list { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; border-top: 1px solid var(--rule-soft); padding-top: 8px; }
.opt { text-align: left; min-height: 44px; border: none; background: transparent; padding: 0 4px; font-weight: 600; border-radius: 8px; }
.opt[aria-selected="true"] { color: var(--stamp); }
.cta { margin-top: auto; }
</style>
