import { handler, json, readJson } from './_lib/http'
import { createQuote } from './_lib/jobs'

export const POST = handler(async (req) => {
  const body = await readJson(req)
  return json(await createQuote(body))
})
