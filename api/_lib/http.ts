export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra: Record<string, unknown> = {}) {
    super(message ?? code)
  }
}

const baseHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    status, headers: { ...baseHeaders, ...headers },
  })
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.code, message: e.message, ...e.extra }, e.status)
  console.error('[api] unhandled', e)
  return json({ error: 'internal', message: 'Something broke on our side. Your money is where you left it.' }, 500)
}

export async function readJson<T = any>(req: Request): Promise<T> {
  try {
    const text = await req.text()
    return (text ? JSON.parse(text) : {}) as T
  } catch {
    throw new HttpError(400, 'bad_request', 'body is not JSON')
  }
}

/** Wraps a handler so thrown HttpErrors become JSON responses. */
export function handler(fn: (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>) {
  return async (req: Request, ctx?: { params?: Record<string, string> }) => {
    try {
      return await fn(req, { params: ctx?.params ?? paramsFromUrl(req) })
    } catch (e) {
      return errorResponse(e)
    }
  }
}

/** Vercel passes dynamic segments as query params; the dev server passes them in ctx. */
function paramsFromUrl(req: Request) {
  const url = new URL(req.url)
  const params: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { params[k] = v })
  const parts = url.pathname.split('/').filter(Boolean)
  // /api/jobs/:id and /api/goals/:id
  if (parts.length === 3 && parts[0] === 'api' && (parts[1] === 'jobs' || parts[1] === 'goals')) params.id = parts[2]!
  return params
}

export function bearer(req: Request) {
  const h = req.headers.get('authorization') ?? ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}
