import { requireSession } from './_lib/auth.js'
import { db } from './_lib/db.js'
import { handler, HttpError, json, readJson } from './_lib/http.js'

/** First-open consent and the optional first name, stored against the signed-in wallet. */
export const POST = handler(async (req) => {
  const owner = await requireSession(req)
  const body = await readJson<{ name?: string | null; consent?: boolean }>(req)
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 24) : null
  if (body.consent !== true) throw new HttpError(400, 'bad_request', 'consent is required')
  const { sql } = await db()
  await sql`insert into profiles (owner, display_name, consented_at) values (${owner}, ${name || null}, now())
    on conflict (owner) do update set display_name = excluded.display_name, consented_at = coalesce(profiles.consented_at, now())`
  return json({ ok: true, name: name || null })
})

export const GET = handler(async (req) => {
  const owner = await requireSession(req)
  const { sql } = await db()
  const rows = await sql`select display_name, consented_at from profiles where owner = ${owner}`
  return json({ name: rows[0]?.display_name ?? null, consented: !!rows[0]?.consented_at })
})
