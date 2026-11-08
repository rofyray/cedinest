import { handler, json, readJson } from './_lib/http.js'
import { createQuote } from './_lib/jobs.js'

export const POST = handler(async (req) => {
  const body = await readJson(req)
  return json(await createQuote(body))
})
