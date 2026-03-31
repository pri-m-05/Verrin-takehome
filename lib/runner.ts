import { spawn } from "node:child_process";

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  combined: string;
}

export async function runCommand(
  command: string,
  cwd: string,
  timeoutMs = 1000 * 60 * 10
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");

      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 2000);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode: number | null) => {
      clearTimeout(timer);
      const result: CommandResult = {
        command,
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
        combined: [stdout, stderr].filter(Boolean).join("\n")
      };

      if (timedOut) {
        reject(new Error(`Command timed out: ${command}\n${result.combined}`));
        return;
      }

      if ((exitCode ?? 1) !== 0) {
        reject(new Error(`Command failed: ${command}\n${result.combined}`));
        return;
      }

      resolve(result);
    });
  });
}