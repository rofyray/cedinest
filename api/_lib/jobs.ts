import { getAddress, type Hex } from 'viem'
import { MAX_UINT256, MIN_DEPOSIT_RAW, PERMIT_TTL_S, QUOTE_TTL_MS } from '../../shared/constants.js'
import { GAS_DEPOSIT, GAS_WITHDRAW, quoteFee } from '../../shared/fees.js'
import { isEvmAddress, isGoalId, isNimTxHash, isQuoteId, memoFor, newJobId, newQuoteId } from '../../shared/ids.js'
import { recoverPermitSigner } from '../../shared/typed-data.js'
import { chain, type RelayCall } from './chain.js'
import { db, getJob, getQuote, moveJob } from './db.js'
import { env, missingConfig } from './env.js'
import { HttpError } from './http.js'
import { getPrices } from './prices.js'

export type QuoteRequest = { kind: 'deposit' | 'withdraw'; owner: string; nimAddress?: string; amount: string; goalId?: string | null }

const QUOTES_PER_MINUTE = Number(process.env.QUOTES_PER_MINUTE ?? 5)
const RELAYER_MIN_POL = 0.5

export async function createQuote(body: QuoteRequest) {
  const missing = missingConfig()
  if (missing.length) throw new HttpError(503, 'not_configured', `server is missing ${missing.join(', ')}`)
  if (body.kind !== 'deposit' && body.kind !== 'withdraw') throw new HttpError(400, 'bad_request', 'kind must be deposit or withdraw')
  if (!isEvmAddress(body.owner)) throw new HttpError(400, 'bad_request', 'owner must be a 0x address')
  if (body.goalId != null && body.goalId !== '' && !isGoalId(body.goalId)) throw new HttpError(400, 'bad_request', 'bad goalId')
  const owner = body.owner.toLowerCase() as `0x${string}`
  const ownerChecksum = getAddress(owner)

  let amountRaw: bigint
  if (body.kind === 'withdraw' && body.amount === 'max') amountRaw = MAX_UINT256
  else {
    if (typeof body.amount !== 'string' || !/^\d{1,30}$/.test(body.amount)) throw new HttpError(400, 'bad_request', 'amount must be a 6-decimal integer string')
    amountRaw = BigInt(body.amount)
    if (amountRaw <= 0n) throw new HttpError(400, 'bad_request', 'amount must be above 0')
    if (body.kind === 'deposit' && amountRaw < MIN_DEPOSIT_RAW) throw new HttpError(400, 'bad_request', 'the smallest saving is 1 USDT', { code: 'minimum' })
  }

  const { sql } = await db()
  const recent = await sql`select count(*)::int as n from quotes where owner = ${owner} and created_at > now() - interval '1 minute'`
  if (Number(recent[0]?.n ?? 0) >= QUOTES_PER_MINUTE) throw new HttpError(429, 'slow_down', 'too many quotes, wait a minute')

  const c = await chain()
  const [usdt, aToken, reserve, gasPriceWei, prices, relayerPol] = await Promise.all([
    c.usdtBalance(ownerChecksum), c.aTokenBalance(ownerChecksum), c.reserve(), c.gasPriceWei(), getPrices(), c.relayerPol(),
  ])
  if (relayerPol < RELAYER_MIN_POL) throw new HttpError(503, 'relayer_low', 'the relayer is low on POL, try again later')
  if (body.kind === 'deposit') {
    if (reserve.frozen || reserve.paused || !reserve.active) throw new HttpError(409, 'saving_paused', 'saving is paused on Aave right now')
    if (usdt < amountRaw) throw new HttpError(400, 'not_enough_usdt', 'not enough USDT in the wallet', { have: usdt.toString() })
  } else {
    if (aToken === 0n) throw new HttpError(400, 'nothing_to_withdraw', 'nothing in savings yet')
    if (amountRaw !== MAX_UINT256 && aToken < amountRaw) throw new HttpError(400, 'not_enough_saved', 'not that much in savings', { have: aToken.toString() })
  }

  const token = body.kind === 'deposit' ? 'usdt0' : 'apolusdt'
  const nonce = await c.permitNonce(token, ownerChecksum)
  const fee = quoteFee({ gas: body.kind === 'deposit' ? GAS_DEPOSIT : GAS_WITHDRAW, gasPriceWei, polUsd: prices.polUsd, nimUsd: prices.nimUsd })
  const id = newQuoteId()
  const memo = memoFor(id)
  const deadline = Math.floor(Date.now() / 1000) + PERMIT_TTL_S
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS)

  await sql`insert into quotes (id, kind, owner, nim_address, amount_raw, goal_id, fee_luna, memo, permit_nonce, permit_deadline, expires_at)
    values (${id}, ${body.kind}, ${owner}, ${body.nimAddress ?? null}, ${amountRaw.toString()}, ${body.goalId || null},
            ${fee.feeLuna.toString()}, ${memo}, ${nonce.toString()}, ${deadline}, ${expiresAt.toISOString()})`

  return {
    quoteId: id,
    kind: body.kind,
    feeLuna: fee.feeLuna.toString(),
    feeNim: fee.feeNim,
    feeUsd: fee.feeUsd,
    nimRecipient: env.nimFeeAddress,
    memo,
    permit: {
      token,
      spender: env.relayAddress,
      value: amountRaw.toString(),
      nonce: nonce.toString(),
      deadline: String(deadline),
    },
    expiresAt: expiresAt.toISOString(),
  }
}

export type JobRequest = { quoteId: string; nimTxHash: string; signature: string | null }

export async function createJob(body: JobRequest) {
  if (!isQuoteId(body.quoteId)) throw new HttpError(400, 'bad_request', 'bad quoteId')
  if (!isNimTxHash(body.nimTxHash)) throw new HttpError(400, 'bad_request', 'nimTxHash must be 64 hex chars')
  if (body.signature != null && !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) throw new HttpError(400, 'bad_request', 'bad signature format')
  const nimTxHash = body.nimTxHash.toLowerCase()

  const quote = await getQuote(body.quoteId)
  if (!quote) throw new HttpError(404, 'quote_not_found', 'no such quote')
  if (quote.used_at) throw new HttpError(409, 'quote_used', 'this quote was already used')
  if (new Date(quote.expires_at).getTime() < Date.now()) throw new HttpError(409, 'quote_expired', 'this quote expired')

  const { sql } = await db()
  const reused = await sql`select id from jobs where nim_tx_hash = ${nimTxHash}`
  if (reused[0]) throw new HttpError(409, 'fee_reused', 'that NIM payment was already used')

  const owner = String(quote.owner) as `0x${string}`
  const amountRaw = BigInt(quote.amount_raw)
  const jobId = newJobId()
  const c = await chain()

  if (body.signature) {
    const token = quote.kind === 'deposit' ? 'usdt0' : 'apolusdt'
    const permit = {
      spender: env.relayAddress, value: amountRaw.toString(), nonce: String(quote.permit_nonce), deadline: String(quote.permit_deadline),
    }
    const recovered = await recoverPermitSigner(token, owner, permit, body.signature as Hex).catch(() => null)
    if (!recovered || recovered.toLowerCase() !== owner.toLowerCase()) throw new HttpError(400, 'bad_signature', 'the permit signer is not the owner')
    try {
      await c.simulateRelay(relayCall(quote, jobId, body.signature as Hex))
    } catch (e: any) {
      throw new HttpError(400, 'would_fail', e?.message ?? String(e))
    }
  }

  // Mark the quote used with compare-and-set so two posts cannot both win.
  const won = await sql`update quotes set used_at = now() where id = ${quote.id} and used_at is null returning id`
  if (!won[0]) throw new HttpError(409, 'quote_used', 'this quote was already used')

  await sql`insert into jobs (id, quote_id, kind, owner, amount_raw, goal_id, nim_tx_hash, signature, status)
    values (${jobId}, ${quote.id}, ${quote.kind}, ${owner}, ${amountRaw.toString()}, ${quote.goal_id ?? null}, ${nimTxHash}, ${body.signature ?? null}, 'fee_pending')`
  return { jobId }
}

function relayCall(quote: any, jobId: string, signature: Hex): RelayCall {
  return {
    kind: quote.kind, owner: String(quote.owner) as `0x${string}`, amountRaw: BigInt(quote.amount_raw),
    deadline: BigInt(quote.permit_deadline), signature, jobId,
  }
}

const TERMINAL = ['done', 'failed', 'refund_due']

/** The state machine. Safe to call repeatedly; every transition is compare-and-set. */
export async function processJob(id: string, opts: { nimTimeoutMs?: number } = {}) {
  let job = await getJob(id)
  if (!job || TERMINAL.includes(job.status)) return job
  const quote = await getQuote(job.quote_id)
  if (!quote) return moveJob(id, job.status, 'failed', { error: 'quote missing' })
  const c = await chain()

  if (job.status === 'fee_pending') {
    const r = await c.verifyNimPayment(
      { hash: job.nim_tx_hash, to: env.nimFeeAddress, minLuna: BigInt(quote.fee_luna), memo: quote.memo },
      opts.nimTimeoutMs ?? 150_000,
    )
    if (r.status === 'invalid') return moveJob(id, 'fee_pending', 'failed', { error: `fee: ${r.reason}` })
    if (r.status !== 'final') return job // still waiting: the next poll or the daily cron resumes it
    if (!job.signature) return moveJob(id, 'fee_pending', 'refund_due', { error: 'user cancelled the signature after paying the fee' })
    job = (await moveJob(id, 'fee_pending', 'fee_final')) ?? (await getJob(id))
  }

  if (job && job.status === 'fee_final') {
    try {
      const hash = await c.sendRelay(relayCall(quote, job.id, job.signature as Hex))
      job = (await moveJob(id, 'fee_final', 'submitted', { polygonTxHash: hash })) ?? (await getJob(id))
    } catch (e: any) {
      return moveJob(id, 'fee_final', 'refund_due', { error: e?.shortMessage ?? e?.message ?? String(e) })
    }
  }

  if (job && job.status === 'submitted') {
    const receipt = await c.waitForReceipt(job.polygon_tx_hash as Hex, job.kind)
    if (receipt.status !== 'success') return moveJob(id, 'submitted', 'refund_due', { error: 'reverted on Polygon' })
    const usdAmount = (Number(receipt.settledRaw) / 1e6).toFixed(6)
    const ghsRate = (await getPrices()).usdGhs
    return moveJob(id, 'submitted', 'done', { usdAmount, ghsRate })
  }
  return job
}

export function publicJob(job: any) {
  return {
    id: job.id,
    status: job.status,
    kind: job.kind,
    amountRaw: String(job.amount_raw),
    goalId: job.goal_id ?? null,
    nimTxHash: job.nim_tx_hash,
    polygonTxHash: job.polygon_tx_hash ?? undefined,
    usdAmount: job.usd_amount != null ? String(job.usd_amount) : undefined,
    error: job.error ?? undefined,
    updatedAt: job.updated_at,
  }
}

/** Jobs stuck in fee_final or submitted for more than 10 minutes get another run. */
export async function retryStuckJobs() {
  const { sql } = await db()
  const rows = await sql`select id from jobs where status in ('fee_pending','fee_final','submitted') and updated_at < now() - interval '10 minutes' order by updated_at limit 20`
  let retried = 0
  for (const r of rows) {
    await processJob(r.id, { nimTimeoutMs: 5_000 }).catch((e) => console.error('[cron] job', r.id, e))
    retried++
  }
  return retried
}

export async function refundDueJobs() {
  const { sql } = await db()
  return sql`select j.id, j.owner, j.nim_tx_hash, j.error, j.updated_at, q.nim_address, q.fee_luna
    from jobs j join quotes q on q.id = j.quote_id where j.status = 'refund_due' order by j.updated_at`
}
