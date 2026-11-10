import { reactive } from 'vue'
import { api, session, type Summary } from './lib/api.js'
import { connectEvm, signMessage } from './lib/evm.js'
import { isUserRejection, nimAccounts, nimBalanceLuna, nimiq } from './lib/nimiq.js'

/**
 * connecting: waiting for Nimiq Pay. ready: both accounts known.
 * no_provider: not inside Nimiq Pay (the SDK found no provider). rejected: the user dismissed a prompt.
 * no_evm: Nimiq Pay gave no Polygon account or would not switch to Polygon. error: anything else.
 */
export type WalletState = 'connecting' | 'ready' | 'no_provider' | 'rejected' | 'no_evm' | 'error'

export const store = reactive({
  wallet: 'connecting' as WalletState,
  /** Raw message of the last connection failure, shown under "Technical details" on the gate. */
  walletError: '' as string,
  owner: '' as `0x${string}` | '',
  nimAddress: '',
  /** Wallet address first, then the current HTLC. Nimiq Pay swaps the HTLC without a new approval. */
  nimAccounts: [] as string[],
  /** Best known spendable NIM: the higher of Nimiq Pay's own reading and the Nimiq RPC's. */
  nimBalanceLuna: null as bigint | null,
  nimReadings: { pay: null as bigint | null, rpc: null as bigint | null },
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

function failWallet(state: Exclude<WalletState, 'connecting' | 'ready'>, e: unknown) {
  console.warn('[wallet]', state, e)
  store.walletError = String((e as any)?.message ?? e ?? '')
  store.wallet = state
}

/**
 * Connects to Nimiq Pay (NIM) and the injected Polygon provider once.
 * The two account prompts run one after the other: Nimiq Pay shows one sheet at a time.
 */
export function connectWallet() {
  connectPromise ??= (async () => {
    try {
      await nimiq()
    } catch (e) {
      failWallet('no_provider', e)
      return
    }
    try {
      const accounts = await nimAccounts()
      const owner = await connectEvm()
      store.nimAccounts = accounts
      store.nimAddress = accounts[0]!
      store.owner = owner
      store.walletError = ''
      store.wallet = 'ready'
      void refreshNimBalance()
      const p = await nimiq()
      p.on('accountsChanged', (next) => {
        if (Array.isArray(next) && next[0]) { store.nimAccounts = next; store.nimAddress = next[0] }
        void refreshNimBalance()
      })
    } catch (e) {
      const msg = String((e as any)?.message ?? e ?? '')
      if (isUserRejection(e)) failWallet('rejected', e)
      else if (/no_evm_provider|no_evm_account|wrong_chain/.test(msg)) failWallet('no_evm', e)
      else failWallet('error', e)
    }
  })()
  return connectPromise
}

/** Forgets the last attempt and connects again (the gate's "Try again"). */
export function retryWallet() {
  connectPromise = null
  store.walletError = ''
  store.wallet = 'connecting'
  return connectWallet()
}

/** What the page can see of the host, for the gate's technical details. */
export function hostInfo() {
  const w = window as any
  return [
    `nimiqPay ${w.nimiqPay ? 'yes' : 'no'}`,
    `nimiq ${w.nimiq ? 'yes' : 'no'}`,
    `ethereum ${w.ethereum ? 'yes' : 'no'}`,
    w.nimiqPay?.network ? `network ${w.nimiqPay.network}` : '',
  ].filter(Boolean).join(' · ')
}

/**
 * Records one reading of the NIM balance. Nimiq Pay's reading can be a momentary 0 while it replaces the HTLC,
 * and the RPC only sees the wallet address, so the app keeps the higher of the two and never refuses on it alone.
 */
export function noteNimBalance(source: 'pay' | 'rpc', value: bigint | null) {
  store.nimReadings[source] = value
  const known = [store.nimReadings.pay, store.nimReadings.rpc].filter((v): v is bigint => v != null)
  store.nimBalanceLuna = known.length ? known.reduce((a, b) => (a > b ? a : b)) : null
}

export async function refreshNimBalance() {
  if (!store.nimAccounts.length) return
  noteNimBalance('pay', await nimBalanceLuna(store.nimAccounts))
}

export async function loadSummary() {
  if (!store.owner) return
  store.loadingSummary = true
  try {
    store.summary = await api.summary(store.owner, store.nimAddress)
    store.summaryError = ''
    if (store.summary.nim.balanceLuna != null) noteNimBalance('rpc', BigInt(store.summary.nim.balanceLuna))
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
