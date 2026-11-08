/**
 * Local stand-in for Vercel Functions: serves /api/* from the handlers in ./api with Node's http module.
 * Used by `npm run dev` (Vite proxies /api here) and by the Playwright e2e tests.
 *
 *   CHAIN_MODE=mock npx tsx scripts/dev-api.ts     # fake chains, in-memory database
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const apiDir = join(here, '..', 'api')
const port = Number(process.env.API_PORT ?? 8787)

type Route = { pattern: RegExp; file: string; keys: string[] }
const routes: Route[] = [
  { pattern: /^\/api\/health$/, file: 'health.ts', keys: [] },
  { pattern: /^\/api\/quote$/, file: 'quote.ts', keys: [] },
  { pattern: /^\/api\/jobs$/, file: 'jobs/index.ts', keys: [] },
  { pattern: /^\/api\/jobs\/([^/]+)$/, file: 'jobs/[id].ts', keys: ['id'] },
  { pattern: /^\/api\/summary$/, file: 'summary.ts', keys: [] },
  { pattern: /^\/api\/session\/challenge$/, file: 'session/challenge.ts', keys: [] },
  { pattern: /^\/api\/session$/, file: 'session/index.ts', keys: [] },
  { pattern: /^\/api\/goals$/, file: 'goals/index.ts', keys: [] },
  { pattern: /^\/api\/goals\/([^/]+)$/, file: 'goals/[id].ts', keys: ['id'] },
  { pattern: /^\/api\/profile$/, file: 'profile.ts', keys: [] },
  { pattern: /^\/api\/cron\/daily$/, file: 'cron/daily.ts', keys: [] },
]

const modules = new Map<string, Promise<Record<string, any>>>()
const load = (file: string) => {
  let m = modules.get(file)
  if (!m) { m = import(pathToFileURL(join(apiDir, file)).href); modules.set(file, m) }
  return m
}

async function toRequest(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const body = Buffer.concat(chunks)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const url = `http://${req.headers.host ?? 'localhost'}${req.url}`
  return new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : body })
}

async function send(res: ServerResponse, out: Response) {
  res.statusCode = out.status
  out.headers.forEach((v, k) => res.setHeader(k, v))
  res.end(Buffer.from(await out.arrayBuffer()))
}

export const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0]!
  const route = routes.find((r) => r.pattern.test(path))
  if (!route) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' })); return }
  try {
    const m = await load(route.file)
    const fn = m[req.method ?? 'GET']
    if (!fn) { res.statusCode = 405; res.end(JSON.stringify({ error: 'method_not_allowed' })); return }
    const match = path.match(route.pattern)!
    const params: Record<string, string> = {}
    route.keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]!) })
    await send(res, await fn(await toRequest(req), { params }))
  } catch (e) {
    console.error('[dev-api]', e)
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'internal' }))
  }
})

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, () => console.log(`[dev-api] http://localhost:${port}  CHAIN_MODE=${process.env.CHAIN_MODE ?? 'real'}  DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'pglite (memory)'}`))
}
