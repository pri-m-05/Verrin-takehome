"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

interface CreateRunFormProps {
  onCreated: (jobId: string) => void;
  onRefresh: () => Promise<void>;
  canLaunch: boolean;
}

function writePendingRunShell(runWindow: Window | null): void {
  if (!runWindow || runWindow.closed) {
    return;
  }

  runWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Opening run</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f5f5f7;
        color: #111111;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .card {
        width: min(520px, calc(100vw - 32px));
        padding: 28px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 28px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 32px;
        line-height: 1;
        letter-spacing: -0.04em;
      }
      p {
        margin: 0;
        color: #52525b;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Opening run…</h1>
      <p>Your live run view will load here in a moment.</p>
    </div>
  </body>
</html>`);
  runWindow.document.close();
}

export function CreateRunForm({ onCreated, onRefresh, canLaunch }: CreateRunFormProps) {
  const [brief, setBrief] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(
    () => brief.trim().length > 0 && !submitting && canLaunch,
    [brief, submitting, canLaunch]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const runWindow = typeof window !== "undefined" ? window.open("", "_blank") : null;
    writePendingRunShell(runWindow);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ brief })
      });

      const json = (await response.json()) as { error?: string; job?: { id: string } };

      if (!response.ok || !json.job) {
        throw new Error(json.error || "Failed to create run.");
      }

      await onRefresh();
      onCreated(json.job.id);

      if (runWindow && !runWindow.closed) {
        runWindow.location.href = `/jobs/${json.job.id}?autopreview=1`;
        runWindow.focus();
      }

      setBrief("");
    } catch (submissionError) {
      if (runWindow && !runWindow.closed) {
        runWindow.close();
      }
      setError(submissionError instanceof Error ? submissionError.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack-large">
      <div className="section-copy section-copy-tight">
        <h2>Launch a run</h2>
        <p className="subtle-copy">Paste one software brief. The rest happens automatically.</p>
      </div>

      <div className="field field-tight">
        <label htmlFor="brief">Brief</label>
        <textarea
          id="brief"
          className="textarea textarea-large"
          placeholder="Build a clean support dashboard with status filters, owner assignment, priority badges, and a responsive layout."
          value={brief}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setBrief(event.target.value)}
          required
        />
      </div>

      {!canLaunch ? <div className="error-banner">Connect Vercel before launching a run.</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <button className="button button-primary button-full" type="submit" disabled={!canSubmit}>
        {submitting ? "Launching…" : "Launch run"}
      </button>
    </form>
  );
}