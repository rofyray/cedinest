<script setup lang="ts">
/**
 * Hidden feasibility page (/lab). Not linked from the UI and only mounted when VITE_ENABLE_LAB=1.
 * Test 1: sign the USDT0 (salt domain) and aPolUSDT (standard domain) permits on a real phone.
 * Test 3: pay 10 NIM with a memo and verify it with scripts/verify-nim-payment.ts.
 */
import { ref } from 'vue'
import { createPublicClient, fallback, http, parseSignature } from 'viem'
import { polygon } from 'viem/chains'
import { erc20Abi } from '../../shared/abi.js'
import { A_POL_USDT, POLYGON_RPC, USDT0 } from '../../shared/constants.js'
import { connectEvm, signPermit } from '../lib/evm.js'
import { nimAccounts, payNimFee } from '../lib/nimiq.js'

const out = ref<string[]>([])
const log = (label: string, v: unknown) => { out.value.unshift(`${new Date().toISOString().slice(11, 19)} ${label}: ${typeof v === 'string' ? v : JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2)}`) }
const spender = (import.meta.env.VITE_LAB_SPENDER as `0x${string}` | undefined) ?? '0x000000000000000000000000000000000000dEaD'
const pub = createPublicClient({ chain: polygon, transport: fallback(POLYGON_RPC.map((u) => http(u))) })

async function permit(token: 'usdt0' | 'apolusdt') {
  try {
    const owner = await connectEvm()
    const address = token === 'usdt0' ? USDT0 : A_POL_USDT
    const nonce = await pub.readContract({ address, abi: erc20Abi, functionName: 'nonces', args: [owner] })
    const p = { spender, value: '10000', nonce: nonce.toString(), deadline: String(Math.floor(Date.now() / 1000) + 3600) }
    const signature = await signPermit(token, owner, p)
    const { v, r, s, yParity } = parseSignature(signature)
    let dryRun = 'ok'
    try {
      await pub.simulateContract({ address, abi: erc20Abi, functionName: 'permit', args: [owner, spender, 10000n, BigInt(p.deadline), Number(v ?? 27 + (yParity ?? 0)), r, s], account: spender })
    } catch (e: any) { dryRun = e.shortMessage ?? String(e) }
    log(`permit ${token}`, { owner, spender, nonce: p.nonce, signerMatches: true, dryRun, signature })
  } catch (e: any) { log(`permit ${token} failed`, e?.message ?? String(e)) }
}

async function pay() {
  try {
    const to = import.meta.env.VITE_LAB_NIM_ADDRESS as string | undefined
    if (!to) throw new Error('set VITE_LAB_NIM_ADDRESS')
    const [from] = await nimAccounts()
    const hash = await payNimFee(to, 1_000_000, 'cedinest:lab-001')
    log('NIM payment', { from, to, hash, verify: `npx tsx scripts/verify-nim-payment.ts ${hash} cedinest:lab-001 1000000` })
  } catch (e: any) { log('NIM payment failed', e?.message ?? String(e)) }
}
</script>

<template>
  <main class="screen">
    <div class="topbar"><h1>Lab</h1></div>
    <button class="btn btn-secondary" type="button" @click="permit('usdt0')">Sign USDT0 permit</button>
    <button class="btn btn-secondary" type="button" @click="permit('apolusdt')">Sign aPolUSDT permit</button>
    <button class="btn btn-secondary" type="button" @click="pay">Pay 10 NIM with memo</button>
    <pre class="out">{{ out.join('\n\n') }}</pre>
  </main>
</template>

<style scoped>
.out { white-space: pre-wrap; word-break: break-all; font-size: 12px; background: var(--card); border: 1px solid var(--rule); border-radius: 12px; padding: 12px; min-height: 200px; }
</style>
