import { chain } from '../_lib/chain.js'
import { env } from '../_lib/env.js'
import { handler, HttpError, json } from '../_lib/http.js'
import { refundDueJobs, retryStuckJobs } from '../_lib/jobs.js'
import { storeTodayRate } from '../_lib/prices.js'

export const GET = handler(async (req) => {
  const auth = req.headers.get('authorization') ?? ''
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) throw new HttpError(401, 'unauthorized', 'cron secret missing or wrong')
  const rate = await storeTodayRate()
  const retried = await retryStuckJobs()
  const refundDue = await refundDueJobs()
  const relayerPol = await (await chain()).relayerPol()
  if (refundDue.length) console.warn('[cron] refund_due jobs', JSON.stringify(refundDue))
  if (relayerPol < 1) console.warn('[cron] relayer balance low', relayerPol, 'POL')
  return json({ rate, retried, refundDue: refundDue.map((j) => j.id), relayerPol })
})
