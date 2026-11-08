export const ROTATIONS = [-9, 6, -4, 8, -7, 5]

export type Stamp = { day: string; usd: string }

export function monthCells(year: number, month: number, stamps: Stamp[], today: Date) {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const byDay = new Map<number, number>()
  for (const s of stamps) {
    const d = Number(s.day.slice(8, 10))
    byDay.set(d, (byDay.get(d) ?? 0) + Number(s.usd))
  }
  let k = 0
  return Array.from({ length: daysInMonth }, (_, i) => {
    const n = i + 1
    const usd = byDay.get(n)
    return {
      n,
      isToday: today.getUTCDate() === n && today.getUTCMonth() === month && today.getUTCFullYear() === year,
      stamp: usd ? { label: `$${Math.round(usd)}`, rotate: ROTATIONS.at(k++ % ROTATIONS.length)! } : null,
    }
  })
}
