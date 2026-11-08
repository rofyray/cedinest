<script setup lang="ts">
import { t } from '../copy/en.js'
import { store } from '../store.js'
</script>

<template>
  <main class="screen gate">
    <div class="brand" aria-hidden="true">Cedi<em>Nest</em></div>
    <div v-if="store.wallet === 'connecting'" class="wait" role="status">
      <div class="dot" aria-hidden="true"></div>
      <p>{{ t('gate.waiting') }}</p>
    </div>
    <div v-else class="card">
      <h1>{{ t('gate.title') }}</h1>
      <p class="muted">{{ t('gate.body') }}</p>
      <p class="small muted">{{ t('brand.trust') }}</p>
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
</style>
