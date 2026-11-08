import { createChallenge } from '../_lib/auth'
import { handler, json, readJson } from '../_lib/http'

export const POST = handler(async (req) => {
  const { owner } = await readJson<{ owner: string }>(req)
  return json(await createChallenge(owner))
})
