"use client";

import { useState } from "react";

interface VercelConnectFormProps {
  connected: boolean;
  teamTarget: string | null;
  onUpdated: (next: { connected: boolean; teamTarget: string | null }) => void;
}

export function VercelConnectForm({ connected, teamTarget, onUpdated }: VercelConnectFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState("");
  const [nextTeamTarget, setNextTeamTarget] = useState(teamTarget ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(): Promise<void> {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/vercel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token,
          teamTarget: nextTeamTarget
        })
      });

      const json = (await response.json()) as { error?: string; connected?: boolean; teamTarget?: string };
      if (!response.ok || !json.connected) {
        throw new Error(json.error || "Failed to save Vercel settings.");
      }

      onUpdated({ connected: true, teamTarget: json.teamTarget || null });
      setToken("");
      setExpanded(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save Vercel settings.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect(): Promise<void> {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/vercel", { method: "DELETE" });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Failed to disconnect Vercel.");
      }

      onUpdated({ connected: false, teamTarget: null });
      setNextTeamTarget("");
      setExpanded(false);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Failed to disconnect Vercel.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel-card">
      <div className="stack-tight">
        <div className="row-between row-start-gap">
          <div>
            <div className="card-title">Vercel</div>
            <div className="subtle-copy">
              {connected ? "Connected" : "Not connected"}
              {teamTarget ? ` • ${teamTarget}` : ""}
            </div>
          </div>

          <button className="button button-secondary button-small" type="button" onClick={() => setExpanded((value) => !value)}>
            {connected ? "Edit" : "Connect Vercel"}
          </button>
        </div>

        {expanded ? (
          <div className="stack-tight">
            <div className="field field-tight">
              <label htmlFor="vercel-token">Token</label>
              <input
                id="vercel-token"
                className="input"
                type="password"
                placeholder="vcp_..."
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </div>

            <div className="field field-tight">
              <label htmlFor="vercel-team-target">Team ID or slug</label>
              <input
                id="vercel-team-target"
                className="input"
                type="text"
                placeholder="team_... or your-team-slug"
                value={nextTeamTarget}
                onChange={(event) => setNextTeamTarget(event.target.value)}
              />
            </div>

            {error ? <div className="error-banner">{error}</div> : null}

            <div className="inline-actions">
              <button className="button button-primary" type="button" onClick={() => void handleSave()} disabled={loading}>
                {loading ? "Saving…" : connected ? "Save" : "Connect Vercel"}
              </button>

              {connected ? (
                <button className="button button-secondary" type="button" onClick={() => void handleDisconnect()} disabled={loading}>
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
