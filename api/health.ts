import { db } from './_lib/db'
import { env, missingConfig } from './_lib/env'
import { handler, json } from './_lib/http'

export const GET = handler(async () => {
  let database = 'ok'
  try { await (await db()).sql`select 1` } catch (e: any) { database = `error: ${e?.message ?? e}` }
  return json({ ok: database === 'ok', chainMode: env.chainMode, database, missingConfig: missingConfig(), relayAddress: env.relayAddress })
})
