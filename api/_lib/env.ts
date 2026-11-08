import { NIM_FEE_ADDRESS, RELAY_ADDRESS } from '../../shared/constants.js'

/** Server configuration. Every value has a safe default so the API boots in dev and tests. */
export const env = {
  get databaseUrl() { return process.env.DATABASE_URL ?? '' },
  /** 'real' talks to Polygon and Nimiq; 'mock' fakes both chains for local dev and e2e tests. */
  get chainMode(): 'real' | 'mock' { return process.env.CHAIN_MODE === 'mock' ? 'mock' : 'real' },
  get relayerKey() { return (process.env.RELAYER_PRIVATE_KEY ?? '') as `0x${string}` },
  get relayAddress() { return ((process.env.RELAY_ADDRESS as `0x${string}` | undefined) ?? RELAY_ADDRESS) },
  get polygonRpcUrl() { return process.env.POLYGON_RPC_URL },
  get nimiqRpcUrl() { return process.env.NIMIQ_RPC_URL },
  get nimFeeAddress() { return process.env.NIM_FEE_ADDRESS ?? NIM_FEE_ADDRESS },
  get sessionSecret() { return process.env.SESSION_SECRET ?? 'dev-session-secret-change-me' },
  get cronSecret() { return process.env.CRON_SECRET ?? '' },
}

const ZERO = '0x0000000000000000000000000000000000000000'
const ZERO_NIM = NIM_FEE_ADDRESS.replace(/\s+/g, '').toUpperCase()

/** What is missing before real saves can happen. Empty in mock mode. */
export function missingConfig(): string[] {
  if (env.chainMode === 'mock') return []
  const missing: string[] = []
  if (!env.databaseUrl) missing.push('DATABASE_URL')
  if (!env.relayerKey) missing.push('RELAYER_PRIVATE_KEY')
  if (env.relayAddress.toLowerCase() === ZERO) missing.push('RELAY_ADDRESS')
  if (env.nimFeeAddress.replace(/\s+/g, '').toUpperCase() === ZERO_NIM) missing.push('NIM_FEE_ADDRESS')
  return missing
}
