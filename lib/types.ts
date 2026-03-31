import type { JWTPayload } from "jose";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface UserRecord {
  id: string;
  github_user_id: string;
  github_login: string;
  github_name: string | null;
  github_avatar_url: string | null;
  github_access_token_encrypted: string;
  vercel_token_encrypted: string | null;
  vercel_team_target: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRecord {
  id: string;
  user_id: string;
  brief: string;
  repo_full_name: string | null;
  repo_url: string | null;
  repo_strategy: string | null;
  repo_description: string | null;
  base_branch: string;
  branch_name: string | null;
  status: JobStatus;
  current_stage: string;
  result_summary: string | null;
  pr_url: string | null;
  preview_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface JobEventRecord {
  id: number;
  job_id: string;
  stage: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SessionUser extends JWTPayload {
  userId: string;
  githubLogin: string;
}

export interface GitHubProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface RepoCandidate {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  language: string | null;
  pushed_at: string;
  stargazers_count: number;
}

export interface RepoDecision {
  mode: "create" | "use_existing";
  repoName: string;
  existingRepoFullName?: string;
  projectName: string;
  description: string;
  reason: string;
}

export interface PlanResult {
  summary: string;
  branchName: string;
  relevantFiles: string[];
  implementationSteps: string[];
}

export interface FileChange {
  path: string;
  content: string;
  explanation: string;
}

export interface EditResult {
  summary: string;
  commitMessage: string;
  files: FileChange[];
  notes: string[];
}

export interface CommandPlan {
  installCommand: string | null;
  buildCommand: string | null;
  testCommand: string | null;
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
}
