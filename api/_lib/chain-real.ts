import {
  createPublicClient, createWalletClient, decodeEventLog, fallback, formatEther, http, keccak256, parseSignature, toHex, type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { polygon } from 'viem/chains'
import { erc20Abi, poolAbi, relayAbi } from '../../shared/abi.js'
import { apyFromLiquidityRate, reserveFlags } from '../../shared/apy.js'
import { A_POL_USDT, AAVE_POOL, POLYGON_RPC, USDT0 } from '../../shared/constants.js'
import { makeNimRpc, waitForFinalNimPayment } from '../../shared/nimiq-verify.js'
import type { Chain, RelayCall } from './chain.js'
import { db } from './db.js'
import { env } from './env.js'

export function realChain(): Chain {
  const urls = env.polygonRpcUrl ? [env.polygonRpcUrl, ...POLYGON_RPC] : [...POLYGON_RPC]
  const pub = createPublicClient({ chain: polygon, transport: fallback(urls.map((u) => http(u, { timeout: 15_000 }))) })
  const account = env.relayerKey ? privateKeyToAccount(env.relayerKey) : null
  const wallet = account ? createWalletClient({ account, chain: polygon, transport: http(urls[0]) }) : null
  const nimRpc = makeNimRpc(env.nimiqRpcUrl)

  function relayArgs(call: RelayCall) {
    const { r, s, v, yParity } = parseSignature(call.signature)
    const vNum = v !== undefined ? Number(v) : 27 + (yParity ?? 0)
    return {
      functionName: (call.kind === 'deposit' ? 'depositFor' : 'withdrawFor') as 'depositFor' | 'withdrawFor',
      args: [call.owner, call.amountRaw, call.deadline, vNum, r, s, keccak256(toHex(call.jobId))] as const,
    }
  }

  return {
    usdtBalance: (owner) => pub.readContract({ address: USDT0, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
    aTokenBalance: (owner) => pub.readContract({ address: A_POL_USDT, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
    permitNonce: (token, owner) => pub.readContract({
      address: token === 'usdt0' ? USDT0 : A_POL_USDT, abi: erc20Abi, functionName: 'nonces', args: [owner],
    }),
    async reserve() {
      const data = await pub.readContract({ address: AAVE_POOL, abi: poolAbi, functionName: 'getReserveData', args: [USDT0] })
      return { ...reserveFlags(data.configuration), apy: apyFromLiquidityRate(data.currentLiquidityRate) }
    },
    gasPriceWei: () => pub.getGasPrice(),
    async relayerPol() {
      if (!account) return 0
      return Number(formatEther(await pub.getBalance({ address: account.address })))
    },
    async simulateRelay(call) {
      if (!account) throw new Error('relayer not configured')
      try {
        await pub.simulateContract({ address: env.relayAddress, abi: relayAbi, account, ...relayArgs(call) })
      } catch (e: any) {
        throw new Error(e?.shortMessage ?? e?.message ?? String(e))
      }
    },
    async sendRelay(call) {
      if (!wallet || !account) throw new Error('relayer not configured')
      await this.simulateRelay(call)
      const { withRelayerLock } = await db()
      return withRelayerLock(async () => {
        const fees = await pub.estimateFeesPerGas()
        const minTip = 30_000_000_000n // Polygon expects about 30 gwei priority fee
        const tip = (fees.maxPriorityFeePerGas ?? 0n) > minTip ? fees.maxPriorityFeePerGas! : minTip
        return wallet.writeContract({
          address: env.relayAddress, abi: relayAbi, ...relayArgs(call),
          maxPriorityFeePerGas: tip,
          maxFeePerGas: (fees.maxFeePerGas ?? 0n) + minTip,
        })
      })
    },
    async waitForReceipt(hash, kind) {
      const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 })
      if (receipt.status !== 'success') return { status: 'reverted', settledRaw: 0n }
      let settledRaw = 0n
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== env.relayAddress.toLowerCase()) continue
        try {
          const ev = decodeEventLog({ abi: relayAbi, data: log.data, topics: log.topics })
          if (kind === 'deposit' && ev.eventName === 'Deposited') settledRaw = ev.args.amount
          if (kind === 'withdraw' && ev.eventName === 'Withdrawn') settledRaw = ev.args.usdtOut
        } catch { /* not our event */ }
      }
      return { status: 'success', settledRaw }
    },
    verifyNimPayment: (p, timeoutMs) => waitForFinalNimPayment(p, timeoutMs, nimRpc),
    async nimBalanceLuna(address) {
      try {
        const r = await nimRpc<{ balance: number }>('getAccountByAddress', [address])
        return BigInt(r.balance)
      } catch { return null }
    },
  }
}

export type { Hex }
