import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { decrypt, encrypt } from "./crypto";
import type { GitHubProfile, JobEventRecord, JobRecord, UserRecord } from "./types";

const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function assertNoError(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertGithubUser(profile: GitHubProfile, accessToken: string): Promise<UserRecord> {
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        github_user_id: String(profile.id),
        github_login: profile.login,
        github_name: profile.name,
        github_avatar_url: profile.avatar_url,
        github_access_token_encrypted: encrypt(accessToken)
      },
      { onConflict: "github_user_id" }
    )
    .select("*")
    .single();

  assertNoError(error);
  return data as UserRecord;
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  assertNoError(error);
  return (data as UserRecord | null) ?? null;
}

export async function getGithubAccessTokenForUser(userId: string): Promise<string> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User was not found.");
  }
  return decrypt(user.github_access_token_encrypted);
}

export async function getVercelSettingsForUser(userId: string): Promise<{ token: string; teamTarget: string }> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User was not found.");
  }

  const token = user.vercel_token_encrypted ? decrypt(user.vercel_token_encrypted) : env.vercelToken;
  const teamTarget = user.vercel_team_target ?? env.vercelTeamId;

  return {
    token,
    teamTarget
  };
}

export async function saveVercelSettingsForUser(
  userId: string,
  token: string,
  teamTarget: string | null
): Promise<UserRecord> {
  const { data, error } = await supabase
    .from("users")
    .update({
      vercel_token_encrypted: encrypt(token.trim()),
      vercel_team_target: teamTarget?.trim() ? teamTarget.trim() : null
    })
    .eq("id", userId)
    .select("*")
    .single();

  assertNoError(error);
  return data as UserRecord;
}

export async function clearVercelSettingsForUser(userId: string): Promise<UserRecord> {
  const { data, error } = await supabase
    .from("users")
    .update({
      vercel_token_encrypted: null,
      vercel_team_target: null
    })
    .eq("id", userId)
    .select("*")
    .single();

  assertNoError(error);
  return data as UserRecord;
}

export async function listJobsByUser(userId: string): Promise<JobRecord[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  assertNoError(error);
  return (data ?? []) as JobRecord[];
}

export async function createJob(userId: string, brief: string): Promise<JobRecord> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      brief,
      status: "queued",
      current_stage: "queued"
    })
    .select("*")
    .single();

  assertNoError(error);
  await appendJobEvent(data.id, "queued", "Job created and queued.");
  return data as JobRecord;
}

export async function getJobByIdForUser(jobId: string, userId: string): Promise<JobRecord | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  assertNoError(error);
  return (data as JobRecord | null) ?? null;
}

export async function getJobEvents(jobId: string): Promise<JobEventRecord[]> {
  const { data, error } = await supabase
    .from("job_events")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  assertNoError(error);
  return (data ?? []) as JobEventRecord[];
}

export async function appendJobEvent(
  jobId: string,
  stage: string,
  message: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabase.from("job_events").insert({
    job_id: jobId,
    stage,
    message,
    metadata
  });

  assertNoError(error);
}

export async function updateJob(
  jobId: string,
  partial: Partial<JobRecord> & Record<string, unknown>
): Promise<JobRecord> {
  const { data, error } = await supabase
    .from("jobs")
    .update(partial)
    .eq("id", jobId)
    .select("*")
    .single();

  assertNoError(error);
  return data as JobRecord;
}

export async function claimNextQueuedJob(): Promise<JobRecord | null> {
  const { data: queuedJob, error: selectError } = await supabase
    .from("jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  assertNoError(selectError);

  if (!queuedJob) {
    return null;
  }

  const { data: claimedJob, error: updateError } = await supabase
    .from("jobs")
    .update({
      status: "running",
      current_stage: "claimed"
    })
    .eq("id", queuedJob.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  assertNoError(updateError);
  return (claimedJob as JobRecord | null) ?? null;
}
