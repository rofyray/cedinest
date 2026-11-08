import { createChallenge } from '../_lib/auth.js'
import { handler, json, readJson } from '../_lib/http.js'

export const POST = handler(async (req) => {
  const { owner } = await readJson<{ owner: string }>(req)
  return json(await createChallenge(owner))
})
