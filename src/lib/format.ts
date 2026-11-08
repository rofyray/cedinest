const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const two = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** GH₵ 3,780.24 */
export const ghs = (n: number) => `GH₵ ${two(n)}`
/** GH₵ 3,780 (chart legend) */
export const ghsWhole = (n: number) => `GH₵ ${Math.round(n).toLocaleString('en-US')}`
/** $312.40 */
export const usd = (n: number) => `$${two(n)}`
/** $20 for whole amounts, $12.50 otherwise */
export const usdShort = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString('en-US')}` : usd(n))
/** 20.00 USDT */
export const usdt = (n: number) => `${two(n)} USDT`
/** 18,240 NIM */
export const nim = (n: number) => `${Math.round(n).toLocaleString('en-US')} NIM`
/** Fee estimate keeps 3 decimals: ≈ $0.013 */
export const feeUsd = (n: number) => `$${n.toFixed(3)}`

export const rawToUsd = (raw: string | bigint) => Number(BigInt(raw)) / 1e6
export const lunaToNim = (luna: string | bigint | number) => Number(BigInt(luna)) / 100_000

/** "20.5" -> "20500000" (6-decimal integer string). Returns null if not a valid amount. */
export function usdToRaw(input: string): string | null {
  const s = input.trim().replace(/,/g, '')
  if (!/^\d*(\.\d{0,6})?$/.test(s) || s === '' || s === '.') return null
  const [whole = '0', frac = ''] = s.split('.')
  return (BigInt(whole) * 1_000_000n + BigInt((frac + '000000').slice(0, 6))).toString()
}

/** 8 Nov */
export const shortDate = (d: Date | string) => {
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}
export const monthName = (d: Date) => MONTHS[d.getUTCMonth()]!
export const monthNameLong = (d: Date) => MONTHS_LONG[d.getUTCMonth()]!
/** 8 NOV · RENT */
export const stampLine = (d: Date, goal?: string | null) =>
  `${shortDate(d).toUpperCase()}${goal ? ` · ${goal.split(',')[0]!.trim().toUpperCase()}` : ''}`

export const percentChange = (from: number, to: number) => {
  if (!from) return '0%'
  const p = ((to - from) / from) * 100
  const sign = p > 0 ? '+' : ''
  return `${sign}${p.toFixed(1)}%`
}

export const apyPercent = (apy: number) => `${(apy * 100).toFixed(1)}%`

export const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

/** The last four characters of the wallet, shown as the "card number". */
export const cardNumber = (owner: string) => owner.slice(-4).toUpperCase()

export const greetingKey = (d = new Date()) => {
  const h = d.getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}
