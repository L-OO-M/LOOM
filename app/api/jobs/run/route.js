import { fail, ok } from "@/lib/api";
import { getSql } from "@/lib/db";
import { createLogger, requestIdFrom } from "@/lib/log";
import { JOB_NAMES, authorizeCron, runJob } from "@/lib/scheduler";

// Operator/cron entry point for the scheduled work in lib/scheduler.js.
//
// Authentication is the CRON_SECRET bearer (or x-cron-secret). With no secret
// configured the endpoint is closed, not open: an unauthenticated job runner
// could be used to force expensive rollups or prune audit history.
export const dynamic = "force-dynamic";

function selectedJobs(request) {
  const requested = new URL(request.url).searchParams.get("job");
  return requested ? [requested] : JOB_NAMES;
}

async function run(request) {
  const log = createLogger("jobs", { requestId: requestIdFrom(request) });

  const auth = authorizeCron(request);
  if (!auth.ok) return fail(auth.code, auth.message, auth.status);

  const jobs = selectedJobs(request);
  const unknown = jobs.filter((job) => !JOB_NAMES.includes(job));
  if (unknown.length) {
    return fail("UNKNOWN_JOB", `Unknown job: ${unknown.join(", ")}`, 400);
  }

  const sql = getSql();
  const results = [];
  for (const job of jobs) {
    const startedAt = Date.now();
    try {
      results.push(await runJob(sql, job, { apply: true }));
      log.info("job completed", { job, durationMs: Date.now() - startedAt });
    } catch (error) {
      log.error("job failed", { job, durationMs: Date.now() - startedAt, err: error });
      return fail("JOB_FAILED", `Job failed: ${job}`, 500);
    }
  }

  return ok({ jobs: results });
}

export async function GET(request) {
  return run(request);
}

export async function POST(request) {
  return run(request);
}
