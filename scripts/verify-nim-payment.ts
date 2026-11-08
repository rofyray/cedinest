/** npx tsx scripts/verify-nim-payment.ts <hash> <memo> <minLuna>   (NIM_FEE_ADDRESS in env) */
import { makeNimRpc, waitForFinalNimPayment } from '../shared/nimiq-verify.js'

const [hash, memo, minLuna] = process.argv.slice(2)
if (!hash || !memo || !minLuna) {
  console.error('usage: verify-nim-payment.ts <hash> <memo> <minLuna>')
  process.exit(2)
}
const to = process.env.NIM_FEE_ADDRESS
if (!to) { console.error('set NIM_FEE_ADDRESS'); process.exit(2) }
const started = Date.now()
const r = await waitForFinalNimPayment({ hash, memo, minLuna: BigInt(minLuna), to }, 120_000, makeNimRpc(process.env.NIMIQ_RPC_URL))
console.log(JSON.stringify({ ...r, seconds: (Date.now() - started) / 1000 }, null, 2))
process.exit(r.status === 'final' ? 0 : 1)
