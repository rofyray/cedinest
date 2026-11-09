import { recoverTypedDataAddress } from 'viem'
import { POLYGON_CHAIN_ID_HEX } from '../../shared/constants.js'
import { permitTypedData, permitTypedDataJson, type PermitFields, type PermitToken } from '../../shared/typed-data.js'

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<any> }

const eth = (): Eip1193 => {
  const p = (window as any).ethereum
  if (!p) throw new Error('no_evm_provider')
  return p
}

export const hasEvmProvider = () => !!(window as any).ethereum

export async function connectEvm(): Promise<`0x${string}`> {
  const [owner] = await eth().request({ method: 'eth_requestAccounts' })
  if (!owner) throw new Error('no_evm_account')
  await ensurePolygon()
  return owner
}

export async function ensurePolygon() {
  const chainId = await eth().request({ method: 'eth_chainId' })
  if (chainId === POLYGON_CHAIN_ID_HEX) return
  try {
    await eth().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON_CHAIN_ID_HEX }] })
  } catch {
    // Some hosts do not implement the switch; what matters is the chain we end up on.
  }
  const after = await eth().request({ method: 'eth_chainId' })
  if (after !== POLYGON_CHAIN_ID_HEX) throw new Error(`wrong_chain:${after}`)
}

/** Signs an EIP-2612 permit in Nimiq Pay and checks locally that the signer is the owner. */
export async function signPermit(token: PermitToken, owner: `0x${string}`, p: PermitFields): Promise<`0x${string}`> {
  await ensurePolygon()
  const typedData = permitTypedDataJson(token, owner, p)
  const signature: `0x${string}` = await eth().request({ method: 'eth_signTypedData_v4', params: [owner, JSON.stringify(typedData)] })
  const recovered = await recoverTypedDataAddress({ ...permitTypedData(token, owner, p), signature })
  if (recovered.toLowerCase() !== owner.toLowerCase()) throw new Error('signature_mismatch')
  return signature
}

/** personal_sign for the goals sign-in. */
export async function signMessage(owner: `0x${string}`, message: string): Promise<`0x${string}`> {
  const hex = `0x${Array.from(new TextEncoder().encode(message), (b) => b.toString(16).padStart(2, '0')).join('')}`
  return eth().request({ method: 'personal_sign', params: [hex, owner] })
}
