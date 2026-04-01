"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreateRunForm } from "./create-run-form";
import { VercelConnectForm } from "./vercel-connect-form";
import type { JobRecord } from "../lib/types";

interface MePayload {
  user: {
    githubLogin: string;
    githubName: string | null;
    githubAvatarUrl: string | null;
    vercelConnected: boolean;
    vercelTeamTarget: string | null;
  } | null;
  error?: string;
}

interface JobsPayload {
  jobs: JobRecord[];
  error?: string;
}

const STALE_KEYS = [
  "relay.pendingPreviewJobId",
  "relay.lastOpenedPreviewJobId",
  "relay.autoOpenPreviewJobId",
  "relay.previewUrl",
  "relay.pendingRunId"
];

function formatStatus(status: JobRecord["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

export function DashboardClient() {
  const [me, setMe] = useState<MePayload["user"]>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [authError, setAuthError] = useState("");
  const [jobsError, setJobsError] = useState("");

  async function refreshMe(): Promise<void> {
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      const json = (await response.json()) as MePayload;
      if (!response.ok) {
        throw new Error(json.error || "Failed to load session.");
      }
      setMe(json.user);
      setAuthError("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to load session.");
    }
  }

  async function refreshJobs(): Promise<void> {
    if (!me) {
      return;
    }

    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      const json = (await response.json()) as JobsPayload;
      if (!response.ok) {
        throw new Error(json.error || "Failed to load runs.");
      }

      setJobs(json.jobs);
      setJobsError("");
    } catch (error) {
      setJobsError(error instanceof Error ? error.message : "Failed to load runs.");
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    for (const key of STALE_KEYS) {
      try {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      } catch {}
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, []);

  useEffect(() => {
    if (!me) {
      return;
    }

    void refreshJobs();
    const timer = window.setInterval(() => void refreshJobs(), 2500);
    return () => window.clearInterval(timer);
  }, [me]);

  if (!me) {
    return (
      <section className="panel panel-inner panel-compact auth-panel">
        <div className="section-copy section-copy-tight">
          <h2>Connect GitHub</h2>
          <p className="subtle-copy">Sign in once to let the agent create or reuse repositories.</p>
        </div>

        {authError ? <div className="error-banner">{authError}</div> : null}

        <a className="button button-primary" href="/api/auth/github/start">
          Connect GitHub
        </a>
      </section>
    );
  }

  return (
    <div className="dashboard-grid">
      <section className="stack-large">
        <div className="panel panel-inner panel-compact">
          <div className="account-row">
            {me.githubAvatarUrl ? <img className="avatar avatar-photo" src={me.githubAvatarUrl} alt="" /> : <div className="avatar" />}
            <div>
              <div className="account-name">{me.githubName || me.githubLogin}</div>
              <div className="subtle-copy">@{me.githubLogin}</div>
            </div>
          </div>
        </div>

        <VercelConnectForm
          connected={me.vercelConnected}
          teamTarget={me.vercelTeamTarget}
          onUpdated={(next) => {
            setMe((current) =>
              current
                ? {
                    ...current,
                    vercelConnected: next.connected,
                    vercelTeamTarget: next.teamTarget
                  }
                : current
            );
          }}
        />

        <div className="panel panel-inner panel-compact">
          <CreateRunForm
            onCreated={() => {}}
            onRefresh={refreshJobs}
            canLaunch={me.vercelConnected}
          />
        </div>

        <div className="inline-actions">
          <a className="button button-secondary" href="/api/auth/logout">
            Disconnect GitHub
          </a>
        </div>
      </section>

      <section className="panel panel-inner panel-wide">
        <div className="section-copy section-copy-tight">
          <h2>Recent runs</h2>
          {jobsError ? <div className="error-inline">{jobsError}</div> : null}
        </div>

        {jobs.length === 0 ? (
          <div className="empty-state">No runs yet.</div>
        ) : (
          <div className="runs-table-wrap">
            <table className="runs-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Repo</th>
                  <th>Brief</th>
                  <th>Stage</th>
                  <th>Created</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <span className={`badge badge-${job.status}`}>{formatStatus(job.status)}</span>
                    </td>
                    <td>
                      <div className="run-primary">{job.repo_full_name ?? "Resolving repository…"}</div>
                      <div className="subtle-copy">{job.repo_strategy || "Preparing strategy"}</div>
                    </td>
                    <td>
                      <div className="run-brief">{job.brief}</div>
                    </td>
                    <td className="subtle-copy">{job.current_stage}</td>
                    <td className="subtle-copy">{formatTime(job.created_at)}</td>
                    <td>
                      <div className="run-links">
                        <Link className="run-link" href={`/jobs/${job.id}`}>
                          Open run
                        </Link>
                        {job.preview_url ? (
                          <a className="run-link" href={job.preview_url} target="_blank" rel="noreferrer">
                            Open preview
                          </a>
                        ) : null}
                        {job.pr_url ? (
                          <a className="run-link" href={job.pr_url} target="_blank" rel="noreferrer">
                            Open PR
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}