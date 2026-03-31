import type { EditResult, PlanResult, RepoCandidate, RepoDecision } from "./types";
import { env } from "./env";
import { clampText, extractJson, fetchWithTimeout, slugify } from "./utils";

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

const OPENAI_TIMEOUT_MS = 120000;

async function runChatCompletion(system: string, user: string): Promise<string> {
  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openAiApiKey}`
      },
      body: JSON.stringify({
        model: env.openAiModel,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    },
    OPENAI_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const json = (await response.json()) as ChatCompletionResponse;
  return json.choices?.[0]?.message?.content ?? "";
}

export async function decideRepository(input: {
  brief: string;
  repos: RepoCandidate[];
}): Promise<RepoDecision> {
  const repoSummary = input.repos.slice(0, 40).map((repo) => ({
    fullName: repo.full_name,
    description: repo.description,
    language: repo.language,
    pushedAt: repo.pushed_at,
    defaultBranch: repo.default_branch
  }));

  const system = [
    "You are deciding whether an autonomous coding agent should reuse an existing GitHub repo or create a new one.",
    "Return JSON only.",
    "Use this exact shape:",
    "{",
    '  "mode": "create" | "use_existing",',
    '  "repoName": "string",',
    '  "existingRepoFullName": "string",',
    '  "projectName": "string",',
    '  "description": "string",',
    '  "reason": "string"',
    "}",
    "Prefer create when the brief sounds like a new standalone product.",
    "Prefer use_existing only if a repo is clearly a strong fit.",
    "repoName must be GitHub-safe and concise."
  ].join("\n");

  const user = [
    `Brief:\n${input.brief}`,
    `Repo candidates:\n${JSON.stringify(repoSummary, null, 2)}`
  ].join("\n\n");

  try {
    const text = await runChatCompletion(system, user);
    const decision = extractJson<RepoDecision>(text);
    return {
      ...decision,
      repoName: decision.repoName || slugify(decision.projectName || input.brief) || "agent-product",
      projectName: decision.projectName || input.brief.split("\n")[0].slice(0, 60),
      description: decision.description || input.brief.slice(0, 140),
      reason: decision.reason || "Model decision unavailable."
    };
  } catch {
    return {
      mode: "create",
      repoName: slugify(input.brief) || "agent-product",
      projectName: input.brief.split("\n")[0].slice(0, 60),
      description: input.brief.slice(0, 140),
      reason: "Fallback decision: create a fresh repo."
    };
  }
}

export async function generatePlan(input: {
  repoTree: string;
  taskPrompt: string;
  baseBranch: string;
}): Promise<PlanResult> {
  const system = [
    "You are a senior founding engineer planning an autonomous GitHub coding task.",
    "Return JSON only.",
    "Use this exact shape:",
    "{",
    '  "summary": "string",',
    '  "branchName": "string",',
    '  "relevantFiles": ["path/to/file"],',
    '  "implementationSteps": ["step"]',
    "}",
    "Choose concise, repo-safe relevant files.",
    "Do not include explanations outside JSON."
  ].join("\n");

  const user = [
    `Task prompt:\n${input.taskPrompt}`,
    `Base branch: ${input.baseBranch}`,
    `Repository tree:\n${clampText(input.repoTree, 25000)}`
  ].join("\n\n");

  const text = await runChatCompletion(system, user);
  return extractJson<PlanResult>(text);
}

export async function generateEdits(input: {
  taskPrompt: string;
  repoTree: string;
  relevantFileContents: Array<{ path: string; content: string }>;
  failureContext?: string;
}): Promise<EditResult> {
  const system = [
    "You are an autonomous software engineer editing a real codebase.",
    "Return JSON only.",
    "Use this exact shape:",
    "{",
    '  "summary": "string",',
    '  "commitMessage": "string",',
    '  "files": [{"path":"string","content":"full new file contents","explanation":"string"}],',
    '  "notes": ["string"]',
    "}",
    "Rules:",
    "- Return full file contents for every changed file.",
    "- Only change files that are necessary.",
    "- Keep code compiling.",
    "- If a file is new, still provide full contents.",
    "- Never omit content with placeholders."
  ].join("\n");

  const filesText = input.relevantFileContents
    .map((file) => `FILE: ${file.path}\n${clampText(file.content, 18000)}`)
    .join("\n\n====================\n\n");

  const user = [
    `Task prompt:\n${input.taskPrompt}`,
    input.failureContext ? `Failure context:\n${clampText(input.failureContext, 12000)}` : "",
    `Repository tree:\n${clampText(input.repoTree, 18000)}`,
    `Relevant files:\n${filesText}`
  ]
    .filter(Boolean)
    .join("\n\n");

  const text = await runChatCompletion(system, user);
  return extractJson<EditResult>(text);
}