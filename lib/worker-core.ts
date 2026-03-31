import fs from "node:fs/promises";
import path from "node:path";
import {
  appendJobEvent,
  getGithubAccessTokenForUser,
  getJobByIdForUser,
  getVercelSettingsForUser,
  updateJob
} from "./db";
import { scaffoldGreenfieldNextApp } from "./bootstrap";
import {
  addRemote,
  cloneRepo,
  commitAll,
  configureGitIdentity,
  createBranch,
  initializeGitRepo,
  prepareWorkspace,
  pushBranch
} from "./git";
import { createPullRequest, createRepository, getRepository, listUserRepos } from "./github";
import { decideRepository, generateEdits, generatePlan } from "./openai";
import { applyFileChanges, buildRepoTree, detectProjectCommands, readRelevantFiles } from "./repo";
import { runCommand } from "./runner";
import { deployToVercel } from "./vercel";
import { sanitizeBranchName, slugify, toErrorMessage, withTimeout } from "./utils";

const SHORT_TIMEOUT = 15000;
const NETWORK_TIMEOUT = 45000;
const MODEL_TIMEOUT = 120000;
const FILESYSTEM_TIMEOUT = 30000;
const LONG_TIMEOUT = 1000 * 60 * 10;
const DEPLOY_TIMEOUT = 1000 * 60 * 15;

function isTransientCleanupError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY";
}

async function removeWorkspaceBestEffort(workspaceRoot: string): Promise<void> {
  const waits = [150, 400, 900, 1600];

  for (const waitMs of waits) {
    try {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isTransientCleanupError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  try {
    const renamedPath = `${workspaceRoot}-cleanup-${Date.now()}`;
    await fs.rename(workspaceRoot, renamedPath);
    await fs.rm(renamedPath, { recursive: true, force: true });
  } catch (error) {
    if (!isTransientCleanupError(error)) {
      throw error;
    }
  }
}

async function setStage(jobId: string, stage: string, message?: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await updateJob(jobId, { current_stage: stage, error_message: null });
  if (message) {
    await appendJobEvent(jobId, stage, message, metadata);
  }
}

async function step<T>(jobId: string, label: string, work: () => Promise<T>, timeoutMs: number): Promise<T> {
  console.log(`[${jobId}] ${label}`);
  return withTimeout(work(), timeoutMs, label);
}

export async function runJob(jobId: string, userId: string): Promise<void> {
  const job = await step(jobId, "Load job", () => getJobByIdForUser(jobId, userId), SHORT_TIMEOUT);
  if (!job) {
    throw new Error(`Job ${jobId} was not found.`);
  }

  let workspaceRoot = "";
  let repoDir = "";

  try {
    await setStage(job.id, "repos", "Preparing repository strategy.");

    const githubAccessToken = await step(job.id, "Load GitHub access token", () => getGithubAccessTokenForUser(userId), SHORT_TIMEOUT);
    const vercelSettings = await step(job.id, "Load Vercel settings", () => getVercelSettingsForUser(userId), SHORT_TIMEOUT);
    workspaceRoot = await step(job.id, "Prepare workspace", () => prepareWorkspace(job.id), FILESYSTEM_TIMEOUT);
    repoDir = path.join(workspaceRoot, "repo");

    await appendJobEvent(job.id, "repos", "Loading accessible repositories.");
    const repos = await step(job.id, "Load accessible repositories", () => listUserRepos(githubAccessToken), NETWORK_TIMEOUT);

    const decision = await step(job.id, "Decide repository strategy", () => decideRepository({
      brief: job.brief,
      repos
    }), MODEL_TIMEOUT);

    await appendJobEvent(job.id, "repos", "Repository strategy selected.", {
      decision
    });

    let repoFullName = "";
    let repoUrl = "";
    let baseBranch = "main";
    const creatingGreenfield = decision.mode === "create";

    if (decision.mode === "use_existing" && decision.existingRepoFullName) {
      const repo = await step(job.id, "Load selected repository", () => getRepository(githubAccessToken, decision.existingRepoFullName!), NETWORK_TIMEOUT);
      repoFullName = repo.full_name;
      repoUrl = repo.html_url;
      baseBranch = repo.default_branch || "main";

      await updateJob(job.id, {
        repo_strategy: "existing",
        repo_full_name: repoFullName,
        repo_url: repoUrl,
        repo_description: repo.description,
        base_branch: baseBranch
      });

      await setStage(job.id, "clone", "Cloning existing repository.", {
        repoFullName,
        baseBranch
      });

      await step(job.id, "Clone repository", () => cloneRepo({
        accessToken: githubAccessToken,
        repoFullName,
        baseBranch,
        destination: repoDir
      }), LONG_TIMEOUT);
    } else {
      const repo = await step(job.id, "Create repository", () => createRepository(githubAccessToken, {
        name: decision.repoName,
        description: decision.description,
        isPrivate: false
      }), NETWORK_TIMEOUT);

      repoFullName = repo.full_name;
      repoUrl = repo.html_url;
      baseBranch = repo.default_branch || "main";

      await updateJob(job.id, {
        repo_strategy: "created",
        repo_full_name: repoFullName,
        repo_url: repoUrl,
        repo_description: repo.description,
        base_branch: baseBranch
      });

      await setStage(job.id, "bootstrap", "Created a fresh GitHub repository.", {
        repoFullName,
        repoUrl
      });

      await step(job.id, "Create repo directory", async () => {
        await fs.mkdir(repoDir, { recursive: true });
      }, FILESYSTEM_TIMEOUT);

      await step(job.id, "Scaffold greenfield app", () => scaffoldGreenfieldNextApp(repoDir, decision.projectName, job.brief), LONG_TIMEOUT);
      await step(job.id, "Initialize Git repository", () => initializeGitRepo(repoDir, baseBranch), FILESYSTEM_TIMEOUT);
      await step(job.id, "Add Git remote", () => addRemote(repoDir, repoFullName, githubAccessToken), FILESYSTEM_TIMEOUT);
    }

    await step(job.id, "Configure Git identity", () => configureGitIdentity(repoDir), FILESYSTEM_TIMEOUT);
    const initialTree = await step(job.id, "Build repository tree", () => buildRepoTree(repoDir), FILESYSTEM_TIMEOUT);

    await setStage(job.id, "plan", "Generating implementation plan.");
    const plan = await step(job.id, "Generate implementation plan", () => generatePlan({
      repoTree: initialTree,
      taskPrompt: job.brief,
      baseBranch
    }), MODEL_TIMEOUT);

    const fallbackBranch = `agent/${slugify(job.brief) || job.id.slice(0, 8)}`;
    const branchName = creatingGreenfield ? baseBranch : sanitizeBranchName(plan.branchName, fallbackBranch);

    if (!creatingGreenfield) {
      await step(job.id, "Create working branch", () => createBranch(repoDir, branchName), FILESYSTEM_TIMEOUT);
    }

    await updateJob(job.id, {
      current_stage: "edit",
      branch_name: branchName
    });

    await appendJobEvent(job.id, "plan", "Plan complete.", {
      summary: plan.summary,
      relevantFiles: plan.relevantFiles,
      implementationSteps: plan.implementationSteps,
      branchName
    });

    let relevantFiles = await step(job.id, "Read relevant files", () => readRelevantFiles(repoDir, plan.relevantFiles), FILESYSTEM_TIMEOUT);
    let editResult = await step(job.id, "Generate initial edits", () => generateEdits({
      taskPrompt: job.brief,
      repoTree: initialTree,
      relevantFileContents: relevantFiles
    }), MODEL_TIMEOUT);

    await appendJobEvent(job.id, "edit", "Applying model-generated file changes.", {
      changedFiles: editResult.files.map((file) => file.path)
    });

    await step(job.id, "Apply initial file changes", () => applyFileChanges(repoDir, editResult.files), FILESYSTEM_TIMEOUT);

    const commandPlan = await step(job.id, "Detect project commands", () => detectProjectCommands(repoDir), FILESYSTEM_TIMEOUT);

    if (commandPlan.installCommand) {
      await setStage(job.id, "install", `Running install command: ${commandPlan.installCommand}`);
      const installResult = await runCommand(commandPlan.installCommand, repoDir, LONG_TIMEOUT);
      await appendJobEvent(job.id, "install", "Install command succeeded.", {
        output: installResult.combined.slice(-4000)
      });
    }

    await updateJob(job.id, { current_stage: "validate" });

    let repaired = false;
    let latestSummary = editResult.summary;
    let latestCommitMessage = editResult.commitMessage || "agent: implement brief";

    for (let attempt = 0; attempt <= 2; attempt += 1) {
      const validation = await validateRepo(repoDir, commandPlan.buildCommand, commandPlan.testCommand);

      if (validation.ok) {
        await appendJobEvent(job.id, "validate", "Build and test commands succeeded.", {
          buildOutput: validation.buildOutput?.slice(-4000) ?? "",
          testOutput: validation.testOutput?.slice(-4000) ?? ""
        });
        break;
      }

      if (attempt === 2) {
        throw new Error(validation.failureText);
      }

      repaired = true;
      await setStage(job.id, "repair", `Validation failed. Starting repair attempt ${attempt + 1}.`, {
        failure: validation.failureText.slice(-8000)
      });

      relevantFiles = await step(job.id, `Read relevant files for repair ${attempt + 1}`, () => readRelevantFiles(
        repoDir,
        Array.from(new Set([...plan.relevantFiles, ...editResult.files.map((file) => file.path)]))
      ), FILESYSTEM_TIMEOUT);

      const repairRepoTree = await step(job.id, `Build repo tree for repair ${attempt + 1}`, () => buildRepoTree(repoDir), FILESYSTEM_TIMEOUT);
      editResult = await step(job.id, `Generate repair edits ${attempt + 1}`, () => generateEdits({
        taskPrompt: job.brief,
        repoTree: repairRepoTree,
        relevantFileContents: relevantFiles,
        failureContext: validation.failureText
      }), MODEL_TIMEOUT);

      latestSummary = editResult.summary;
      latestCommitMessage = editResult.commitMessage || latestCommitMessage;

      await step(job.id, `Apply repair changes ${attempt + 1}`, () => applyFileChanges(repoDir, editResult.files), FILESYSTEM_TIMEOUT);

      await appendJobEvent(job.id, "repair", "Repair changes applied.", {
        changedFiles: editResult.files.map((file) => file.path)
      });

      await updateJob(job.id, { current_stage: "validate" });
    }

    await updateJob(job.id, { current_stage: "git" });
    await step(job.id, "Commit changes", () => commitAll(repoDir, latestCommitMessage), FILESYSTEM_TIMEOUT);
    await step(job.id, "Push branch", () => pushBranch(repoDir, branchName), LONG_TIMEOUT);

    await appendJobEvent(job.id, "git", "Changes committed and pushed.", {
      repoFullName,
      branchName,
      repaired
    });

    let prUrl: string | null = null;
    if (!creatingGreenfield) {
      prUrl = await step(job.id, "Create pull request", () => createPullRequest({
        accessToken: githubAccessToken,
        repoFullName,
        title: latestCommitMessage,
        body: [
          "## Autonomous agent summary",
          latestSummary,
          "",
          "## Original brief",
          job.brief
        ].join("\n"),
        head: branchName,
        base: baseBranch
      }), NETWORK_TIMEOUT);

      await appendJobEvent(job.id, "github", "Pull request created.", { prUrl });
    }

    await updateJob(job.id, { current_stage: "deploy" });

    const previewUrl = await step(job.id, "Create Vercel preview deployment", () => deployToVercel({
      repoDir,
      projectLabel: decision.projectName || repoFullName,
      token: vercelSettings.token,
      teamTarget: vercelSettings.teamTarget
    }), DEPLOY_TIMEOUT);

    await appendJobEvent(job.id, "deploy", "Preview deployment created.", {
      previewUrl
    });

    await updateJob(job.id, {
      status: "succeeded",
      current_stage: "done",
      result_summary: latestSummary,
      pr_url: prUrl,
      preview_url: previewUrl,
      completed_at: new Date().toISOString(),
      error_message: null
    });

    await appendJobEvent(job.id, "done", "Job completed successfully.");
  } catch (error) {
    await updateJob(job.id, {
      status: "failed",
      current_stage: "failed",
      error_message: toErrorMessage(error),
      completed_at: new Date().toISOString()
    });

    await appendJobEvent(job.id, "failed", "Job failed.", {
      error: toErrorMessage(error)
    });

    throw error;
  } finally {
    if (workspaceRoot) {
      try {
        await removeWorkspaceBestEffort(workspaceRoot);
      } catch (error) {
        console.warn(`Workspace cleanup warning for ${workspaceRoot}:`, error);
      }
    }
  }
}

async function validateRepo(
  repoDir: string,
  buildCommand: string | null,
  testCommand: string | null
): Promise<
  | {
      ok: true;
      buildOutput?: string;
      testOutput?: string;
    }
  | {
      ok: false;
      failureText: string;
    }
> {
  let buildOutput = "";
  let testOutput = "";

  try {
    if (buildCommand) {
      const buildResult = await runCommand(buildCommand, repoDir, LONG_TIMEOUT);
      buildOutput = buildResult.combined;
    }

    if (testCommand) {
      const testResult = await runCommand(testCommand, repoDir, LONG_TIMEOUT);
      testOutput = testResult.combined;
    }

    return {
      ok: true,
      buildOutput,
      testOutput
    };
  } catch (error) {
    return {
      ok: false,
      failureText: toErrorMessage(error)
    };
  }
}