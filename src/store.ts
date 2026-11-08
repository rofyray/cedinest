import { reactive } from 'vue'
import { api, session, type Summary } from './lib/api'
import { connectEvm, signMessage } from './lib/evm'
import { nimAccount, nimBalanceLuna, nimiq } from './lib/nimiq'

export type WalletState = 'connecting' | 'ready' | 'no_provider'

export const store = reactive({
  wallet: 'connecting' as WalletState,
  owner: '' as `0x${string}` | '',
  nimAddress: '',
  nimBalanceLuna: null as bigint | null,
  summary: null as Summary | null,
  summaryError: '' as string,
  loadingSummary: false,
  signedIn: !!session.get(),
  /** Set after a successful save or take out so Home can refresh once. */
  lastJobId: '' as string,
})

const CONSENT_KEY = 'cedinest.consented'
export const consent = {
  given: () => { try { return localStorage.getItem(CONSENT_KEY) === '1' } catch { return false } },
  set: () => { try { localStorage.setItem(CONSENT_KEY, '1') } catch { /* ignore */ } },
}

const NAME_KEY = 'cedinest.name'
export const localName = {
  get: () => { try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' } },
  set: (n: string) => { try { localStorage.setItem(NAME_KEY, n) } catch { /* ignore */ } },
}

let connectPromise: Promise<void> | null = null

/** Connects to Nimiq Pay (NIM) and the injected Polygon provider once. */
export function connectWallet() {
  connectPromise ??= (async () => {
    try {
      await nimiq()
      const [nim, owner] = await Promise.all([nimAccount(), connectEvm()])
      store.nimAddress = nim
      store.owner = owner
      store.wallet = 'ready'
      void refreshNimBalance()
    } catch (e) {
      console.warn('[wallet]', e)
      store.wallet = 'no_provider'
    }
  })()
  return connectPromise
}

export async function refreshNimBalance() {
  if (!store.nimAddress) return
  store.nimBalanceLuna = await nimBalanceLuna(store.nimAddress)
}

export async function loadSummary() {
  if (!store.owner) return
  store.loadingSummary = true
  try {
    store.summary = await api.summary(store.owner, store.nimAddress)
    store.summaryError = ''
    if (store.summary.nim.balanceLuna) store.nimBalanceLuna = BigInt(store.summary.nim.balanceLuna)
  } catch (e: any) {
    store.summaryError = e?.code ?? 'internal'
  } finally {
    store.loadingSummary = false
  }
}

/** Goals sign-in: one personal_sign, token kept for 30 days. */
export async function signIn() {
  if (!store.owner) throw new Error('no_owner')
  const ch = await api.challenge(store.owner)
  const signature = await signMessage(store.owner, ch.message)
  const { token } = await api.session({ owner: store.owner, nonce: ch.nonce, issued: ch.issued, signature })
  session.set(token)
  store.signedIn = true
  return token
}

export async function ensureSignedIn() {
  if (store.signedIn && session.get()) return
  await signIn()
}

export const displayName = () => store.summary?.profile.name || localName.get()
