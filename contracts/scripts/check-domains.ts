// Reads DOMAIN_SEPARATOR() of USDT0 and aPolUSDT from the connected chain (fork or live)
// and compares each with the EIP-712 domain we sign against.
//   npx hardhat run scripts/check-domains.ts                   (fork)
//   npx hardhat run scripts/check-domains.ts --network polygon (live)
import { ethers } from 'hardhat'
import type { TypedDataDomain } from 'ethers'

const USDT0 = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const A_POL_USDT = '0x6ab707Aca953eDAeFBc4fD23bA73294241490620'

const USDT0_DOMAIN: TypedDataDomain = {
  name: 'USDT0',
  version: '1',
  verifyingContract: USDT0,
  salt: '0x0000000000000000000000000000000000000000000000000000000000000089',
}
const A_POL_USDT_DOMAIN: TypedDataDomain = {
  name: 'Aave Polygon USDT',
  version: '1',
  chainId: 137,
  verifyingContract: A_POL_USDT,
}

const ABI = ['function DOMAIN_SEPARATOR() view returns (bytes32)']

async function check(label: string, address: string, domain: TypedDataDomain): Promise<boolean> {
  const token = new ethers.Contract(address, ABI, ethers.provider)
  const onChain: string = await token.DOMAIN_SEPARATOR()
  const local = ethers.TypedDataEncoder.hashDomain(domain)
  const ok = onChain.toLowerCase() === local.toLowerCase()
  console.log(`${ok ? 'OK      ' : 'MISMATCH'} ${label}\n  on-chain ${onChain}\n  local    ${local}`)
  return ok
}

async function main() {
  const net = await ethers.provider.getNetwork()
  console.log(`chainId ${net.chainId}, block ${await ethers.provider.getBlockNumber()}`)
  const a = await check('USDT0 (salt domain)', USDT0, USDT0_DOMAIN)
  const b = await check('aPolUSDT (standard domain)', A_POL_USDT, A_POL_USDT_DOMAIN)
  if (!a || !b) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
