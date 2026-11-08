import { createSession } from '../_lib/auth'
import { handler, json, readJson } from '../_lib/http'

export const POST = handler(async (req) => {
  const body = await readJson<{ owner: string; nonce: string; issued: string; signature: string }>(req)
  return json(await createSession(body))
})
