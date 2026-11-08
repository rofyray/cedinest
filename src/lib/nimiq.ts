import { init, type NimiqProvider } from '@nimiq/mini-app-sdk'

let providerPromise: Promise<NimiqProvider> | null = null

/** The Nimiq Pay provider. Rejects after 10 s when the app is not inside Nimiq Pay. */
export function nimiq() {
  providerPromise ??= init({ timeout: 10_000 })
  return providerPromise
}

export async function nimAccount(): Promise<string> {
  const p = await nimiq()
  const [first] = await p.listAccounts()
  if (!first) throw new Error('no_nim_account')
  return first
}

export async function nimBalanceLuna(address: string): Promise<bigint | null> {
  try {
    const p = await nimiq()
    const bal = await p.getBalance(address)
    return typeof bal === 'number' ? BigInt(Math.round(bal)) : null
  } catch {
    return null
  }
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
