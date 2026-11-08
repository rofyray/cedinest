import { isEvmAddress } from '../../shared/ids.js'
import { chartSeries, dayOf, goalProgress, principalUsd, round2, stampsThisMonth, type DoneJob } from '../../shared/summary-math.js'
import { chain } from './chain.js'
import { db } from './db.js'
import { HttpError } from './http.js'
import { fxRows, getPrices } from './prices.js'
import { GAS_DEPOSIT, GAS_WITHDRAW, quoteFee } from '../../shared/fees.js'

export async function buildSummary(ownerParam: string, sessionOwner: string | null, nimAddress?: string | null) {
  if (!isEvmAddress(ownerParam)) throw new HttpError(400, 'bad_request', 'owner must be a 0x address')
  const owner = ownerParam.toLowerCase()
  const ownerChecksum = ownerParam as `0x${string}`
  const { sql } = await db()
  const c = await chain()

  const [wallet, saved, reserve, prices, fx, jobRows, goalRows, profileRows, nimBalance, gasPriceWei] = await Promise.all([
    c.usdtBalance(ownerChecksum),
    c.aTokenBalance(ownerChecksum),
    c.reserve(),
    getPrices(),
    fxRows(),
    sql`select kind, usd_amount, ghs_rate, goal_id, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD') as day
        from jobs where owner = ${owner} and status = 'done' order by updated_at`,
    sessionOwner === owner
      ? sql`select id, name, target_ghs, to_char(target_date, 'YYYY-MM-DD') as target_date from goals where owner = ${owner} and archived = false order by created_at`
      : Promise.resolve([] as any[]),
    sql`select display_name, consented_at from profiles where owner = ${owner}`,
    nimAddress ? c.nimBalanceLuna(nimAddress) : Promise.resolve(null),
    c.gasPriceWei().catch(() => 232_000_000_000n),
  ])
  const feeOf = (gas: bigint) => {
    const f = quoteFee({ gas, gasPriceWei, polUsd: prices.polUsd, nimUsd: prices.nimUsd })
    return { nim: f.feeNim, usd: f.feeUsd }
  }

  const jobs: DoneJob[] = jobRows.map((r) => ({
    kind: r.kind, usdAmount: Number(r.usd_amount), ghsRate: Number(r.ghs_rate), goalId: r.goal_id ?? null, day: String(r.day),
  }))
  const savedUsd = Number(saved) / 1e6
  const principal = principalUsd(jobs)
  const today = dayOf(new Date())
  const goals = goalProgress(
    goalRows.map((g) => ({ id: g.id, name: g.name, targetGhs: Number(g.target_ghs), targetDate: g.target_date ?? null })),
    jobs, savedUsd, prices.usdGhs,
  )

  return {
    owner,
    usdt: { wallet: wallet.toString(), saved: saved.toString() },
    principalUsd: round2(principal).toFixed(2),
    interestUsd: round2(Math.max(0, savedUsd - principal)).toFixed(2),
    usdGhs: prices.usdGhs,
    apy: reserve.apy,
    reserve: { active: reserve.active, frozen: reserve.frozen, paused: reserve.paused },
    nim: { address: nimAddress ?? '', balanceLuna: nimBalance != null ? nimBalance.toString() : undefined },
    chart: chartSeries({ jobs, fx, today, savedUsd, todayRate: prices.usdGhs }),
    stamps: stampsThisMonth(jobs, today),
    goals,
    goalsLocked: sessionOwner !== owner,
    profile: { name: profileRows[0]?.display_name ?? null, consented: !!profileRows[0]?.consented_at },
    savesCount: jobs.filter((j) => j.kind === 'deposit').length,
    fee: { deposit: feeOf(GAS_DEPOSIT), withdraw: feeOf(GAS_WITHDRAW) },
  }
}
