import { NIMIQ_RPC, NIMIQ_NETWORK_ID_MAINNET, NIMIQ_BLOCKS_PER_BATCH } from './constants.js'

export type NimTx = {
  hash: string; blockNumber: number; confirmations: number; from: string; to: string
  value: number; fee: number; senderData: string; recipientData: string
  networkId: number; executionResult: boolean
}

export type NimRpc = <T>(method: string, params: unknown[]) => Promise<T>

export function makeNimRpc(url = NIMIQ_RPC, fetchFn: typeof fetch = fetch): NimRpc {
  return async <T>(method: string, params: unknown[]): Promise<T> => {
    const res = await fetchFn(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    const json: any = await res.json()
    if (json.error) throw new Error(`${method}: ${json.error.message ?? JSON.stringify(json.error)}`)
    return json.result.data as T
  }
}

export const normaliseNimAddress = (a: string) => a.replace(/\s+/g, '').toUpperCase()
export const hexToUtf8 = (hex: string) =>
  new TextDecoder().decode(Uint8Array.from((hex ?? '').match(/../g) ?? [], (b) => parseInt(b, 16)))

export type NimCheck =
  | { status: 'not_found' }
  | { status: 'invalid'; reason: string }
  | { status: 'included'; tx: NimTx; blocksToFinal: number }
  | { status: 'final'; tx: NimTx }

export type NimPaymentExpectation = { hash: string; to: string; minLuna: bigint; memo: string }

export async function verifyNimPayment(p: NimPaymentExpectation, rpc: NimRpc = makeNimRpc()): Promise<NimCheck> {
  let tx: NimTx
  try { tx = await rpc<NimTx>('getTransactionByHash', [p.hash]) } catch { return { status: 'not_found' } }
  if (!tx) return { status: 'not_found' }
  if (tx.networkId !== NIMIQ_NETWORK_ID_MAINNET) return { status: 'invalid', reason: 'wrong network' }
  if (normaliseNimAddress(tx.to) !== normaliseNimAddress(p.to)) return { status: 'invalid', reason: 'wrong recipient' }
  if (BigInt(tx.value) < p.minLuna) return { status: 'invalid', reason: 'amount too low' }
  // The memo travels in recipientData for basic transactions with data; some nodes mirror it in senderData.
  const memo = hexToUtf8(tx.recipientData) || hexToUtf8(tx.senderData)
  if (memo !== p.memo) return { status: 'invalid', reason: 'memo mismatch' }
  if (!tx.executionResult) return { status: 'invalid', reason: 'execution failed' }
  if (!tx.blockNumber) return { status: 'included', tx, blocksToFinal: NIMIQ_BLOCKS_PER_BATCH }
  const head = await rpc<number>('getBlockNumber', [])
  const lastMacro = Math.floor(head / NIMIQ_BLOCKS_PER_BATCH) * NIMIQ_BLOCKS_PER_BATCH
  return tx.blockNumber <= lastMacro
    ? { status: 'final', tx }
    : { status: 'included', tx, blocksToFinal: lastMacro + NIMIQ_BLOCKS_PER_BATCH - head }
}

/** Polls every 2 s until final, invalid, or the deadline. */
export async function waitForFinalNimPayment(
  p: NimPaymentExpectation, timeoutMs = 120_000, rpc: NimRpc = makeNimRpc(), sleepMs = 2_000,
): Promise<NimCheck> {
  const until = Date.now() + timeoutMs
  for (;;) {
    const r = await verifyNimPayment(p, rpc)
    if (r.status === 'final' || r.status === 'invalid' || Date.now() > until) return r
    await new Promise((ok) => setTimeout(ok, sleepMs))
  }
}
