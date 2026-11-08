import { newGoalId } from '../../shared/ids'
import { requireSession } from '../_lib/auth'
import { db } from '../_lib/db'
import { handler, HttpError, json, readJson } from '../_lib/http'

export function validateGoal(body: any, partial = false) {
  const out: { name?: string; targetGhs?: number; targetDate?: string | null } = {}
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 40) throw new HttpError(400, 'bad_request', 'name must be 1 to 40 characters')
    out.name = name
  }
  if (!partial || body.targetGhs !== undefined) {
    const target = Number(body.targetGhs)
    if (!(target > 0) || target > 1e12) throw new HttpError(400, 'bad_request', 'targetGhs must be above 0')
    out.targetGhs = Math.round(target * 100) / 100
  }
  if (body.targetDate !== undefined) {
    if (body.targetDate === null || body.targetDate === '') out.targetDate = null
    else if (typeof body.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.targetDate)) out.targetDate = body.targetDate
    else throw new HttpError(400, 'bad_request', 'targetDate must be YYYY-MM-DD')
  }
  return out
}

export const goalRow = (g: any) => ({
  id: g.id, name: g.name, targetGhs: Number(g.target_ghs), targetDate: g.target_date ?? undefined, archived: !!g.archived,
})

export const GET = handler(async (req) => {
  const owner = await requireSession(req)
  const { sql } = await db()
  const rows = await sql`select id, name, target_ghs, to_char(target_date, 'YYYY-MM-DD') as target_date, archived
    from goals where owner = ${owner} order by archived, created_at`
  return json({ goals: rows.map(goalRow) })
})

export const POST = handler(async (req) => {
  const owner = await requireSession(req)
  const g = validateGoal(await readJson(req))
  const { sql } = await db()
  const id = newGoalId()
  const rows = await sql`insert into goals (id, owner, name, target_ghs, target_date)
    values (${id}, ${owner}, ${g.name!}, ${g.targetGhs!}, ${g.targetDate ?? null})
    returning id, name, target_ghs, to_char(target_date, 'YYYY-MM-DD') as target_date, archived`
  return json(goalRow(rows[0]), 201)
})
