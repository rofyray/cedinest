import { waitUntil } from '@vercel/functions'
import { handler, json, readJson } from '../_lib/http.js'
import { createJob, processJob } from '../_lib/jobs.js'

export const POST = handler(async (req) => {
  const body = await readJson(req)
  const { jobId } = await createJob(body)
  // Finish the job after the response: wait for the NIM fee, relay, confirm.
  waitUntil(processJob(jobId).catch((e) => console.error('[jobs] process', jobId, e)))
  return json({ jobId }, 202)
})
