import { sessionOwner } from './_lib/auth.js'
import { handler, HttpError, json } from './_lib/http.js'
import { buildSummary } from './_lib/summary.js'

export const GET = handler(async (req) => {
  const url = new URL(req.url)
  const owner = url.searchParams.get('owner')
  if (!owner) throw new HttpError(400, 'bad_request', 'owner is required')
  const nim = url.searchParams.get('nim')
  return json(await buildSummary(owner, await sessionOwner(req), nim))
})
