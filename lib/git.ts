import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { runCommand } from "./runner";

function repoAuthUrl(fullName: string, accessToken: string): string {
  return `https://x-access-token:${accessToken}@github.com/${fullName}.git`;
}

export async function prepareWorkspace(jobId: string): Promise<string> {
  const root = path.join(process.cwd(), ".workspaces", jobId);
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  return root;
}

export async function cloneRepo(params: {
  accessToken: string;
  repoFullName: string;
  baseBranch: string;
  destination: string;
}): Promise<void> {
  const authUrl = repoAuthUrl(params.repoFullName, params.accessToken);
  await runCommand(
    `git clone --depth 1 --branch ${params.baseBranch} ${authUrl} "${params.destination}"`,
    process.cwd()
  );
}

export async function initializeGitRepo(repoPath: string, defaultBranch: string): Promise<void> {
  await runCommand(`git init -b ${defaultBranch}`, repoPath);
}

export async function addRemote(repoPath: string, repoFullName: string, accessToken: string): Promise<void> {
  const authUrl = repoAuthUrl(repoFullName, accessToken);
  await runCommand(`git remote add origin ${authUrl}`, repoPath);
}

export async function createBranch(repoPath: string, branchName: string): Promise<void> {
  await runCommand(`git checkout -b ${branchName}`, repoPath);
}

export async function configureGitIdentity(repoPath: string): Promise<void> {
  await runCommand(`git config user.name "${env.gitAuthorName}"`, repoPath);
  await runCommand(`git config user.email "${env.gitAuthorEmail}"`, repoPath);
}

export async function commitAll(repoPath: string, message: string): Promise<void> {
  await runCommand(`git add .`, repoPath);
  await runCommand(`git commit -m "${message.replace(/"/g, "'")}"`, repoPath);
}

export async function pushBranch(repoPath: string, branchName: string): Promise<void> {
  await runCommand(`git push -u origin ${branchName}`, repoPath);
}
