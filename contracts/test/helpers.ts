import { ethers, network } from 'hardhat'
import type { Signer, TypedDataDomain, TypedDataField } from 'ethers'

export const USDT0 = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
export const A_POL_USDT = '0x6ab707Aca953eDAeFBc4fD23bA73294241490620'
export const POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'

/// USDT0 uses a non-standard EIP-712 domain: no chainId, salt = bytes32(137).
export const USDT0_DOMAIN: TypedDataDomain = {
  name: 'USDT0',
  version: '1',
  verifyingContract: USDT0,
  salt: '0x0000000000000000000000000000000000000000000000000000000000000089',
}

export const A_POL_USDT_DOMAIN: TypedDataDomain = {
  name: 'Aave Polygon USDT',
  version: '1',
  chainId: 137,
  verifyingContract: A_POL_USDT,
}

export const PERMIT_TYPES: Record<string, TypedDataField[]> = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
}

export const ERC20_PERMIT_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
  'function transferFrom(address,address,uint256) returns (bool)',
  'function nonces(address) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
]

export const POOL_ABI = [
  'function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)',
  'function withdraw(address asset,uint256 amount,address to) returns (uint256)',
]

export const MAX_UINT = ethers.MaxUint256

export function usdt(token: Signer | null = null) {
  return new ethers.Contract(USDT0, ERC20_PERMIT_ABI, token ?? ethers.provider)
}
export function aToken(signer: Signer | null = null) {
  return new ethers.Contract(A_POL_USDT, ERC20_PERMIT_ABI, signer ?? ethers.provider)
}
export function pool(signer: Signer | null = null) {
  return new ethers.Contract(POOL, POOL_ABI, signer ?? ethers.provider)
}

/// Impersonate an address and give it gas. Returns a signer for it.
export async function impersonate(address: string): Promise<Signer> {
  await network.provider.request({ method: 'hardhat_impersonateAccount', params: [address] })
  await network.provider.request({ method: 'hardhat_setBalance', params: [address, '0x56BC75E2D63100000'] }) // 100 POL
  return ethers.getSigner(address)
}

/// Fund `user` with `amount` USDT0 (6 decimals) by pulling from aPolUSDT's idle reserve.
export async function fundUser(user: string, amount: bigint): Promise<void> {
  const whale = await impersonate(A_POL_USDT)
  const tx = await usdt(whale).transfer(user, amount)
  await tx.wait()
}

/// Give `address` native gas so a fresh wallet can send transactions on the fork.
export async function giveGas(address: string): Promise<void> {
  await network.provider.request({ method: 'hardhat_setBalance', params: [address, '0x56BC75E2D63100000'] })
}

export interface PermitSig {
  v: number
  r: string
  s: string
  deadline: bigint
}

/// Sign an EIP-2612 permit with ethers v6. `domain` decides which token.
export async function signPermit(
  signer: Signer & { signTypedData: (d: TypedDataDomain, t: Record<string, TypedDataField[]>, m: Record<string, unknown>) => Promise<string> },
  domain: TypedDataDomain,
  tokenAddress: string,
  spender: string,
  value: bigint,
  deadline: bigint,
  nonceOverride?: bigint,
): Promise<PermitSig> {
  const owner = await signer.getAddress()
  const token = new ethers.Contract(tokenAddress, ERC20_PERMIT_ABI, ethers.provider)
  const nonce = nonceOverride ?? (await token.nonces(owner))
  const sig = await signer.signTypedData(domain, PERMIT_TYPES, { owner, spender, value, nonce, deadline })
  const { v, r, s } = ethers.Signature.from(sig)
  return { v, r, s, deadline }
}

export async function latestTimestamp(): Promise<bigint> {
  const block = await ethers.provider.getBlock('latest')
  return BigInt(block!.timestamp)
}
