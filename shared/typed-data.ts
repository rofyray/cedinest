import { recoverTypedDataAddress, type Hex } from 'viem'
import {
  APOLUSDT_DOMAIN, APOLUSDT_DOMAIN_TYPE, PERMIT_TYPES, USDT0_DOMAIN, USDT0_DOMAIN_TYPE,
} from './constants.js'

export type PermitToken = 'usdt0' | 'apolusdt'

export type PermitFields = {
  spender: `0x${string}`
  value: string   // decimal string
  nonce: string   // decimal string
  deadline: string // unix seconds, decimal string
}

export function permitDomain(token: PermitToken) {
  return token === 'usdt0' ? USDT0_DOMAIN : APOLUSDT_DOMAIN
}

export function permitDomainType(token: PermitToken) {
  return token === 'usdt0' ? USDT0_DOMAIN_TYPE : APOLUSDT_DOMAIN_TYPE
}

/** The JSON Nimiq Pay receives through eth_signTypedData_v4. */
export function permitTypedDataJson(token: PermitToken, owner: `0x${string}`, p: PermitFields) {
  return {
    types: { EIP712Domain: permitDomainType(token), ...PERMIT_TYPES },
    primaryType: 'Permit' as const,
    domain: permitDomain(token),
    message: { owner, spender: p.spender, value: p.value, nonce: p.nonce, deadline: p.deadline },
  }
}

/** viem-shaped typed data (bigint values) for signing and recovery. */
export function permitTypedData(token: PermitToken, owner: `0x${string}`, p: PermitFields) {
  return {
    domain: permitDomain(token),
    types: PERMIT_TYPES,
    primaryType: 'Permit' as const,
    message: { owner, spender: p.spender, value: BigInt(p.value), nonce: BigInt(p.nonce), deadline: BigInt(p.deadline) },
  }
}

export async function recoverPermitSigner(token: PermitToken, owner: `0x${string}`, p: PermitFields, signature: Hex) {
  return recoverTypedDataAddress({ ...permitTypedData(token, owner, p), signature })
}
