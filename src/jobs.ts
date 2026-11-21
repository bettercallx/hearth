/**
 * Background-job handler for AppJobRoom (worker.ts). Hearth runs no
 * background jobs; the room stays wired because the worker declares it.
 */

import type { Job, JobContext } from 'deepspace/worker'

export async function runJob(job: Job, _ctx: JobContext, _env: unknown): Promise<void> {
  throw new Error(`Unknown job type: ${job.type}`)
}
