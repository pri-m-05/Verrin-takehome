function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  appUrl: getEnv("APP_URL", "http://localhost:3000"),
  sessionSecret: getEnv("SESSION_SECRET"),
  appEncryptionSecret: getEnv("APP_ENCRYPTION_SECRET"),
  openAiApiKey: getEnv("OPENAI_API_KEY"),
  openAiModel: getEnv("OPENAI_MODEL", "gpt-5.4-mini"),
  githubClientId: getEnv("GITHUB_CLIENT_ID"),
  githubClientSecret: getEnv("GITHUB_CLIENT_SECRET"),
  githubRedirectUri: getEnv("GITHUB_REDIRECT_URI"),
  supabaseUrl: getEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  vercelToken: process.env.VERCEL_TOKEN ?? "",
  vercelTeamId: process.env.VERCEL_TEAM_ID ?? "",
  gitAuthorName: getEnv("GIT_AUTHOR_NAME", "Verrin Autonomous Agent"),
  gitAuthorEmail: getEnv("GIT_AUTHOR_EMAIL", "agent@example.com")
};
