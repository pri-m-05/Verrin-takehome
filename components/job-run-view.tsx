"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JobEventRecord, JobRecord } from "../lib/types";

interface JobPayload {
  job: JobRecord | null;
  events: JobEventRecord[];
  error?: string;
}

const STAGES = [
  "queued",
  "claimed",
  "repos",
  "bootstrap",
  "clone",
  "plan",
  "edit",
  "install",
  "validate",
  "repair",
  "git",
  "github",
  "deploy",
  "done"
] as const;

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  claimed: "Claimed",
  repos: "Repo",
  bootstrap: "Bootstrap",
  clone: "Clone",
  plan: "Plan",
  edit: "Edit",
  install: "Install",
  validate: "Validate",
  repair: "Repair",
  git: "Push",
  github: "PR",
  deploy: "Preview",
  done: "Done",
  failed: "Failed"
};

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

function stageIndex(stage: string): number {
  const index = STAGES.indexOf(stage as (typeof STAGES)[number]);
  return index === -1 ? 0 : index;
}

function latestChangedFiles(events: JobEventRecord[]): string[] {
  const editEvent = [...events].reverse().find((event) => {
    const metadata = (event.metadata as { meaningfulChangedFiles?: unknown; changedFiles?: unknown }) ?? {};
    return Array.isArray(metadata.meaningfulChangedFiles) || Array.isArray(metadata.changedFiles);
  });

  if (!editEvent) {
    return [];
  }

  const metadata = editEvent.metadata as {
    meaningfulChangedFiles?: unknown;
    changedFiles?: unknown;
  };

  if (Array.isArray(metadata.meaningfulChangedFiles)) {
    return metadata.meaningfulChangedFiles.filter((item): item is string => typeof item === "string");
  }

  if (Array.isArray(metadata.changedFiles)) {
    return metadata.changedFiles.filter((item): item is string => typeof item === "string");
  }

  return [];
}

export function JobRunView({ jobId }: { jobId: string }) {
  const [payload, setPayload] = useState<JobPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const autoPreviewTriggeredRef = useRef(false);

  useEffect(() => {
    async function fetchJob(): Promise<void> {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const json = (await response.json()) as JobPayload;

        if (!response.ok) {
          throw new Error(json.error || "Failed to fetch run.");
        }

        setPayload(json);
        setError("");
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch run.");
      } finally {
        setLoading(false);
      }
    }

    void fetchJob();
    const timer = window.setInterval(() => void fetchJob(), 2500);
    return () => window.clearInterval(timer);
  }, [jobId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const shouldAutoPreview = params.get("autopreview") === "1";

    if (!shouldAutoPreview) {
      return;
    }

    if (!payload?.job?.preview_url || payload.job.status !== "succeeded") {
      return;
    }

    if (autoPreviewTriggeredRef.current) {
      return;
    }

    autoPreviewTriggeredRef.current = true;
    window.location.replace(payload.job.preview_url);
  }, [payload]);

  const latestEvent = useMemo(() => payload?.events[payload.events.length - 1] ?? null, [payload]);
  const changedFiles = useMemo(() => latestChangedFiles(payload?.events ?? []), [payload]);

  if (loading && !payload?.job) {
    return <div className="panel panel-inner empty-state">Loading run…</div>;
  }

  if (error && !payload?.job) {
    return <div className="panel panel-inner error-banner">{error}</div>;
  }

  if (!payload?.job) {
    return <div className="panel panel-inner empty-state">Run not found.</div>;
  }

  const { job, events } = payload;
  const currentIndex = stageIndex(job.current_stage);
  const progressPercent =
    job.status === "succeeded"
      ? 100
      : Math.max(6, Math.round(((currentIndex + 1) / STAGES.length) * 100));

  return (
    <div className="stack-large">
      <div className="row-between row-start-gap">
        <div className="stack-tight">
          <Link className="back-link" href="/">
            ← Back
          </Link>
          <h1 className="run-page-title">{job.repo_full_name ?? "Resolving repository…"}</h1>
          <p className="subtle-copy run-page-brief">{job.brief}</p>
        </div>

        <span className={`badge badge-${job.status}`}>{job.status}</span>
      </div>

      <section className="panel panel-inner panel-wide">
        <div className="progress-header">
          <div>
            <div className="card-title">Progress</div>
            <div className="subtle-copy">{STAGE_LABELS[job.current_stage] ?? job.current_stage}</div>
          </div>
          <div className="progress-percent">{progressPercent}%</div>
        </div>

        <div className="progress-track progress-track-wide">
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="progress-step-grid">
          {STAGES.map((stage, index) => {
            const isDone = index < currentIndex || job.status === "succeeded";
            const isActive = stage === job.current_stage && job.status !== "succeeded";

            return (
              <div
                key={stage}
                className={`progress-chip ${isDone ? "progress-chip-done" : ""} ${isActive ? "progress-chip-active" : ""}`}
              >
                {STAGE_LABELS[stage] ?? stage}
              </div>
            );
          })}
          {job.status === "failed" ? <div className="progress-chip progress-chip-failed">Failed</div> : null}
        </div>
      </section>

      <section className="stats-grid">
        <div className="panel-card">
          <div className="card-title">Current step</div>
          <div className="metric-copy">{STAGE_LABELS[job.current_stage] ?? job.current_stage}</div>
        </div>
        <div className="panel-card">
          <div className="card-title">Repo strategy</div>
          <div className="metric-copy">{job.repo_strategy || "Waiting"}</div>
        </div>
        <div className="panel-card">
          <div className="card-title">Branch</div>
          <div className="metric-copy">{job.branch_name || "Not created"}</div>
        </div>
        <div className="panel-card">
          <div className="card-title">Latest event</div>
          <div className="metric-copy">{latestEvent ? latestEvent.message : "No events yet."}</div>
        </div>
      </section>

      <section className="panel panel-inner panel-wide">
        <div className="row-between row-start-gap section-copy-tight">
          <div className="stack-tight">
            <h2>Artifacts</h2>
          </div>
          <div className="inline-actions">
            {job.repo_url ? (
              <a className="button button-secondary" href={job.repo_url} target="_blank" rel="noreferrer">
                Repository
              </a>
            ) : null}
            {job.pr_url ? (
              <a className="button button-secondary" href={job.pr_url} target="_blank" rel="noreferrer">
                Pull request
              </a>
            ) : null}
            {job.preview_url ? (
              <a className="button button-primary" href={job.preview_url} target="_blank" rel="noreferrer">
                Open preview
              </a>
            ) : null}
          </div>
        </div>

        {changedFiles.length > 0 ? (
          <div className="file-chip-row">
            {changedFiles.map((filePath) => (
              <span key={filePath} className="file-chip">
                {filePath}
              </span>
            ))}
          </div>
        ) : null}

        {job.result_summary ? <div className="summary-block">{job.result_summary}</div> : null}
        {job.error_message ? <div className="error-banner">{job.error_message}</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}
      </section>

      <section className="panel panel-inner panel-wide">
        <div className="row-between row-start-gap section-copy-tight">
          <h2>Execution timeline</h2>
          {latestEvent ? <div className="subtle-copy">Updated {formatTime(latestEvent.created_at)}</div> : null}
        </div>

        <div className="timeline">
          {events.map((event) => (
            <div key={event.id} className="timeline-item">
              <div className="timeline-topline">
                <div className="card-title">{STAGE_LABELS[event.stage] ?? event.stage}</div>
                <div className="subtle-copy">{formatTime(event.created_at)}</div>
              </div>
              <p className="timeline-copy">{event.message}</p>
              {Object.keys(event.metadata || {}).length > 0 ? (
                <pre className="code-block">{JSON.stringify(event.metadata, null, 2)}</pre>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}