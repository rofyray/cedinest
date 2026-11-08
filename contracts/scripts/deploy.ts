import { ethers } from 'hardhat'
const USDT0 = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const A_POL_USDT = '0x6ab707Aca953eDAeFBc4fD23bA73294241490620'
const POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
async function main() {
  const relayer = process.env.RELAYER_ADDRESS!
  const owner = process.env.OWNER_ADDRESS!
  if (!relayer || !owner) throw new Error('Set RELAYER_ADDRESS and OWNER_ADDRESS')
  const relay = await ethers.deployContract('CediNestRelay', [USDT0, A_POL_USDT, POOL, relayer, owner])
  await relay.waitForDeployment()
  console.log('CediNestRelay', await relay.getAddress())
  console.log(`npx hardhat verify --network polygon ${await relay.getAddress()} ${USDT0} ${A_POL_USDT} ${POOL} ${relayer} ${owner}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
