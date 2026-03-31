import { env } from "./env";
import type { GitHubProfile, RepoCandidate } from "./types";
import { fetchWithTimeout } from "./utils";

const API_VERSION = "2022-11-28";
const GITHUB_TIMEOUT_MS = 45000;

async function fetchGitHub<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetchWithTimeout(
    `https://api.github.com${path}`,
    {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": API_VERSION,
        ...(init.headers ?? {})
      }
    },
    GITHUB_TIMEOUT_MS
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}

export function buildGithubAuthorizeUrl(state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.githubClientId);
  url.searchParams.set("redirect_uri", env.githubRedirectUri);
  url.searchParams.set("scope", "repo read:user user:email");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGithubCode(code: string): Promise<string> {
  const response = await fetchWithTimeout(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: env.githubClientId,
        client_secret: env.githubClientSecret,
        code,
        redirect_uri: env.githubRedirectUri
      })
    },
    GITHUB_TIMEOUT_MS
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub OAuth exchange failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as { access_token?: string; error?: string };
  if (!json.access_token) {
    throw new Error(json.error || "GitHub OAuth did not return an access token.");
  }

  return json.access_token;
}

export async function getAuthenticatedGithubUser(accessToken: string): Promise<GitHubProfile> {
  return fetchGitHub<GitHubProfile>("/user", accessToken);
}

export async function listUserRepos(accessToken: string): Promise<RepoCandidate[]> {
  return fetchGitHub<RepoCandidate[]>(
    "/user/repos?sort=pushed&direction=desc&per_page=100",
    accessToken
  );
}

export async function getRepository(accessToken: string, fullName: string): Promise<RepoCandidate> {
  return fetchGitHub<RepoCandidate>(`/repos/${fullName}`, accessToken);
}

export async function createRepository(
  accessToken: string,
  params: { name: string; description: string; isPrivate?: boolean }
): Promise<RepoCandidate> {
  return fetchGitHub<RepoCandidate>("/user/repos", accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: params.name,
      description: params.description,
      private: params.isPrivate ?? false,
      auto_init: false
    })
  });
}

export async function createPullRequest(params: {
  accessToken: string;
  repoFullName: string;
  title: string;
  body: string;
  head: string;
  base: string;
}): Promise<string> {
  const response = await fetchWithTimeout(
    `https://api.github.com/repos/${params.repoFullName}/pulls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": API_VERSION
      },
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base
      })
    },
    GITHUB_TIMEOUT_MS
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub PR creation failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as { html_url: string };
  return json.html_url;
}