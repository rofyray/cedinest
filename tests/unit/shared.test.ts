import { describe, expect, it } from 'vitest'
import { hashDomain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { apyFromLiquidityRate, reserveFlags } from '../../shared/apy.js'
import { APOLUSDT_DOMAIN, APOLUSDT_DOMAIN_TYPE, USDT0_DOMAIN, USDT0_DOMAIN_TYPE } from '../../shared/constants.js'
import { quoteFee } from '../../shared/fees.js'
import { isJobId, isNimTxHash, isQuoteId, memoFor, newJobId, newQuoteId } from '../../shared/ids.js'
import { hexToUtf8, normaliseNimAddress, verifyNimPayment, waitForFinalNimPayment, type NimRpc } from '../../shared/nimiq-verify.js'
import { monthCells } from '../../shared/stamps.js'
import { chartSeries, goalProgress, stampsThisMonth } from '../../shared/summary-math.js'
import { permitTypedData, permitTypedDataJson, recoverPermitSigner } from '../../shared/typed-data.js'

describe('fee maths', () => {
  it('applies the 50 NIM floor at Nov 8 prices', () => {
    const f = quoteFee({ gas: 300_000n, gasPriceWei: 232_000_000_000n, polUsd: 0.0906, nimUsd: 0.000267 })
    expect(f.feeNim).toBe(50)
    expect(f.feeLuna).toBe(5_000_000n)
    expect(f.gasUsd).toBeCloseTo(0.0063, 3)
    expect(f.feeUsd).toBeCloseTo(0.01335, 4)
  })
  it('rises in steps of 10 NIM when gas spikes', () => {
    const f = quoteFee({ gas: 300_000n, gasPriceWei: 2_000_000_000_000n, polUsd: 0.0906, nimUsd: 0.000267 })
    expect(f.feeNim % 10).toBe(0)
    expect(f.feeNim).toBeGreaterThan(50)
    expect(f.feeNim * 0.000267).toBeGreaterThanOrEqual(f.gasUsd * 1.5)
  })
})

describe('APY and reserve flags', () => {
  it('turns a ray rate into 3.67%', () => {
    // 3.67% APY corresponds to about 3.604% APR
    const apr = 0.03604
    expect(apyFromLiquidityRate(BigInt(Math.round(apr * 1e27)))).toBeCloseTo(0.0367, 4)
  })
  it('reads active, frozen and paused bits', () => {
    expect(reserveFlags(1n << 56n)).toEqual({ active: true, frozen: false, paused: false })
    expect(reserveFlags((1n << 56n) | (1n << 57n))).toEqual({ active: true, frozen: true, paused: false })
    expect(reserveFlags((1n << 56n) | (1n << 60n))).toEqual({ active: true, frozen: false, paused: true })
  })
})

describe('ids and memo', () => {
  it('makes q_ and j_ ids of 16 base32 chars and a memo under 64 bytes', () => {
    const q = newQuoteId(); const j = newJobId()
    expect(isQuoteId(q)).toBe(true)
    expect(isJobId(j)).toBe(true)
    expect(isQuoteId(j)).toBe(false)
    const memo = memoFor(q)
    expect(memo).toBe(`cedinest:${q}`)
    expect(new TextEncoder().encode(memo).length).toBeLessThanOrEqual(64)
  })
  it('validates NIM tx hashes', () => {
    expect(isNimTxHash('a'.repeat(64))).toBe(true)
    expect(isNimTxHash('a'.repeat(63))).toBe(false)
    expect(isNimTxHash('0x' + 'a'.repeat(62))).toBe(false)
  })
})

describe('typed data', () => {
  const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
  const permit = { spender: '0x000000000000000000000000000000000000dEaD' as const, value: '20000000', nonce: '0', deadline: '1800000000' }

  it('hashes the USDT0 salt domain and the aPolUSDT chainId domain to the mainnet separators', () => {
    // Values checked against DOMAIN_SEPARATOR() on Polygon mainnet (block 96,937,704).
    const usdt0 = hashDomain({ domain: USDT0_DOMAIN, types: { EIP712Domain: [...USDT0_DOMAIN_TYPE] } })
    const aToken = hashDomain({ domain: { ...APOLUSDT_DOMAIN, chainId: 137n }, types: { EIP712Domain: [...APOLUSDT_DOMAIN_TYPE] } })
    expect(usdt0.startsWith('0x7b43b7de')).toBe(true)
    expect(aToken.startsWith('0x6779dbf8')).toBe(true)
  })

  it('builds eth_signTypedData_v4 JSON with the salt domain and no chainId for USDT0', () => {
    const td = permitTypedDataJson('usdt0', account.address, permit)
    expect(td.types.EIP712Domain.map((f) => f.name)).toEqual(['name', 'version', 'verifyingContract', 'salt'])
    expect((td.domain as any).chainId).toBeUndefined()
    expect(td.primaryType).toBe('Permit')
    const td2 = permitTypedDataJson('apolusdt', account.address, permit)
    expect(td2.types.EIP712Domain.map((f) => f.name)).toEqual(['name', 'version', 'chainId', 'verifyingContract'])
  })

  it('recovers the signer for both domains', async () => {
    for (const token of ['usdt0', 'apolusdt'] as const) {
      const sig = await account.signTypedData(permitTypedData(token, account.address, permit))
      const recovered = await recoverPermitSigner(token, account.address, permit, sig)
      expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
      const wrong = await recoverPermitSigner(token, account.address, { ...permit, value: '1' }, sig)
      expect(wrong.toLowerCase()).not.toBe(account.address.toLowerCase())
    }
  })
})

describe('Nimiq payment verifier', () => {
  const FEE = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001'
  const memoHex = Array.from(new TextEncoder().encode('cedinest:q_abcdefghijklmnop'), (b) => b.toString(16).padStart(2, '0')).join('')
  const tx = {
    hash: 'f'.repeat(64), blockNumber: 66_335_220, confirmations: 10, from: 'NQ02 1111', to: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001',
    value: 5_000_000, fee: 0, senderData: '', recipientData: memoHex, networkId: 24, executionResult: true,
  }
  const rpcWith = (head: number, override: Partial<typeof tx> = {}, missing = false): NimRpc => async (method) => {
    if (method === 'getTransactionByHash') { if (missing) throw new Error('not found'); return { ...tx, ...override } as any }
    if (method === 'getBlockNumber') return head as any
    throw new Error(method)
  }
  const want = { hash: tx.hash, to: FEE, minLuna: 5_000_000n, memo: 'cedinest:q_abcdefghijklmnop' }

  it('decodes the memo and normalises addresses', () => {
    expect(hexToUtf8(memoHex)).toBe('cedinest:q_abcdefghijklmnop')
    expect(normaliseNimAddress('nq07 0000 0000')).toBe('NQ0700000000')
  })
  it('is final once the block is at or under the last macro block', async () => {
    expect((await verifyNimPayment(want, rpcWith(66_335_280))).status).toBe('final')
    expect((await verifyNimPayment(want, rpcWith(66_335_220))).status).toBe('final') // exactly on the macro block
  })
  it('is included but not final before the next macro block', async () => {
    const r = await verifyNimPayment(want, rpcWith(66_335_250, { blockNumber: 66_335_230 }))
    expect(r.status).toBe('included')
    if (r.status === 'included') expect(r.blocksToFinal).toBe(30)
  })
  it('rejects wrong network, recipient, amount, memo and failed execution', async () => {
    const reasons = await Promise.all([
      verifyNimPayment(want, rpcWith(1e9, { networkId: 5 })),
      verifyNimPayment(want, rpcWith(1e9, { to: 'NQ02 2222' })),
      verifyNimPayment(want, rpcWith(1e9, { value: 4_999_999 })),
      verifyNimPayment(want, rpcWith(1e9, { recipientData: '00' })),
      verifyNimPayment(want, rpcWith(1e9, { executionResult: false })),
    ])
    expect(reasons.map((r) => (r.status === 'invalid' ? r.reason : r.status))).toEqual([
      'wrong network', 'wrong recipient', 'amount too low', 'memo mismatch', 'execution failed',
    ])
  })
  it('falls back to senderData when recipientData is empty', async () => {
    const r = await verifyNimPayment(want, rpcWith(1e9, { recipientData: '', senderData: memoHex }))
    expect(r.status).toBe('final')
  })
  it('reports not_found for an unknown hash and polls until final', async () => {
    expect((await verifyNimPayment(want, rpcWith(1e9, {}, true))).status).toBe('not_found')
    let head = 66_335_250
    const rpc: NimRpc = async (m) => (m === 'getBlockNumber' ? ((head += 20) as any) : ({ ...tx, blockNumber: 66_335_270 } as any))
    const r = await waitForFinalNimPayment(want, 5_000, rpc, 1)
    expect(r.status).toBe('final')
  })
})

describe('stamp card', () => {
  it('lays out November 2026 with stamps, today and summed same-day saves', () => {
    const cells = monthCells(2026, 10, [
      { day: '2026-11-01', usd: '20.00' }, { day: '2026-11-02', usd: '10.00' }, { day: '2026-11-02', usd: '5.50' }, { day: '2026-11-07', usd: '20.00' },
    ], new Date('2026-11-08T10:00:00Z'))
    expect(cells).toHaveLength(30)
    expect(cells[0]!.stamp).toEqual({ label: '$20', rotate: -9 })
    expect(cells[1]!.stamp).toEqual({ label: '$16', rotate: 6 })
    expect(cells[6]!.stamp?.rotate).toBe(-4)
    expect(cells.filter((c) => c.isToday).map((c) => c.n)).toEqual([8])
    expect(cells[2]!.stamp).toBeNull()
  })
})

describe('summary maths', () => {
  const jobs = [
    { kind: 'deposit' as const, usdAmount: 20, ghsRate: 11.0, day: '2026-11-01', goalId: 'g_a' },
    { kind: 'deposit' as const, usdAmount: 10, ghsRate: 11.5, day: '2026-11-03', goalId: null },
    { kind: 'withdraw' as const, usdAmount: 5, ghsRate: 11.6, day: '2026-11-04', goalId: 'g_a' },
  ]
  it('builds a daily series from the first save to today with the last rate carried forward', () => {
    const s = chartSeries({ jobs, fx: [{ day: '2026-11-01', usdGhs: 11.0 }, { day: '2026-11-03', usdGhs: 11.5 }], today: '2026-11-05', savedUsd: 25.1, todayRate: 11.7 })
    expect(s.map((p) => p.day)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'])
    expect(s[0]!.savingsGhs).toBeCloseTo(20 * 11.0, 1)
    expect(s[1]!.savingsGhs).toBeGreaterThan(s[0]!.savingsGhs) // interest share grows, rate carried forward
    expect(s[2]!.keptInCedisGhs).toBeCloseTo(20 * 11 + 10 * 11.5, 2)
    expect(s[3]!.keptInCedisGhs).toBeCloseTo(20 * 11 + 10 * 11.5 - 5 * 11.6, 2)
    expect(s[4]!.savingsGhs).toBeCloseTo(25.1 * 11.7, 1)
  })
  it('gives one point on the first day', () => {
    const s = chartSeries({ jobs: [jobs[0]!], fx: [], today: '2026-11-01', savedUsd: 20, todayRate: 11.7 })
    expect(s).toHaveLength(1)
    expect(s[0]!.savingsGhs).toBeCloseTo(234, 1)
  })
  it('splits interest across goals by their tagged principal', () => {
    const g = goalProgress([{ id: 'g_a', name: 'Rent', targetGhs: 6000, targetDate: null }], jobs, 25.5, 11.7)
    // tagged = 20 - 5 = 15 of 25 principal; interest 0.5 -> share 0.3
    expect(g[0]!.savedGhs).toBeCloseTo((15 + 0.3) * 11.7, 1)
    expect(g[0]!.percent).toBe(3)
  })
  it('lists this month deposits as stamps', () => {
    expect(stampsThisMonth(jobs, '2026-11-08')).toEqual([{ day: '2026-11-01', usd: '20.00' }, { day: '2026-11-03', usd: '10.00' }])
    expect(stampsThisMonth(jobs, '2026-12-08')).toEqual([])
  })
})
