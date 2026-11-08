export class ApiError extends Error {
  status: number
  code: string
  extra: Record<string, any>
  constructor(status: number, code: string, message: string, extra: Record<string, any> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export type Quote = {
  quoteId: string; kind: 'deposit' | 'withdraw'; feeLuna: string; feeNim: number; feeUsd: number
  nimRecipient: string; memo: string
  permit: { token: 'usdt0' | 'apolusdt'; spender: `0x${string}`; value: string; nonce: string; deadline: string }
  expiresAt: string
}

export type JobStatus = 'fee_pending' | 'fee_final' | 'submitted' | 'done' | 'failed' | 'refund_due'
export type Job = {
  id: string; status: JobStatus; kind: 'deposit' | 'withdraw'; amountRaw: string; goalId: string | null
  nimTxHash: string; polygonTxHash?: string; usdAmount?: string; error?: string; updatedAt: string
}

export type Goal = { id: string; name: string; targetGhs: number; targetDate?: string; archived?: boolean }
export type GoalProgress = Goal & { savedGhs: number; percent: number }

export type Summary = {
  owner: string
  usdt: { wallet: string; saved: string }
  principalUsd: string
  interestUsd: string
  usdGhs: number
  apy: number
  reserve: { active: boolean; frozen: boolean; paused: boolean }
  nim: { address: string; balanceLuna?: string }
  chart: { day: string; savingsGhs: number; keptInCedisGhs: number }[]
  stamps: { day: string; usd: string }[]
  goals: GoalProgress[]
  goalsLocked: boolean
  profile: { name: string | null; consented: boolean }
  savesCount: number
  fee: { deposit: { nim: number; usd: number }; withdraw: { nim: number; usd: number } }
}

const TOKEN_KEY = 'cedinest.session'
export const session = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) ?? '' } catch { return '' } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t) } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } },
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const token = session.get()
  if (token) headers.authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'offline', 'offline')
  }
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) {
    if (res.status === 401) session.clear()
    const { error, message, ...extra } = json
    throw new ApiError(res.status, error ?? 'internal', message ?? res.statusText, extra)
  }
  return json as T
}

export const api = {
  summary: (owner: string, nim?: string) =>
    call<Summary>('GET', `/api/summary?owner=${owner}${nim ? `&nim=${encodeURIComponent(nim)}` : ''}`),
  quote: (p: { kind: 'deposit' | 'withdraw'; owner: string; nimAddress: string; amount: string; goalId?: string | null }) =>
    call<Quote>('POST', '/api/quote', p),
  createJob: (p: { quoteId: string; nimTxHash: string; signature: string | null }) =>
    call<{ jobId: string }>('POST', '/api/jobs', p),
  job: (id: string) => call<Job>('GET', `/api/jobs/${id}`),
  challenge: (owner: string) => call<{ nonce: string; issued: string; message: string }>('POST', '/api/session/challenge', { owner }),
  session: (p: { owner: string; nonce: string; issued: string; signature: string }) => call<{ token: string }>('POST', '/api/session', p),
  goals: () => call<{ goals: Goal[] }>('GET', '/api/goals'),
  createGoal: (p: { name: string; targetGhs: number; targetDate?: string | null }) => call<Goal>('POST', '/api/goals', p),
  updateGoal: (id: string, p: Partial<{ name: string; targetGhs: number; targetDate: string | null; archived: boolean }>) =>
    call<Goal>('PATCH', `/api/goals/${id}`, p),
  profile: (p: { name: string | null; consent: true }) => call<{ ok: true; name: string | null }>('POST', '/api/profile', p),
}
