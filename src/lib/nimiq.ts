import { init, type NimiqProvider } from '@nimiq/mini-app-sdk'

let providerPromise: Promise<NimiqProvider> | null = null

/** The Nimiq Pay provider. Rejects after 10 s when the app is not inside Nimiq Pay. */
export function nimiq() {
  providerPromise ??= init({ timeout: 10_000 })
  return providerPromise
}

/**
 * Nimiq Pay lists the wallet address first, then the HTLC that holds the user's spendable NIM.
 * The wallet address usually reads 0: incoming NIM only rests there until Nimiq Pay moves it into the HTLC.
 */
export async function nimAccounts(): Promise<string[]> {
  const p = await nimiq()
  const accounts = await p.listAccounts()
  if (!accounts[0]) throw new Error('no_nim_account')
  return accounts
}

/** Spendable NIM across every account Nimiq Pay lists, or null when none could be read. */
export async function nimBalanceLuna(addresses: string[]): Promise<bigint | null> {
  const p = await nimiq()
  const readings = await Promise.all(addresses.map(async (a) => {
    try {
      const bal = await p.getBalance(a)
      return typeof bal === 'number' ? BigInt(Math.round(bal)) : null
    } catch { return null }
  }))
  const known = readings.filter((r): r is bigint => r != null)
  return known.length ? known.reduce((a, b) => a + b, 0n) : null
}

/** Pays the NIM fee. Returns the tx hash; the API decides if it really succeeded. */
export async function payNimFee(recipient: string, valueLuna: number, memo: string): Promise<string> {
  const p = await nimiq()
  if (new TextEncoder().encode(memo).length > 64) throw new Error('memo over 64 bytes')
  const hash = await p.sendBasicTransactionWithData({ recipient, value: valueLuna, data: memo })
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash)) throw new Error('fee_cancelled')
  return hash.toLowerCase()
}

export const appLanguage = () => window.nimiqPay?.language ?? navigator.language.slice(0, 2)

/** True when the user clearly dismissed a Nimiq Pay or wallet prompt. */
export function isUserRejection(e: unknown) {
  const msg = String((e as any)?.message ?? e ?? '').toLowerCase()
  const code = (e as any)?.code
  return code === 4001 || /reject|cancel|denied|dismiss|user closed|fee_cancelled/.test(msg)
}
