<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../copy/en.js'
import { hostInfo, retryWallet, store } from '../store.js'

const busy = ref(false)
const copy = computed(() => ({
  no_provider: { title: t('gate.title'), body: t('gate.body') },
  rejected: { title: t('gate.rejectedTitle'), body: t('gate.rejectedBody') },
  no_evm: { title: t('gate.noEvmTitle'), body: t('gate.noEvmBody') },
  error: { title: t('gate.errorTitle'), body: t('gate.errorBody') },
}[store.wallet as 'no_provider' | 'rejected' | 'no_evm' | 'error'] ?? { title: t('gate.errorTitle'), body: t('gate.errorBody') }))
const canRetry = computed(() => store.wallet !== 'no_provider')
const details = computed(() => [store.walletError, hostInfo()].filter(Boolean).join(' · '))

async function retry() {
  busy.value = true
  try { await retryWallet() } finally { busy.value = false }
}
</script>

<template>
  <main class="screen gate">
    <div class="brand" aria-hidden="true">Cedi<em>Nest</em></div>
    <div v-if="store.wallet === 'connecting'" class="wait" role="status">
      <div class="dot" aria-hidden="true"></div>
      <p>{{ t('gate.waiting') }}</p>
    </div>
    <div v-else class="card" data-testid="gate">
      <h1>{{ copy.title }}</h1>
      <p class="muted">{{ copy.body }}</p>
      <button v-if="canRetry" class="btn btn-primary" type="button" :disabled="busy" data-testid="gate-retry" @click="retry">{{ t('gate.retry') }}</button>
      <p class="small muted">{{ t('brand.trust') }}</p>
      <details v-if="details" class="details">
        <summary class="small muted">{{ t('gate.details') }}</summary>
        <p class="small muted mono" data-testid="gate-details">{{ details }}</p>
      </details>
    </div>
    <p class="footer">{{ t('brand.tagline') }}</p>
  </main>
</template>

<style scoped>
.gate { justify-content: center; gap: 24px; }
.wait { display: flex; align-items: center; gap: 12px; color: var(--muted); }
.dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--stamp); border-top-color: transparent; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
.card { display: flex; flex-direction: column; gap: 10px; }
h1 { font-size: 24px; }
.details summary { cursor: pointer; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-word; margin-top: 6px; }
</style>
