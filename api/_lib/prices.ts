import { FX_URL, PRICE_URL } from '../../shared/constants'
import { dayOf } from '../../shared/summary-math'
import { db } from './db'
import { env } from './env'

export type Prices = { nimUsd: number; polUsd: number; usdGhs: number; fxSource: string; at: number }

const TTL_MS = 60_000
let cache: Prices | null = null
let inflight: Promise<Prices> | null = null

const MOCK: Prices = { nimUsd: 0.000267, polUsd: 0.0906, usdGhs: 11.7, fxSource: 'mock', at: 0 }

export async function getPrices(): Promise<Prices> {
  if (env.chainMode === 'mock') return { ...MOCK, at: Date.now() }
  if (cache && Date.now() - cache.at < TTL_MS) return cache
  inflight ??= fetchPrices().finally(() => { inflight = null })
  return inflight
}

async function fetchPrices(): Promise<Prices> {
  const [coins, fx] = await Promise.all([fetchCoins(), fetchFx()])
  cache = { ...coins, ...fx, at: Date.now() }
  return cache
}

async function fetchCoins() {
  const res = await fetch(PRICE_URL, { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) throw new Error(`prices ${res.status}`)
  const json: any = await res.json()
  const nimUsd = json?.coins?.['coingecko:nimiq-2']?.price
  const polUsd = json?.coins?.['coingecko:polygon-ecosystem-token']?.price
  if (!(nimUsd > 0) || !(polUsd > 0)) throw new Error('prices: missing NIM or POL')
  return { nimUsd, polUsd }
}

async function fetchFx(): Promise<{ usdGhs: number; fxSource: string }> {
  try {
    const res = await fetch(FX_URL, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new Error(`fx ${res.status}`)
    const json: any = await res.json()
    const usdGhs = json?.rates?.GHS
    if (!(usdGhs > 0)) throw new Error('fx: missing GHS')
    return { usdGhs, fxSource: 'open.er-api.com' }
  } catch (e) {
    // Fall back to the last stored daily rate.
    const { sql } = await db()
    const rows = await sql`select usd_ghs from fx_daily order by day desc limit 1`
    if (rows[0]) return { usdGhs: Number(rows[0].usd_ghs), fxSource: 'fx_daily' }
    throw e
  }
}

/** Stores today's rate; called by the daily cron and after the first successful price fetch of a day. */
export async function storeTodayRate(p?: Prices) {
  const prices = p ?? (await getPrices())
  const { sql } = await db()
  const today = dayOf(new Date())
  await sql`insert into fx_daily (day, usd_ghs, source) values (${today}, ${prices.usdGhs}, ${prices.fxSource})
    on conflict (day) do update set usd_ghs = excluded.usd_ghs, source = excluded.source`
  return { day: today, usdGhs: prices.usdGhs }
}

export async function fxRows(): Promise<{ day: string; usdGhs: number }[]> {
  const { sql } = await db()
  const rows = await sql`select to_char(day, 'YYYY-MM-DD') as day, usd_ghs from fx_daily order by day`
  return rows.map((r) => ({ day: String(r.day), usdGhs: Number(r.usd_ghs) }))
}
