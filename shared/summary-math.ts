/** Pure maths behind GET /api/summary, kept free of I/O so it can be unit tested. */

export type DoneJob = {
  kind: 'deposit' | 'withdraw'
  usdAmount: number      // settled USDT
  ghsRate: number        // USD to GHS at settlement
  day: string            // YYYY-MM-DD (UTC)
  goalId: string | null
}

export type FxRow = { day: string; usdGhs: number }

export const dayOf = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return dayOf(d)
}

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Net principal: done deposits minus done withdrawals. */
export function principalUsd(jobs: DoneJob[]) {
  return jobs.reduce((sum, j) => sum + (j.kind === 'deposit' ? j.usdAmount : -j.usdAmount), 0)
}

export type ChartPoint = { day: string; savingsGhs: number; keptInCedisGhs: number }

/**
 * For each day from the first save to today:
 *   savingsGhs(d)     = balanceUsd(d) x rate(d), balanceUsd = principal on d + interest spread evenly over the days so far
 *   keptInCedisGhs(d) = sum of each done job's usd x rate-at-settlement up to d, withdrawals negative
 * rate(d) is that day's fx row, carrying the last known rate forward across gaps.
 */
export function chartSeries(p: { jobs: DoneJob[]; fx: FxRow[]; today: string; savedUsd: number; todayRate: number }): ChartPoint[] {
  const jobs = [...p.jobs].sort((a, b) => a.day.localeCompare(b.day))
  if (jobs.length === 0) return []
  const first = jobs[0]!.day
  const totalDays = Math.max(0, daysBetween(first, p.today))
  const principalToday = principalUsd(jobs)
  const interest = Math.max(0, p.savedUsd - principalToday)
  const fx = new Map(p.fx.map((r) => [r.day, r.usdGhs]))

  let lastRate = p.fx.length ? [...p.fx].sort((a, b) => a.day.localeCompare(b.day))[0]!.usdGhs : p.todayRate
  const out: ChartPoint[] = []
  for (let i = 0; i <= totalDays; i++) {
    const day = addDays(first, i)
    if (fx.has(day)) lastRate = fx.get(day)!
    const rate = day === p.today ? p.todayRate : lastRate
    const upTo = jobs.filter((j) => j.day <= day)
    const principal = principalUsd(upTo)
    const interestSoFar = totalDays === 0 ? interest : (interest * i) / totalDays
    const kept = upTo.reduce((s, j) => s + (j.kind === 'deposit' ? 1 : -1) * j.usdAmount * j.ghsRate, 0)
    out.push({
      day,
      savingsGhs: round2(Math.max(0, principal + interestSoFar) * rate),
      keptInCedisGhs: round2(kept),
    })
  }
  return out
}

export type GoalRow = { id: string; name: string; targetGhs: number; targetDate: string | null }

/** savedGhs = the goal's net tagged deposits plus its share of interest, at today's rate. */
export function goalProgress(goals: GoalRow[], jobs: DoneJob[], savedUsd: number, todayRate: number) {
  const principal = principalUsd(jobs)
  const interest = Math.max(0, savedUsd - principal)
  return goals.map((g) => {
    const tagged = principalUsd(jobs.filter((j) => j.goalId === g.id))
    const share = principal > 0 ? (interest * Math.max(0, tagged)) / principal : 0
    const savedGhs = round2(Math.max(0, tagged + share) * todayRate)
    const percent = g.targetGhs > 0 ? Math.min(100, Math.round((savedGhs / g.targetGhs) * 100)) : 0
    return { id: g.id, name: g.name, targetGhs: g.targetGhs, targetDate: g.targetDate ?? undefined, savedGhs, percent }
  })
}

export function stampsThisMonth(jobs: DoneJob[], today: string) {
  const month = today.slice(0, 7)
  return jobs
    .filter((j) => j.kind === 'deposit' && j.day.startsWith(month))
    .map((j) => ({ day: j.day, usd: j.usdAmount.toFixed(2) }))
}

export const round2 = (n: number) => Math.round(n * 100) / 100
