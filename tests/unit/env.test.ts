import { afterEach, describe, expect, it } from 'vitest'
import { missingConfig } from '../../api/_lib/env.js'

const KEYS = ['CHAIN_MODE', 'DATABASE_URL', 'RELAYER_PRIVATE_KEY', 'RELAY_ADDRESS', 'NIM_FEE_ADDRESS'] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })

describe('missingConfig', () => {
  it('lists everything a real deployment still needs', () => {
    for (const k of KEYS) delete process.env[k]
    // RELAY_ADDRESS falls back to the deployed mainnet address in shared/constants.ts
    expect(missingConfig()).toEqual(['DATABASE_URL', 'RELAYER_PRIVATE_KEY', 'NIM_FEE_ADDRESS'])
    process.env.RELAY_ADDRESS = '0x' + '0'.repeat(40)
    expect(missingConfig()).toContain('RELAY_ADDRESS')
  })
  it('is empty once everything is set, and always in mock mode', () => {
    process.env.CHAIN_MODE = 'real'
    process.env.DATABASE_URL = 'postgres://x'
    process.env.RELAYER_PRIVATE_KEY = '0x' + '1'.repeat(64)
    process.env.RELAY_ADDRESS = '0x' + '2'.repeat(40)
    process.env.NIM_FEE_ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001'
    expect(missingConfig()).toEqual([])
    process.env.CHAIN_MODE = 'mock'
    delete process.env.DATABASE_URL
    expect(missingConfig()).toEqual([])
  })
})
