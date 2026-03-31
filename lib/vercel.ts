import { env } from "./env";
import { runCommand } from "./runner";
import { fetchWithTimeout, slugify } from "./utils";

function projectName(input: string): string {
  return slugify(input) || `agent-project-${Date.now()}`;
}

function applyTeamTarget(url: URL, teamTarget: string): void {
  if (!teamTarget) {
    return;
  }

  if (teamTarget.startsWith("team_")) {
    url.searchParams.set("teamId", teamTarget);
    return;
  }

  url.searchParams.set("slug", teamTarget);
}

async function ensureProjectExists(name: string, token: string, teamTarget: string): Promise<void> {
  if (!token) {
    throw new Error("Missing Vercel token. Connect Vercel before launching a run.");
  }

  const url = new URL("https://api.vercel.com/v10/projects");
  applyTeamTarget(url, teamTarget);

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name })
    },
    45000
  );

  if (response.ok || response.status === 409) {
    return;
  }

  const text = await response.text();
  if (response.status === 400 && text.toLowerCase().includes("already exists")) {
    return;
  }

  throw new Error(`Failed to create Vercel project: ${response.status} ${text}`);
}

export async function deployToVercel(params: {
  repoDir: string;
  projectLabel: string;
  token?: string;
  teamTarget?: string;
}): Promise<string> {
  const name = projectName(params.projectLabel);
  const token = params.token ?? env.vercelToken;
  const teamTarget = params.teamTarget ?? env.vercelTeamId;

  await ensureProjectExists(name, token, teamTarget);

  const teamFlag = teamTarget ? ` --team "${teamTarget}"` : "";
  const command = `npx vercel deploy --token "${token}" --yes --name "${name}"${teamFlag}`;
  const result = await runCommand(command, params.repoDir, 1000 * 60 * 15);
  const match = result.combined.match(/https:\/\/[\w.-]+\.vercel\.app/);

  if (!match) {
    throw new Error(`Vercel deploy did not return a preview URL.\n${result.combined}`);
  }

  return match[0];
}