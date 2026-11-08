<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { t } from '../copy/en'
import { api } from '../lib/api'
import { apyPercent } from '../lib/format'
import { isUserRejection } from '../lib/nimiq'
import { consent, ensureSignedIn, loadSummary, localName, store } from '../store'

const router = useRouter()
const route = useRoute()
const name = ref(localName.get())
const agreed = ref(false)
const busy = ref(false)

onMounted(() => { if (!store.summary) void loadSummary() })
const apy = computed(() => apyPercent(store.summary?.apy ?? 0.037))

async function start() {
  if (!agreed.value || busy.value) return
  busy.value = true
  const first = name.value.trim().slice(0, 24)
  localName.set(first)
  consent.set()
  // Store consent and the name with the wallet's session. One signature; skipping it is fine.
  try {
    await ensureSignedIn()
    await api.profile({ name: first || null, consent: true })
  } catch (e) {
    if (!isUserRejection(e)) console.warn('[welcome] profile not stored', e)
  }
  busy.value = false
  void loadSummary()
  const next = typeof route.query.next === 'string' ? route.query.next : '/'
  router.replace(next)
}
</script>

<template>
  <main class="screen">
    <div class="topbar"><div class="brand">Cedi<em>Nest</em></div></div>
    <h1 class="title">{{ t('welcome.title') }}</h1>
    <ol class="points">
      <li>{{ t('welcome.point1', { apy }) }}</li>
      <li>{{ t('welcome.point2') }}</li>
      <li>{{ t('welcome.point3') }}</li>
    </ol>
    <div class="field">
      <label class="label" for="name">{{ t('welcome.nameLabel') }}</label>
      <input id="name" v-model="name" type="text" maxlength="24" autocomplete="given-name" :placeholder="t('welcome.namePlaceholder')" data-testid="name-input" />
    </div>
    <section class="card privacy" :aria-label="t('welcome.privacyTitle')">
      <h2>{{ t('welcome.privacyTitle') }}</h2>
      <p class="small muted">{{ t('welcome.privacy') }}</p>
    </section>
    <label class="checkbox">
      <input v-model="agreed" type="checkbox" data-testid="consent-checkbox" />
      <span>{{ t('welcome.consent') }}</span>
    </label>
    <button class="btn btn-primary btn-tall cta" type="button" :disabled="!agreed || busy" data-testid="welcome-cta" @click="start">
      {{ busy ? t('welcome.signing') : t('welcome.cta') }}
    </button>
    <p class="footer"><strong>{{ t('brand.trust') }}</strong></p>
  </main>
</template>

<style scoped>
.title { font-size: 30px; line-height: 1.08; letter-spacing: -0.6px; margin-top: 8px; }
.points { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; font-size: 15px; line-height: 1.45; }
.privacy { display: flex; flex-direction: column; gap: 6px; }
.privacy h2 { font-size: 16px; }
.cta { margin-top: auto; }
</style>
