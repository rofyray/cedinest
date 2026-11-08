import { sessionOwner } from './_lib/auth'
import { handler, HttpError, json } from './_lib/http'
import { buildSummary } from './_lib/summary'

export const GET = handler(async (req) => {
  const url = new URL(req.url)
  const owner = url.searchParams.get('owner')
  if (!owner) throw new HttpError(400, 'bad_request', 'owner is required')
  const nim = url.searchParams.get('nim')
  return json(await buildSummary(owner, await sessionOwner(req), nim))
})
