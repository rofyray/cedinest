import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { MAX_UINT256 } from '../../shared/constants.js'
import { ageQuotes, body, freshApi, OWNER, randomNimHash, req, signIn, signPermit, waitForJob } from './helpers.js'

let api: Awaited<ReturnType<typeof freshApi>>

beforeAll(async () => { api = await freshApi() })
// The per-owner rate limit is 5 quotes a minute; age earlier quotes so each test starts fresh.
beforeEach(async () => { await ageQuotes() })

async function quoteDeposit(amount = '20000000', goalId?: string, owner: `0x${string}` = OWNER) {
  const res = await api.quote.POST(req('POST', '/api/quote', { kind: 'deposit', owner, nimAddress: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', amount, goalId }))
  return { res, q: await body(res) }
}

describe('health', () => {
  it('reports mock chain and a working database', async () => {
    const h = await body(await api.health.GET(req('GET', '/api/health')))
    expect(h.ok).toBe(true)
    expect(h.chainMode).toBe('mock')
    expect(h.missingConfig).toEqual([])
  })
})

describe('POST /api/quote', () => {
  it('prices a deposit with the 50 NIM floor and a salt-domain permit', async () => {
    const { res, q } = await quoteDeposit()
    expect(res.status).toBe(200)
    expect(q.quoteId).toMatch(/^q_[a-z2-7]{16}$/)
    expect(q.feeNim).toBe(50)
    expect(q.feeLuna).toBe('5000000')
    expect(q.memo).toBe(`cedinest:${q.quoteId}`)
    expect(q.permit.token).toBe('usdt0')
    expect(q.permit.value).toBe('20000000')
    expect(q.permit.nonce).toBe('0')
    expect(Number(q.permit.deadline)).toBeGreaterThan(Date.now() / 1000)
  })

  it('rejects a bad owner, a zero amount and a deposit under 1 USDT', async () => {
    const bad = await api.quote.POST(req('POST', '/api/quote', { kind: 'deposit', owner: 'nope', amount: '1000000' }))
    expect(bad.status).toBe(400)
    const zero = await api.quote.POST(req('POST', '/api/quote', { kind: 'deposit', owner: OWNER, amount: '0' }))
    expect(zero.status).toBe(400)
    const small = await api.quote.POST(req('POST', '/api/quote', { kind: 'deposit', owner: OWNER, amount: '999999' }))
    expect(small.status).toBe(400)
    expect((await body(small)).code).toBe('minimum')
  })

  it('rejects a deposit above the wallet balance with not_enough_usdt', async () => {
    const { res, q } = await quoteDeposit('500000000')
    expect(res.status).toBe(400)
    expect(q.error).toBe('not_enough_usdt')
    expect(q.have).toBe('100000000')
  })

  it('rejects a withdraw when nothing is saved', async () => {
    const other = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a')
    const res = await api.quote.POST(req('POST', '/api/quote', { kind: 'withdraw', owner: other.address, amount: 'max' }))
    expect(res.status).toBe(400)
    expect((await body(res)).error).toBe('nothing_to_withdraw')
  })

  it('rate limits after 5 quotes a minute', async () => {
    const other = privateKeyToAccount('0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6')
    let last: { res: Response; q: any } | null = null
    for (let i = 0; i < 6; i++) last = await quoteDeposit('1000000', undefined, other.address)
    expect(last!.res.status).toBe(429)
    expect(last!.q.error).toBe('slow_down')
  })

  it('refuses while the relayer is low on POL', async () => {
    process.env.MOCK_RELAYER_POL = '0.2'
    const { res, q } = await quoteDeposit()
    delete process.env.MOCK_RELAYER_POL
    expect(res.status).toBe(503)
    expect(q.error).toBe('relayer_low')
  })

  it('refuses deposits while the reserve is paused', async () => {
    process.env.MOCK_RESERVE_PAUSED = '1'
    const { res, q } = await quoteDeposit()
    delete process.env.MOCK_RESERVE_PAUSED
    expect(res.status).toBe(409)
    expect(q.error).toBe('saving_paused')
  })
})

describe('POST /api/jobs and the state machine', () => {
  it('accepts an owner address with a wrong mixed-case checksum', async () => {
    const miscased = OWNER.slice(0, 6).toLowerCase() + OWNER.slice(6).toUpperCase()
    const res = await api.summary.GET(req('GET', `/api/summary?owner=${miscased}`))
    expect(res.status).toBe(200)
    expect((await body(res)).owner).toBe(OWNER.toLowerCase())
    const q = await api.quote.POST(req('POST', '/api/quote', { kind: 'deposit', owner: miscased, amount: '5000000' }))
    expect(q.status).toBe(200)
  })

  it('runs a deposit from quote to done and shows the stamp in the summary', async () => {
    const { q } = await quoteDeposit('20000000')
    const signature = await signPermit('usdt0', OWNER, q.permit)
    const res = await api.jobs.POST(req('POST', '/api/jobs', { quoteId: q.quoteId, nimTxHash: randomNimHash(), signature }))
    expect(res.status).toBe(202)
    const { jobId } = await body(res)
    expect(jobId).toMatch(/^j_/)
    const job = await waitForJob(api, jobId)
    expect(job.status).toBe('done')
    expect(job.polygonTxHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(job.usdAmount).toBe('20.000000')

    const s = await body(await api.summary.GET(req('GET', `/api/summary?owner=${OWNER}&nim=NQ07%200000`)))
    expect(s.usdt.wallet).toBe('80000000')
    expect(BigInt(s.usdt.saved)).toBeGreaterThanOrEqual(20_000_000n)
    expect(s.principalUsd).toBe('20.00')
    expect(Number(s.interestUsd)).toBeGreaterThan(0)
    expect(s.stamps).toHaveLength(1)
    expect(s.stamps[0].usd).toBe('20.00')
    expect(s.chart).toHaveLength(1)
    expect(s.chart[0].keptInCedisGhs).toBeCloseTo(20 * 11.7, 2)
    expect(s.nim.balanceLuna).toBeUndefined()
    expect(s.goalsLocked).toBe(true)
  })

  it('rejects a signature from another wallet with bad_signature', async () => {
    const { q } = await quoteDeposit('5000000')
    const other = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba')
    const signature = await signPermit('usdt0', OWNER, q.permit, other)
    const res = await api.jobs.POST(req('POST', '/api/jobs', { quoteId: q.quoteId, nimTxHash: randomNimHash(), signature }))
    expect(res.status).toBe(400)
    expect((await body(res)).error).toBe('bad_signature')
  })

  it('refuses a reused quote, a reused NIM hash and a malformed hash', async () => {
    const { q } = await quoteDeposit('5000000')
    const signature = await signPermit('usdt0', OWNER, q.permit)
    const hash = randomNimHash()
    const first = await api.jobs.POST(req('POST', '/api/jobs', { quoteId: q.quoteId, nimTxHash: hash, signature }))
    expect(first.status).toBe(202)
    await waitForJob(api, (await body(first)).jobId)
    const again = await api.jobs.POST(req('POST', '/api/jobs', { quoteId: q.quoteId, nimTxHash: randomNimHash(), signature }))
    expect(again.status).toBe(409)
    expect((await body(again)).error).toBe('quote_used')

    const { q: q2 } = await quoteDeposit('5000000')
    const sig2 = await signPermit('usdt0', OWNER, q2.permit)
    const reused = await api.jobs.POST(req('POST', '/api/jobs', { quoteId: q2.quoteId, nimTxHash: hash, signature: sig2 }))
    expect(reused.status).toBe(409)
    expect((await body(reused)).error).toBe('fee_reused')

    const malformed = await api.jobs.POST(req('POST', '/api/jobs', { quoteId: q2.quoteId, nimTxHash: 'xyz', signature: sig2 }))
    expect(malformed.status).toBe(400)
  })

  it('stores a job with a null signature as refund_due once the fee verifies', async () => {
    const { q } = await quoteDeposit('5000000')
    const res = await api.jobs.POST(req('POST', '/api/jobs', { quoteId: q.quoteId, nimTxHash: randomNimHash(), signature: null }))
    expect(res.status).toBe(202)
    const job = await waitForJob(api, (await body(res)).jobId)
    expect(job.status).toBe('refund_due')
  })

  it('fails a job whose NIM payment is invalid, without moving money', async () => {
    const { q } = await quoteDeposit('5000000')
    const signature = await signPermit('usdt0', OWNER, q.permit)
    const res = await api.jobs.POST(req('POST', '/api/jobs', { quoteId: q.quoteId, nimTxHash: randomNimHash('dead'), signature }))
    const job = await waitForJob(api, (await body(res)).jobId)
    expect(job.status).toBe('failed')
    expect(job.error).toMatch(/memo mismatch/)
    const s = await body(await api.summary.GET(req('GET', `/api/summary?owner=${OWNER}`)))
    expect(s.principalUsd).toBe('25.00')
  })

  it('withdraws everything with a max permit on aPolUSDT', async () => {
    const qres = await api.quote.POST(req('POST', '/api/quote', { kind: 'withdraw', owner: OWNER, amount: 'max' }))
    const q = await body(qres)
    expect(qres.status).toBe(200)
    expect(q.permit.token).toBe('apolusdt')
    expect(BigInt(q.permit.value)).toBe(MAX_UINT256)
    const signature = await signPermit('apolusdt', OWNER, q.permit)
    const res = await api.jobs.POST(req('POST', '/api/jobs', { quoteId: q.quoteId, nimTxHash: randomNimHash(), signature }))
    expect(res.status).toBe(202)
    const job = await waitForJob(api, (await body(res)).jobId)
    expect(job.status).toBe('done')
    expect(Number(job.usdAmount)).toBeGreaterThan(25)
    const s = await body(await api.summary.GET(req('GET', `/api/summary?owner=${OWNER}`)))
    expect(s.usdt.saved).toBe('0')
    expect(Number(s.principalUsd)).toBeLessThanOrEqual(0)
  })
})

describe('sessions, goals and profile', () => {
  it('signs in with personal_sign and manages goals', async () => {
    const token = await signIn(api)
    const auth = { authorization: `Bearer ${token}` }

    const unauth = await api.goals.GET(req('GET', '/api/goals'))
    expect(unauth.status).toBe(401)

    const created = await api.goals.POST(req('POST', '/api/goals', { name: 'Rent, January', targetGhs: 6000, targetDate: '2027-01-31' }, auth))
    expect(created.status).toBe(201)
    const goal = await body(created)
    expect(goal.id).toMatch(/^g_/)
    expect(goal.targetGhs).toBe(6000)
    expect(goal.targetDate).toBe('2027-01-31')

    const tooLong = await api.goals.POST(req('POST', '/api/goals', { name: 'x'.repeat(41), targetGhs: 10 }, auth))
    expect(tooLong.status).toBe(400)

    const patched = await body(await api.goalById.PATCH(req('PATCH', `/api/goals/${goal.id}`, { targetGhs: 6500, targetDate: null }, auth), { params: { id: goal.id } }))
    expect(patched.targetGhs).toBe(6500)
    expect(patched.targetDate).toBeUndefined()

    // A deposit tagged with the goal shows up as progress.
    const { q } = await quoteDeposit('10000000', goal.id)
    const signature = await signPermit('usdt0', OWNER, q.permit)
    const res = await api.jobs.POST(req('POST', '/api/jobs', { quoteId: q.quoteId, nimTxHash: randomNimHash(), signature }))
    await waitForJob(api, (await body(res)).jobId)
    const s = await body(await api.summary.GET(req('GET', `/api/summary?owner=${OWNER}`, undefined, auth)))
    expect(s.goalsLocked).toBe(false)
    expect(s.goals).toHaveLength(1)
    expect(s.goals[0].savedGhs).toBeGreaterThan(100)
    expect(s.goals[0].percent).toBeGreaterThanOrEqual(1)

    const archived = await body(await api.goalById.PATCH(req('PATCH', `/api/goals/${goal.id}`, { archived: true }, auth), { params: { id: goal.id } }))
    expect(archived.archived).toBe(true)
    const s2 = await body(await api.summary.GET(req('GET', `/api/summary?owner=${OWNER}`, undefined, auth)))
    expect(s2.goals).toHaveLength(0)
  })

  it('rejects a bad sign-in signature and an expired challenge', async () => {
    const ch = await body(await api.challenge.POST(req('POST', '/api/session/challenge', { owner: OWNER })))
    const other = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba')
    const signature = await other.signMessage({ message: ch.message })
    const res = await api.session.POST(req('POST', '/api/session', { owner: OWNER, nonce: ch.nonce, issued: ch.issued, signature }))
    expect(res.status).toBe(400)
    expect((await body(res)).error).toBe('bad_signature')
    const replay = await api.session.POST(req('POST', '/api/session', { owner: OWNER, nonce: ch.nonce, issued: ch.issued, signature }))
    expect((await body(replay)).error).toBe('challenge_expired')
  })

  it('stores consent and a first name on the profile', async () => {
    const token = await signIn(api)
    const auth = { authorization: `Bearer ${token}` }
    const noConsent = await api.profile.POST(req('POST', '/api/profile', { name: 'Yaw' }, auth))
    expect(noConsent.status).toBe(400)
    const ok = await body(await api.profile.POST(req('POST', '/api/profile', { name: 'Yaw', consent: true }, auth)))
    expect(ok.name).toBe('Yaw')
    const s = await body(await api.summary.GET(req('GET', `/api/summary?owner=${OWNER}`)))
    expect(s.profile).toEqual({ name: 'Yaw', consented: true })
  })
})

describe('GET /api/cron/daily', () => {
  it('needs the cron secret and stores the day rate', async () => {
    const denied = await api.cron.GET(req('GET', '/api/cron/daily'))
    expect(denied.status).toBe(401)
    const ok = await body(await api.cron.GET(req('GET', '/api/cron/daily', undefined, { authorization: 'Bearer cron-secret' })))
    expect(ok.rate.usdGhs).toBe(11.7)
    expect(ok.refundDue.length).toBeGreaterThanOrEqual(1)
    expect(ok.relayerPol).toBe(5)
  })
})
