import { createSession } from '../_lib/auth.js'
import { handler, json, readJson } from '../_lib/http.js'

export const POST = handler(async (req) => {
  const body = await readJson<{ owner: string; nonce: string; issued: string; signature: string }>(req)
  return json(await createSession(body))
})
