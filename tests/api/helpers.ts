import { privateKeyToAccount } from 'viem/accounts'
import { permitTypedData, type PermitFields, type PermitToken } from '../../shared/typed-data.js'

/** A throwaway test wallet (Hardhat account #1). Never holds real funds. */
export const TEST_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
export const testAccount = privateKeyToAccount(TEST_KEY)
export const OWNER = testAccount.address

export function setupTestEnv() {
  process.env.CHAIN_MODE = 'mock'
  process.env.DATABASE_URL = ''
  process.env.SESSION_SECRET = 'test-secret'
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NIM_FEE_ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001'
}

export async function freshApi() {
  setupTestEnv()
  const dbMod = await import('../../api/_lib/db.js')
  const chainMod = await import('../../api/_lib/chain.js')
  dbMod.resetDbForTests()
  chainMod.resetChainForTests()
  await dbMod.db()
  const [quote, jobs, jobById, summary, challenge, session, goals, goalById, profile, cron, health] = await Promise.all([
    import('../../api/quote.js'), import('../../api/jobs/index.js'), import('../../api/jobs/[id].js'), import('../../api/summary.js'),
    import('../../api/session/challenge.js'), import('../../api/session/index.js'), import('../../api/goals/index.js'),
    import('../../api/goals/[id].js'), import('../../api/profile.js'), import('../../api/cron/daily.js'), import('../../api/health.js'),
  ])
  return { quote, jobs, jobById, summary, challenge, session, goals, goalById, profile, cron, health }
}

export function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function body<T = any>(res: Response): Promise<T> {
  return res.json() as Promise<T>
}

export function randomNimHash(prefix = '') {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return (prefix + hex).slice(0, 64)
}

export function signPermit(token: PermitToken, owner: `0x${string}`, p: PermitFields, account = testAccount) {
  return account.signTypedData(permitTypedData(token, owner, p))
}

export async function signIn(api: Awaited<ReturnType<typeof freshApi>>, account = testAccount) {
  const ch = await body(await api.challenge.POST(req('POST', '/api/session/challenge', { owner: account.address })))
  const signature = await account.signMessage({ message: ch.message })
  const s = await body(await api.session.POST(req('POST', '/api/session', { owner: account.address, nonce: ch.nonce, issued: ch.issued, signature })))
  return s.token as string
}

export const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

export async function waitForJob(api: Awaited<ReturnType<typeof freshApi>>, jobId: string, until: string[] = ['done', 'failed', 'refund_due'], timeoutMs = 10_000) {
  const start = Date.now()
  for (;;) {
    const j = await body(await api.jobById.GET(req('GET', `/api/jobs/${jobId}`), { params: { id: jobId } }))
    if (until.includes(j.status)) return j
    if (Date.now() - start > timeoutMs) throw new Error(`job ${jobId} stuck in ${j.status}`)
    await sleep(50)
  }
}

export async function ageQuotes() {
  const { db } = await import('../../api/_lib/db.js')
  const { sql } = await db()
  await sql`update quotes set created_at = created_at - interval '2 minutes'`
}
