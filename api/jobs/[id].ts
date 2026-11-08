import { waitUntil } from '@vercel/functions'
import { isJobId } from '../../shared/ids.js'
import { getJob } from '../_lib/db.js'
import { handler, HttpError, json } from '../_lib/http.js'
import { processJob, publicJob } from '../_lib/jobs.js'

const IDLE_MS = 20_000

export const GET = handler(async (_req, { params }) => {
  if (!isJobId(params.id)) throw new HttpError(400, 'bad_request', 'bad job id')
  const job = await getJob(params.id)
  if (!job) throw new HttpError(404, 'not_found', 'no such job')
  // Nudge a job that nobody has touched for 20 s (the original function may have died).
  const idle = Date.now() - new Date(job.updated_at).getTime()
  if (!['done', 'failed', 'refund_due'].includes(job.status) && idle > IDLE_MS) {
    waitUntil(processJob(job.id, { nimTimeoutMs: 60_000 }).catch((e) => console.error('[jobs] nudge', job.id, e)))
  }
  return json(publicJob(job))
})
