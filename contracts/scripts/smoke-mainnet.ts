// Mainnet smoke test: play the relayer for one real user.
//   RELAY_ADDRESS=0x... USER_PRIVATE_KEY=0x... DEPLOYER_PRIVATE_KEY=0x... \
//   npx hardhat run scripts/smoke-mainnet.ts --network polygon
// Moves 1 USDT0 from the user into their Aave position, then withdraws everything back.
// USER_PRIVATE_KEY must hold >= 1 USDT0; DEPLOYER_PRIVATE_KEY must be the relay's relayer and hold POL for gas.
import { ethers } from 'hardhat'
import type { TypedDataDomain, TypedDataField } from 'ethers'

const USDT0 = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const A_POL_USDT = '0x6ab707Aca953eDAeFBc4fD23bA73294241490620'
const ONE_USDT = 1_000_000n

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
const PERMIT_TYPES: Record<string, TypedDataField[]> = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
}
const TOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function nonces(address) view returns (uint256)',
]
const RELAY_ABI = [
  'function relayer() view returns (address)',
  'function depositFor(address owner,uint256 amount,uint256 deadline,uint8 v,bytes32 r,bytes32 s,bytes32 jobId)',
  'function withdrawFor(address owner,uint256 amount,uint256 deadline,uint8 v,bytes32 r,bytes32 s,bytes32 jobId)',
]

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Set ${name}`)
  return v
}

async function signPermit(
  wallet: InstanceType<typeof ethers.Wallet>,
  domain: TypedDataDomain,
  tokenAddress: string,
  spender: string,
  value: bigint,
  deadline: bigint,
) {
  const token = new ethers.Contract(tokenAddress, TOKEN_ABI, ethers.provider)
  const nonce: bigint = await token.nonces(wallet.address)
  const sig = await wallet.signTypedData(domain, PERMIT_TYPES, {
    owner: wallet.address, spender, value, nonce, deadline,
  })
  return ethers.Signature.from(sig)
}

async function main() {
  const relayAddress = env('RELAY_ADDRESS')
  const user = new ethers.Wallet(env('USER_PRIVATE_KEY'), ethers.provider)
  const relayerWallet = new ethers.Wallet(env('DEPLOYER_PRIVATE_KEY'), ethers.provider)
  const relay = new ethers.Contract(relayAddress, RELAY_ABI, relayerWallet)
  const usdt = new ethers.Contract(USDT0, TOKEN_ABI, ethers.provider)
  const aToken = new ethers.Contract(A_POL_USDT, TOKEN_ABI, ethers.provider)

  const net = await ethers.provider.getNetwork()
  if (net.chainId !== 137n) throw new Error(`Expected Polygon (137), got chainId ${net.chainId}`)
  const onChainRelayer: string = await relay.relayer()
  if (onChainRelayer.toLowerCase() !== relayerWallet.address.toLowerCase()) {
    throw new Error(`DEPLOYER_PRIVATE_KEY (${relayerWallet.address}) is not the relayer (${onChainRelayer})`)
  }
  const usdtBal: bigint = await usdt.balanceOf(user.address)
  if (usdtBal < ONE_USDT) throw new Error(`User ${user.address} holds ${usdtBal} USDT0, need >= ${ONE_USDT}`)

  console.log(`user ${user.address}  relayer ${relayerWallet.address}  relay ${relayAddress}`)
  console.log(`before: USDT0=${usdtBal} aPolUSDT=${await aToken.balanceOf(user.address)}`)

  // 1. deposit 1 USDT0
  {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
    const { v, r, s } = await signPermit(user, USDT0_DOMAIN, USDT0, relayAddress, ONE_USDT, deadline)
    const jobId = ethers.id(`smoke-deposit-${Date.now()}`)
    const tx = await relay.depositFor(user.address, ONE_USDT, deadline, v, r, s, jobId)
    console.log(`depositFor tx ${tx.hash}`)
    const receipt = await tx.wait()
    console.log(`  mined in block ${receipt.blockNumber}, gasUsed ${receipt.gasUsed}`)
    console.log(`after deposit: USDT0=${await usdt.balanceOf(user.address)} aPolUSDT=${await aToken.balanceOf(user.address)}`)
  }

  // 2. withdraw everything (permit value = max, contract pulls balanceOf(owner))
  {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
    const { v, r, s } = await signPermit(user, A_POL_USDT_DOMAIN, A_POL_USDT, relayAddress, ethers.MaxUint256, deadline)
    const jobId = ethers.id(`smoke-withdraw-${Date.now()}`)
    const tx = await relay.withdrawFor(user.address, ethers.MaxUint256, deadline, v, r, s, jobId)
    console.log(`withdrawFor tx ${tx.hash}`)
    const receipt = await tx.wait()
    console.log(`  mined in block ${receipt.blockNumber}, gasUsed ${receipt.gasUsed}`)
    console.log(`after withdraw: USDT0=${await usdt.balanceOf(user.address)} aPolUSDT=${await aToken.balanceOf(user.address)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
