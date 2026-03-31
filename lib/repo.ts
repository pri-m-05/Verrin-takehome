import fs from "node:fs/promises";
import path from "node:path";
import type { CommandPlan, FileChange } from "./types";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".vercel"
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".html",
  ".yml",
  ".yaml",
  ".txt"
]);

export async function buildRepoTree(repoPath: string): Promise<string> {
  const lines: string[] = [];
  await walk(repoPath, "", lines, 0);
  return lines.join("\n");
}

async function walk(absoluteDir: string, relativeDir: string, lines: string[], depth: number): Promise<void> {
  if (depth > 7 || lines.length > 800) {
    return;
  }

  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  entries.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith(".env")) {
      continue;
    }

    const relativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      lines.push(`${"  ".repeat(depth)}📁 ${relativePath}`);
      await walk(path.join(absoluteDir, entry.name), relativePath, lines, depth + 1);
      continue;
    }

    lines.push(`${"  ".repeat(depth)}📄 ${relativePath}`);
  }
}

export async function readRelevantFiles(
  repoPath: string,
  wantedPaths: string[]
): Promise<Array<{ path: string; content: string }>> {
  const unique = Array.from(new Set(wantedPaths)).slice(0, 12);
  const result: Array<{ path: string; content: string }> = [];

  for (const relativePath of unique) {
    const absolutePath = path.join(repoPath, relativePath);
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        continue;
      }
      if (!looksLikeTextFile(relativePath)) {
        continue;
      }
      const content = await fs.readFile(absolutePath, "utf8");
      result.push({ path: relativePath, content });
    } catch {
      continue;
    }
  }

  if (result.length > 0) {
    return result;
  }

  return readFallbackFiles(repoPath);
}

async function readFallbackFiles(repoPath: string): Promise<Array<{ path: string; content: string }>> {
  const candidates = [
    "package.json",
    "README.md",
    "app/page.tsx",
    "app/layout.tsx",
    "app/globals.css",
    "src/app/page.tsx",
    "src/main.tsx"
  ];
  const result: Array<{ path: string; content: string }> = [];

  for (const candidate of candidates) {
    const absolutePath = path.join(repoPath, candidate);
    try {
      const content = await fs.readFile(absolutePath, "utf8");
      result.push({ path: candidate, content });
    } catch {
      continue;
    }
  }

  return result;
}

function looksLikeTextFile(relativePath: string): boolean {
  const ext = path.extname(relativePath);
  return TEXT_FILE_EXTENSIONS.has(ext) || relativePath.endsWith(".env.example");
}

export async function applyFileChanges(repoPath: string, changes: FileChange[]): Promise<void> {
  for (const change of changes) {
    const absolutePath = path.join(repoPath, change.path);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, change.content, "utf8");
  }
}

export async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
  const entries = await fs.readdir(dirPath);
  return entries.length === 0;
}

export async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await fs.stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function detectProjectCommands(repoPath: string): Promise<CommandPlan> {
  const packageManager = (await detectPackageManager(repoPath)) ?? "npm";
  const packageJsonPath = path.join(repoPath, "package.json");

  let buildCommand: string | null = null;
  let testCommand: string | null = null;

  if (await fileExists(packageJsonPath)) {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    if (packageJson.scripts?.build) {
      buildCommand = `${packageManager} run build`;
    }

    if (packageJson.scripts?.test) {
      testCommand = `${packageManager} run test`;
    }
  }

  return {
    packageManager,
    installCommand: packageManager === "yarn" ? "yarn install" : `${packageManager} install`,
    buildCommand,
    testCommand
  };
}

async function detectPackageManager(repoPath: string): Promise<CommandPlan["packageManager"] | null> {
  if (await fileExists(path.join(repoPath, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (await fileExists(path.join(repoPath, "yarn.lock"))) {
    return "yarn";
  }
  if (await fileExists(path.join(repoPath, "bun.lockb")) || await fileExists(path.join(repoPath, "bun.lock"))) {
    return "bun";
  }
  if (await fileExists(path.join(repoPath, "package-lock.json")) || await fileExists(path.join(repoPath, "package.json"))) {
    return "npm";
  }
  return null;
}
