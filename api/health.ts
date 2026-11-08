import { db } from './_lib/db.js'
import { env, missingConfig } from './_lib/env.js'
import { handler, json } from './_lib/http.js'

export const GET = handler(async () => {
  let database = 'ok'
  try { await (await db()).sql`select 1` } catch (e: any) { database = `error: ${e?.message ?? e}` }
  return json({ ok: database === 'ok', chainMode: env.chainMode, database, missingConfig: missingConfig(), relayAddress: env.relayAddress })
})
