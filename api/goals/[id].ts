import { isGoalId } from '../../shared/ids'
import { requireSession } from '../_lib/auth'
import { db } from '../_lib/db'
import { handler, HttpError, json, readJson } from '../_lib/http'
import { goalRow, validateGoal } from './index'

export const GET = handler(async (req, { params }) => {
  const owner = await requireSession(req)
  if (!isGoalId(params.id)) throw new HttpError(400, 'bad_request', 'bad goal id')
  const { sql } = await db()
  const rows = await sql`select id, name, target_ghs, to_char(target_date, 'YYYY-MM-DD') as target_date, archived
    from goals where id = ${params.id} and owner = ${owner}`
  if (!rows[0]) throw new HttpError(404, 'not_found', 'no such goal')
  return json(goalRow(rows[0]))
})

export const PATCH = handler(async (req, { params }) => {
  const owner = await requireSession(req)
  if (!isGoalId(params.id)) throw new HttpError(400, 'bad_request', 'bad goal id')
  const body = await readJson(req)
  const g = validateGoal(body, true)
  const archived = body.archived === undefined ? null : !!body.archived
  const { sql } = await db()
  const rows = await sql`update goals set
      name = coalesce(${g.name ?? null}, name),
      target_ghs = coalesce(${g.targetGhs ?? null}::numeric, target_ghs),
      target_date = case when ${body.targetDate !== undefined} then ${g.targetDate ?? null}::date else target_date end,
      archived = coalesce(${archived}::boolean, archived)
    where id = ${params.id} and owner = ${owner}
    returning id, name, target_ghs, to_char(target_date, 'YYYY-MM-DD') as target_date, archived`
  if (!rows[0]) throw new HttpError(404, 'not_found', 'no such goal')
  return json(goalRow(rows[0]))
})
