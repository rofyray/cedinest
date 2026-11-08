/**
 * Sends POL from the relayer wallet to one address. Dry run by default.
 *
 *   npx tsx scripts/send-pol.ts --to 0x... --amount 116          # shows balance, gas, what would happen
 *   npx tsx scripts/send-pol.ts --to 0x... --amount 116 --yes    # broadcasts and waits for the receipt
 *
 * Reads RELAYER_PRIVATE_KEY from the environment or from .env.local. Keeps at least
 * KEEP_POL in the relayer for gas unless --allow-low is passed. Never prints the key.
 */
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, formatEther, getAddress, http, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { polygon } from 'viem/chains'
import { POLYGON_RPC } from '../shared/constants.js'

const KEEP_POL = 20n * 10n ** 18n

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const flag = (name: string) => process.argv.includes(`--${name}`)

if (!process.env.RELAYER_PRIVATE_KEY) {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = /^RELAYER_PRIVATE_KEY=(.*)$/.exec(line.trim())
      if (m) process.env.RELAYER_PRIVATE_KEY = m[1]!.replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env.local */ }
}
const pk = process.env.RELAYER_PRIVATE_KEY
if (!pk) { console.error('RELAYER_PRIVATE_KEY is not set (env or .env.local)'); process.exit(2) }

const toArg = arg('to'); const amountArg = arg('amount')
if (!toArg || !amountArg) { console.error('usage: send-pol.ts --to 0x... --amount <POL> [--yes] [--allow-low]'); process.exit(2) }
let to: `0x${string}`
try { to = getAddress(toArg) } catch { console.error(`not a valid Polygon address: ${toArg}`); process.exit(2) }
const value = parseEther(amountArg)
if (value <= 0n) { console.error('amount must be positive'); process.exit(2) }

const account = privateKeyToAccount(pk as `0x${string}`)
const transport = http(process.env.POLYGON_RPC_URL ?? POLYGON_RPC[0])
const pub = createPublicClient({ chain: polygon, transport })
const wallet = createWalletClient({ account, chain: polygon, transport })

const balance = await pub.getBalance({ address: account.address })
const gas = await pub.estimateGas({ account, to, value })
const gasPrice = await pub.getGasPrice()
const fee = gas * gasPrice
const after = balance - value - fee

console.log(`from      ${account.address}`)
console.log(`to        ${to}`)
console.log(`amount    ${formatEther(value)} POL`)
console.log(`balance   ${formatEther(balance)} POL`)
console.log(`gas       ~${formatEther(fee)} POL (${gas} gas @ ${Number(gasPrice) / 1e9} gwei)`)
console.log(`left      ${formatEther(after)} POL`)

if (after < 0n) { console.error('not enough POL for amount + gas'); process.exit(1) }
if (after < KEEP_POL && !flag('allow-low')) {
  console.error(`refusing: fewer than ${formatEther(KEEP_POL)} POL would be left for relayer gas (pass --allow-low to override)`)
  process.exit(1)
}
if (!flag('yes')) { console.log('\ndry run only. Add --yes to send.'); process.exit(0) }

const hash = await wallet.sendTransaction({ to, value })
console.log(`sent      https://polygonscan.com/tx/${hash}`)
const receipt = await pub.waitForTransactionReceipt({ hash })
console.log(`status    ${receipt.status} in block ${receipt.blockNumber}`)
console.log(`balance   ${formatEther(await pub.getBalance({ address: account.address }))} POL`)
process.exit(receipt.status === 'success' ? 0 : 1)
