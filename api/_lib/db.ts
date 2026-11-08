import { env } from './env.js'

export type Row = Record<string, any>
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>

type Driver = {
  sql: Sql
  /** One relayer send at a time, so nonces never collide across function instances. */
  withRelayerLock<T>(fn: () => Promise<T>): Promise<T>
  /** Runs db/schema.sql (used by tests and the local dev server). */
  migrate(): Promise<void>
}

let driverPromise: Promise<Driver> | null = null

export function db(): Promise<Driver> {
  driverPromise ??= createDriver()
  return driverPromise
}

/** Tests call this to start from a clean in-memory database. */
export function resetDbForTests() {
  driverPromise = null
}

async function createDriver(): Promise<Driver> {
  const url = env.databaseUrl
  if (!url && process.env.VERCEL) throw new Error('DATABASE_URL is not set')
  if (!url || url.startsWith('pglite://') || url === 'memory') return pgliteDriver(url.replace('pglite://', ''))
  return neonDriver(url)
}

async function neonDriver(url: string): Promise<Driver> {
  const { neon, Pool } = await import('@neondatabase/serverless')
  const sql = neon(url) as unknown as Sql
  const pool = new Pool({ connectionString: url })
  return {
    sql,
    async withRelayerLock(fn) {
      const client = await pool.connect()
      try {
        await client.query('select pg_advisory_lock(4207)')
        return await fn()
      } finally {
        await client.query('select pg_advisory_unlock(4207)').catch(() => {})
        client.release()
      }
    },
    async migrate() {
      const { readFileSync } = await import('node:fs')
      const { fileURLToPath } = await import('node:url')
      const { dirname, join } = await import('node:path')
      const here = dirname(fileURLToPath(import.meta.url))
      const schema = readFileSync(join(here, '..', '..', 'db', 'schema.sql'), 'utf8')
      const client = await pool.connect()
      try { await client.query(schema) } finally { client.release() }
    },
  }
}

async function pgliteDriver(dataDir: string): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = dataDir ? new PGlite(dataDir) : new PGlite()
  await pg.waitReady
  let lock: Promise<unknown> = Promise.resolve()
  const sql: Sql = async (strings, ...values) => {
    // Build a $1, $2 … query from the template.
    let text = ''
    strings.forEach((s, i) => { text += s; if (i < values.length) text += `$${i + 1}` })
    const res = await pg.query(text, values.map(normaliseParam))
    return res.rows as Row[]
  }
  const driver: Driver = {
    sql,
    withRelayerLock(fn) {
      const run = lock.then(fn, fn)
      lock = run.catch(() => {})
      return run
    },
    async migrate() {
      const { readFileSync } = await import('node:fs')
      const { fileURLToPath } = await import('node:url')
      const { dirname, join } = await import('node:path')
      const here = dirname(fileURLToPath(import.meta.url))
      const schema = readFileSync(join(here, '..', '..', 'db', 'schema.sql'), 'utf8')
      await pg.exec(schema)
    },
  }
  await driver.migrate()
  return driver
}

function normaliseParam(v: unknown) {
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return v.toISOString()
  return v
}

/** Compare-and-set a job's status; returns the row only if this caller won. */
export async function moveJob(id: string, from: string, to: string, extra: {
  polygonTxHash?: string | null; usdAmount?: string | null; ghsRate?: number | null; error?: string | null
} = {}) {
  const { sql } = await db()
  const rows = await sql`update jobs set status = ${to}, updated_at = now(),
    polygon_tx_hash = coalesce(${extra.polygonTxHash ?? null}, polygon_tx_hash),
    usd_amount = coalesce(${extra.usdAmount ?? null}::numeric, usd_amount),
    ghs_rate = coalesce(${extra.ghsRate ?? null}::numeric, ghs_rate),
    error = coalesce(${extra.error ?? null}, error),
    attempts = attempts + 1
    where id = ${id} and status = ${from} returning *`
  return rows[0] ?? null
}

export async function getJob(id: string) {
  const { sql } = await db()
  const rows = await sql`select * from jobs where id = ${id}`
  return rows[0] ?? null
}

export async function getQuote(id: string) {
  const { sql } = await db()
  const rows = await sql`select * from quotes where id = ${id}`
  return rows[0] ?? null
}
