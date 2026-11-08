/**
 * The two-approval controller shared by Save and Take out:
 *   quote -> approval 1 (NIM fee) -> approval 2 (permit) -> POST /api/jobs -> /job/:id
 * Every failure maps to a copy key and says what happened to the money.
 */
import { ref } from 'vue'
import { api, ApiError, type Quote } from './api'
import { signPermit } from './evm'
import { isUserRejection, payNimFee } from './nimiq'
import { lunaToNim, nim, rawToUsd, usd, usdShort } from './format'
import { t } from '../copy/en'
import { refreshNimBalance, store } from '../store'

export type FlowState = 'idle' | 'quoting' | 'approve-fee' | 'approve-permit' | 'sending'
export type FlowError = { title?: string; body: string; code: string }

const PENDING_KEY = 'cedinest.pendingJob'
export const pendingJob = {
  get: () => { try { return localStorage.getItem(PENDING_KEY) ?? '' } catch { return '' } },
  set: (id: string) => { try { localStorage.setItem(PENDING_KEY, id) } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(PENDING_KEY) } catch { /* ignore */ } },
}

export function useRelayFlow(kind: 'deposit' | 'withdraw') {
  const state = ref<FlowState>('idle')
  const error = ref<FlowError | null>(null)
  const quote = ref<Quote | null>(null)

  function fail(code: string, body: string, title?: string) {
    error.value = { code, body, title }
    state.value = 'idle'
    return null
  }

  function mapApiError(e: unknown, amountRaw: string): null {
    if (!(e instanceof ApiError)) return fail('generic', t('errors.generic'))
    switch (e.code) {
      case 'offline': return fail(e.code, t('errors.offline'))
      case 'not_enough_usdt': return fail(e.code, t('errors.notEnoughUsdt', { have: usd(rawToUsd(e.extra.have ?? '0')) }))
      case 'not_enough_saved': return fail(e.code, t('errors.notEnoughSaved', { have: usd(rawToUsd(e.extra.have ?? '0')) }))
      case 'nothing_to_withdraw': return fail(e.code, t('errors.nothingToTakeOut'))
      case 'slow_down': return fail(e.code, t('errors.slowDown'))
      case 'saving_paused': return fail(e.code, t('errors.paused'))
      case 'relayer_low': return fail(e.code, t('errors.relayerLow'))
      case 'not_configured': return fail(e.code, t('errors.notConfigured'))
      case 'quote_expired': case 'quote_used': return fail(e.code, t('errors.quoteExpired'))
      case 'bad_signature': return fail(e.code, t('errors.signatureMismatch'))
      case 'would_fail': return fail(e.code, t('errors.wouldFail', { reason: e.message }))
      case 'bad_request':
        if (e.extra.code === 'minimum') return fail('minimum', t('errors.minimum'))
        return fail(e.code, t('errors.generic'))
      default:
        void amountRaw
        return fail(e.code, t('errors.generic'))
    }
  }

  /** Runs the whole flow. Resolves with the job id, or null after a handled error. */
  async function run(p: { amountRaw: string; goalId?: string | null }): Promise<string | null> {
    error.value = null
    if (!store.owner || !store.nimAddress) return fail('no_wallet', t('errors.wrongNetwork'))
    if (!navigator.onLine) return fail('offline', t('errors.offline'))

    state.value = 'quoting'
    let q: Quote
    try {
      q = await api.quote({ kind, owner: store.owner, nimAddress: store.nimAddress, amount: p.amountRaw, goalId: p.goalId ?? null })
    } catch (e) { return mapApiError(e, p.amountRaw) }
    quote.value = q

    await refreshNimBalance()
    const feeNim = lunaToNim(q.feeLuna)
    if (store.nimBalanceLuna != null && store.nimBalanceLuna < BigInt(q.feeLuna)) {
      return fail('not_enough_nim', t('errors.notEnoughNim', { fee: nim(feeNim).replace(' NIM', ''), have: nim(lunaToNim(store.nimBalanceLuna)).replace(' NIM', '') }), t('errors.notEnoughNimTitle'))
    }

    // Approval 1: the NIM stamp fee, with the quote memo.
    state.value = 'approve-fee'
    let nimTxHash: string
    try {
      nimTxHash = await payNimFee(q.nimRecipient, Number(q.feeLuna), q.memo)
    } catch (e) {
      if (isUserRejection(e)) return fail('fee_cancelled', t('errors.feeCancelled'))
      return fail('fee_failed', t('errors.feeCancelled'))
    }

    // Approval 2: the permit. If the user cancels here, the fee is already paid: file the job for a refund.
    state.value = 'approve-permit'
    let signature: `0x${string}` | null = null
    try {
      signature = await signPermit(q.permit.token, store.owner, q.permit)
    } catch (e) {
      const mismatch = String((e as any)?.message) === 'signature_mismatch'
      try { await api.createJob({ quoteId: q.quoteId, nimTxHash, signature: null }) } catch { /* best effort */ }
      void refreshNimBalance()
      return fail(mismatch ? 'signature_mismatch' : 'sign_cancelled',
        mismatch ? t('errors.signatureMismatch') : t('errors.signCancelled', { fee: feeNim }))
    }

    state.value = 'sending'
    try {
      const { jobId } = await api.createJob({ quoteId: q.quoteId, nimTxHash, signature })
      pendingJob.set(jobId)
      store.lastJobId = jobId
      void refreshNimBalance()
      state.value = 'idle'
      return jobId
    } catch (e) {
      // Fee paid, job refused: say so plainly.
      if (e instanceof ApiError && (e.code === 'bad_signature' || e.code === 'would_fail')) {
        const amount = usdShort(rawToUsd(p.amountRaw === 'max' ? '0' : p.amountRaw))
        return fail(e.code, kind === 'deposit' ? t('errors.relayFailed', { amount, fee: feeNim }) : t('errors.relayFailedTakeOut', { fee: feeNim }))
      }
      return mapApiError(e, p.amountRaw)
    }
  }

  return { state, error, quote, run, clearError: () => { error.value = null } }
}
