import { MEMO_PREFIX } from './constants.js'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567' // base32, lower case, 5 bits per char

export function randomBase32(len: number) {
  const bytes = new Uint8Array(len)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! & 31]
  return out
}

export const newQuoteId = () => `q_${randomBase32(16)}`
export const newJobId = () => `j_${randomBase32(16)}`
export const newGoalId = () => `g_${randomBase32(16)}`

export const isQuoteId = (s: unknown): s is string => typeof s === 'string' && /^q_[a-z2-7]{16}$/.test(s)
export const isJobId = (s: unknown): s is string => typeof s === 'string' && /^j_[a-z2-7]{16}$/.test(s)
export const isGoalId = (s: unknown): s is string => typeof s === 'string' && /^g_[a-z2-7]{16}$/.test(s)

/** The on-chain memo for a quote: 'cedinest:' + quoteId, always under 64 bytes. */
export function memoFor(quoteId: string) {
  const memo = `${MEMO_PREFIX}${quoteId}`
  if (new TextEncoder().encode(memo).length > 64) throw new Error('memo over 64 bytes')
  return memo
}

export const isNimTxHash = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/i.test(s)
export const isEvmAddress = (s: unknown): s is `0x${string}` => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s)
