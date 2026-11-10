<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ErrorNote from '../components/ErrorNote.vue'
import { t } from '../copy/en.js'
import { api, ApiError } from '../lib/api.js'
import { ghs, usd } from '../lib/format.js'
import { isUserRejection } from '../lib/nimiq.js'
import { ensureSignedIn, loadSummary, store } from '../store.js'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const editing = computed(() => !!props.id)

const name = ref('')
const target = ref('')
const month = ref('')
const busy = ref(false)
const error = ref('')
const needSignIn = ref(!store.signedIn)
const loaded = ref(!props.id)

const rate = computed(() => store.summary?.usdGhs ?? 0)
const targetNum = computed(() => Number(target.value.replace(/,/g, '')) || 0)
const valid = computed(() => name.value.trim().length > 0 && name.value.trim().length <= 40 && targetNum.value > 0)
const targetDate = computed(() => (month.value && /^\d{4}-\d{2}$/.test(month.value) ? lastDayOf(month.value) : null))
const helper = computed(() => {
  if (!targetNum.value || !rate.value) return ''
  const inUsd = usd(targetNum.value / rate.value)
  if (!targetDate.value) return t('goals.helperNoDate', { usd: inUsd })
  const weeks = Math.max(1, Math.round((Date.parse(targetDate.value) - Date.now()) / (7 * 86_400_000)))
  return t('goals.helper', { usd: inUsd, weekly: ghs(targetNum.value / weeks) })
})

function lastDayOf(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m!, 0))
  return d.toISOString().slice(0, 10)
}

async function signIn() {
  busy.value = true; error.value = ''
  try {
    await ensureSignedIn()
    needSignIn.value = false
    await Promise.all([loadSummary(), load()])
  } catch (e) {
    error.value = isUserRejection(e) ? t('goals.signInCancelled') : t('errors.generic')
  } finally { busy.value = false }
}

async function load() {
  if (!props.id || !store.signedIn) return
  try {
    const { goals } = await api.goals()
    const g = goals.find((x) => x.id === props.id)
    if (g) { name.value = g.name; target.value = String(g.targetGhs); month.value = g.targetDate ? g.targetDate.slice(0, 7) : '' }
    loaded.value = true
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) needSignIn.value = true
    else error.value = t('errors.generic')
  }
}

async function save() {
  if (!valid.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    const body = { name: name.value.trim(), targetGhs: targetNum.value, targetDate: targetDate.value }
    if (props.id) await api.updateGoal(props.id, body)
    else await api.createGoal(body)
    await loadSummary()
    router.replace('/')
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) needSignIn.value = true
    else error.value = e instanceof ApiError && e.code === 'offline' ? t('errors.offline') : t('errors.generic')
  } finally { busy.value = false }
}

async function archive() {
  if (!props.id || busy.value) return
  busy.value = true
  try {
    await api.updateGoal(props.id, { archived: true })
    await loadSummary()
    router.replace('/')
  } catch { error.value = t('errors.generic') } finally { busy.value = false }
}

onMounted(() => { if (store.signedIn) void load() })
</script>

<template>
  <main class="screen">
    <div class="topbar">
      <button class="icon-btn" type="button" :aria-label="t('goals.back')" @click="router.back()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>
      </button>
      <h1>{{ editing ? t('goals.editTitle') : t('goals.newTitle') }}</h1>
    </div>

    <template v-if="needSignIn">
      <section class="card signin">
        <h2>{{ t('goals.signInTitle') }}</h2>
        <p class="muted">{{ t('goals.signInBody') }}</p>
        <ErrorNote v-if="error" :body="error" />
        <button class="btn btn-primary" type="button" :disabled="busy" data-testid="sign-in" @click="signIn">{{ t('goals.signInCta') }}</button>
      </section>
    </template>

    <template v-else>
      <div class="field">
        <label class="label" for="goal-name">{{ t('goals.nameLabel') }}</label>
        <input id="goal-name" v-model="name" type="text" maxlength="40" enterkeyhint="next" :placeholder="t('goals.namePlaceholder')" data-testid="goal-name" />
      </div>
      <div class="field">
        <label class="label" for="goal-target">{{ t('goals.targetLabel') }}</label>
        <div class="money">
          <span class="cur">GH₵</span>
          <input id="goal-target" v-model="target" type="text" inputmode="decimal" enterkeyhint="done" placeholder="12,000" data-testid="goal-target" />
        </div>
      </div>
      <div class="field">
        <label class="label" for="goal-month">{{ t('goals.dateLabel') }}</label>
        <input id="goal-month" v-model="month" type="month" data-testid="goal-month" />
      </div>
      <p v-if="helper" class="small muted" data-testid="goal-helper">{{ helper }}</p>
      <ErrorNote v-if="error" :body="error" />
      <button class="btn btn-primary btn-tall cta" type="button" :disabled="!valid || busy || !loaded" data-testid="goal-save" @click="save">{{ busy ? t('goals.saving') : t('goals.save') }}</button>
      <button v-if="editing" class="btn btn-ghost archive" type="button" :disabled="busy" data-testid="goal-archive" @click="archive">{{ t('goals.archive') }}</button>
    </template>
  </main>
</template>

<style scoped>
.signin { display: flex; flex-direction: column; gap: 10px; }
.signin h2 { font-size: 18px; }
.money { display: flex; align-items: center; gap: 8px; border: 1.5px solid var(--dash); border-radius: var(--radius-control); background: var(--card); padding: 0 14px; height: 48px; }
.money:focus-within { outline: 2px solid var(--ink); outline-offset: 1px; }
.money .cur { font-family: var(--font-display); font-weight: 700; }
.money input { border: none; background: transparent; font-size: 16px; flex: 1; min-width: 0; outline: none; }
.cta { margin-top: auto; }
.archive { align-self: center; color: var(--stamp); }
</style>
