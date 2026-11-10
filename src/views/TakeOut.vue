<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ErrorNote from '../components/ErrorNote.vue'
import { t } from '../copy/en.js'
import { feeUsd, lunaToNim, nim, rawToUsd, usd, usdToRaw, usdt } from '../lib/format.js'
import { useRelayFlow } from '../lib/flow.js'
import { loadSummary, store } from '../store.js'

const router = useRouter()
const flow = useRelayFlow('withdraw')
const everything = ref(true)
const amount = ref('')

onMounted(() => { if (!store.summary) void loadSummary() })

const s = computed(() => store.summary)
const savedUsd = computed(() => (s.value ? rawToUsd(s.value.usdt.saved) : 0))
const raw = computed(() => (everything.value ? 'max' : usdToRaw(amount.value)))
const amountUsd = computed(() => (everything.value ? savedUsd.value : raw.value ? rawToUsd(raw.value) : 0))
const fee = computed(() => s.value?.fee.withdraw ?? { nim: 50, usd: 0.013 })
const nimBalance = computed(() => (store.nimBalanceLuna != null ? lunaToNim(store.nimBalanceLuna) : null))
const nothing = computed(() => !!s.value && savedUsd.value === 0)
const valid = computed(() => !nothing.value && !!raw.value && amountUsd.value > 0 && amountUsd.value <= savedUsd.value + 0.000001)
const busy = computed(() => flow.state.value !== 'idle')
const lowNim = computed(() => nimBalance.value != null && nimBalance.value < fee.value.nim)

const ctaLabel = computed(() => ({
  idle: t('takeOut.cta'), quoting: t('save.working'), 'approve-fee': t('save.waitingFee'), 'approve-permit': t('save.waitingSign'), sending: t('save.sending'),
}[flow.state.value]))

async function takeOut() {
  if (!valid.value || busy.value) return
  const jobId = await flow.run({ amountRaw: raw.value! })
  if (jobId) router.replace(`/job/${jobId}`)
}
</script>

<template>
  <main class="screen">
    <div class="topbar">
      <button class="icon-btn" type="button" :aria-label="t('save.back')" @click="router.back()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>
      </button>
      <h1>{{ t('takeOut.title') }}</h1>
    </div>

    <div class="label">{{ t('takeOut.amountLabel') }}</div>
    <div class="chips">
      <button class="chip" type="button" :aria-pressed="everything" :disabled="busy" data-testid="everything" @click="everything = true">{{ t('takeOut.everything', { usd: usd(savedUsd) }) }}</button>
      <button class="chip" type="button" :aria-pressed="!everything" :disabled="busy" data-testid="part" @click="everything = false">{{ t('takeOut.partLabel') }}</button>
    </div>
    <div v-if="!everything" class="field">
      <div class="amount">
        <span class="cur">$</span>
        <input id="amt" v-model="amount" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0.00" :disabled="busy" data-testid="amount-input" />
        <span class="small muted">{{ t('common.usdt') }}</span>
      </div>
      <div class="small muted">{{ t('takeOut.inSavings', { usd: usd(savedUsd) }) }}</div>
    </div>

    <section class="slip" :aria-label="t('takeOut.title')">
      <div class="row"><span class="k">{{ t('takeOut.slipGet') }}</span><strong>{{ everything ? t('takeOut.allSaved') : usdt(amountUsd) }}</strong></div>
      <div class="row"><span class="k">{{ t('takeOut.slipGoesTo') }}</span><span>{{ t('takeOut.slipGoesToValue') }}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="k">{{ t('save.slipFee') }}</span><span><strong>{{ t('save.slipFeeValue', { nim: fee.nim }) }}</strong> <span class="small muted">{{ t('save.slipFeeUsd', { usd: feeUsd(fee.usd) }) }}</span></span></div>
      <div class="small muted">{{ t('takeOut.slipFeeNote', { balance: nimBalance != null ? nim(nimBalance).replace(' NIM', '') : '…' }) }}</div>
    </section>

    <div class="note">
      <strong>{{ t('save.approvalsTitle') }}</strong>
      {{ t('save.approval1', { nim: fee.nim }) }}<br />
      {{ everything ? t('takeOut.approval2All') : t('takeOut.approval2', { amount: Math.round(amountUsd) }) }}
    </div>
    <div v-if="lowNim" class="note" role="status">{{ t('errors.lowNim', { have: nim(nimBalance!).replace(' NIM', ''), fee: fee.nim }) }}</div>

    <ErrorNote v-if="flow.error.value" :title="flow.error.value.title" :body="flow.error.value.body" />
    <ErrorNote v-else-if="nothing" :body="t('errors.nothingToTakeOut')" />
    <ErrorNote v-else-if="!everything && raw && amountUsd > savedUsd" :body="t('errors.notEnoughSaved', { have: usd(savedUsd) })" />

    <button class="btn btn-primary btn-tall cta" type="button" :disabled="!valid || busy" data-testid="take-it-out" @click="takeOut">{{ ctaLabel }}</button>
  </main>
</template>

<style scoped>
.chips { display: flex; gap: 8px; }
.chip { flex: 1; }
.amount { display: flex; align-items: baseline; gap: 6px; border-bottom: 2px solid var(--ink); padding-bottom: 6px; }
.cur { font-family: var(--font-display); font-size: 40px; font-weight: 700; }
.amount input { flex: 1; min-width: 0; border: none; background: transparent; font-family: var(--font-display); font-size: 48px; font-weight: 700; color: var(--ink); padding: 0; outline: none; }
.cta { margin-top: auto; }
</style>
