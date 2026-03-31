import { appendJobEvent, claimNextQueuedJob, updateJob } from "../lib/db";
import { sleep, toErrorMessage } from "../lib/utils";
import { runJob } from "../lib/worker-core";

const POLL_MS = 4000;

async function main(): Promise<void> {
  console.log("Worker started. Polling for queued jobs.");

  for (;;) {
    let activeJobId: string | null = null;

    try {
      const job = await claimNextQueuedJob();

      if (!job) {
        await sleep(POLL_MS);
        continue;
      }

      activeJobId = job.id;
      console.log(`Claimed job ${job.id}`);

      try {
        await appendJobEvent(job.id, "claimed", "Worker claimed this job.");
      } catch (eventError) {
        console.warn("Failed to append claimed event:", toErrorMessage(eventError));
      }

      await runJob(job.id, job.user_id);
      console.log(`Completed job ${job.id}`);
      activeJobId = null;
    } catch (error) {
      console.error("Worker loop error:", error);

      if (activeJobId) {
        const message = toErrorMessage(error);

        try {
          await updateJob(activeJobId, {
            status: "failed",
            current_stage: "failed",
            error_message: message,
            completed_at: new Date().toISOString()
          });
          await appendJobEvent(activeJobId, "failed", "Job failed before the main run loop completed.", {
            error: message
          });
        } catch (markFailedError) {
          console.error("Failed to mark claimed job as failed:", markFailedError);
        }
      }

      await sleep(POLL_MS);
    }
  }
}

main().catch((error) => {
  console.error("Fatal worker error:", toErrorMessage(error));
  process.exit(1);
});
