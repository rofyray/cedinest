/**
 * Everything that touches Polygon or Nimiq goes through this interface, so local dev and e2e tests
 * can run against an in-memory fake (CHAIN_MODE=mock) while production uses the real chains.
 */
import { keccak256, toHex, type Hex } from 'viem'
import { MAX_UINT256 } from '../../shared/constants'
import type { NimCheck, NimPaymentExpectation } from '../../shared/nimiq-verify'
import { db } from './db'
import { env } from './env'

export type Reserve = { active: boolean; frozen: boolean; paused: boolean; apy: number }

export type RelayCall = {
  kind: 'deposit' | 'withdraw'
  owner: `0x${string}`
  amountRaw: bigint
  deadline: bigint
  signature: Hex
  jobId: string
}

export type Receipt = { status: 'success' | 'reverted'; settledRaw: bigint }

export interface Chain {
  usdtBalance(owner: `0x${string}`): Promise<bigint>
  aTokenBalance(owner: `0x${string}`): Promise<bigint>
  permitNonce(token: 'usdt0' | 'apolusdt', owner: `0x${string}`): Promise<bigint>
  reserve(): Promise<Reserve>
  gasPriceWei(): Promise<bigint>
  relayerPol(): Promise<number>
  /** Throws with a readable reason if the relay call would revert. */
  simulateRelay(call: RelayCall): Promise<void>
  sendRelay(call: RelayCall): Promise<Hex>
  waitForReceipt(hash: Hex, kind: 'deposit' | 'withdraw'): Promise<Receipt>
  verifyNimPayment(p: NimPaymentExpectation, timeoutMs: number): Promise<NimCheck>
  nimBalanceLuna(address: string): Promise<bigint | null>
}

let chainPromise: Promise<Chain> | null = null
export function chain(): Promise<Chain> {
  chainPromise ??= env.chainMode === 'mock' ? Promise.resolve(mockChain()) : import('./chain-real').then((m) => m.realChain())
  return chainPromise
}
export function resetChainForTests() { chainPromise = null }

/* ------------------------------------------------------------------ mock */

const MOCK_USDT_WALLET = 100_000_000n // 100 USDT in every wallet

function mockChain(): Chain {
  const receipts = new Map<string, Receipt>()
  // Interest in the mock: 0.5% on whatever is saved, so "earned so far" is visible.
  const savedFor = async (owner: `0x${string}`) => {
    const { sql } = await db()
    const rows = await sql`select kind, usd_amount from jobs where owner = ${owner.toLowerCase()} and status = 'done'`
    let net = 0n
    for (const r of rows) {
      const raw = BigInt(Math.round(Number(r.usd_amount) * 1e6))
      net += r.kind === 'deposit' ? raw : -raw
    }
    if (net <= 0n) return 0n
    return net + net / 200n
  }
  return {
    async usdtBalance(owner) {
      const { sql } = await db()
      const rows = await sql`select kind, usd_amount from jobs where owner = ${owner.toLowerCase()} and status = 'done'`
      let bal = MOCK_USDT_WALLET
      for (const r of rows) {
        const raw = BigInt(Math.round(Number(r.usd_amount) * 1e6))
        bal += r.kind === 'deposit' ? -raw : raw
      }
      return bal < 0n ? 0n : bal
    },
    aTokenBalance: savedFor,
    async permitNonce() { return 0n },
    async reserve() {
      const paused = process.env.MOCK_RESERVE_PAUSED === '1'
      return { active: true, frozen: false, paused, apy: 0.0367 }
    },
    async gasPriceWei() { return 232_000_000_000n },
    async relayerPol() { return Number(process.env.MOCK_RELAYER_POL ?? 5) },
    async simulateRelay(call) {
      if (call.kind === 'deposit' && (await this.usdtBalance(call.owner)) < call.amountRaw) throw new Error('transfer amount exceeds balance')
      if (call.kind === 'withdraw' && (await savedFor(call.owner)) === 0n) throw new Error('nothing to withdraw')
    },
    async sendRelay(call) {
      const hash = keccak256(toHex(`mock:${call.jobId}`))
      const settled = call.kind === 'withdraw' && call.amountRaw === MAX_UINT256 ? await savedFor(call.owner) : call.amountRaw
      receipts.set(hash, { status: 'success', settledRaw: settled })
      return hash
    },
    async waitForReceipt(hash) {
      return receipts.get(hash) ?? { status: 'success', settledRaw: 0n }
    },
    async verifyNimPayment(p) {
      // Hashes that start with 'dead' are invalid, 'babe' never confirm; everything else is final.
      if (p.hash.startsWith('dead')) return { status: 'invalid', reason: 'memo mismatch' }
      if (p.hash.startsWith('babe')) return { status: 'not_found' }
      const tx = {
        hash: p.hash, blockNumber: 1, confirmations: 60, from: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', to: p.to,
        value: Number(p.minLuna), fee: 0, senderData: '', recipientData: '', networkId: 24, executionResult: true,
      }
      return { status: 'final', tx }
    },
    async nimBalanceLuna() { return 1_824_000_000n },
  }
}
