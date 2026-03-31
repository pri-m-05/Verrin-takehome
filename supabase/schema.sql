create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  github_user_id text not null unique,
  github_login text not null,
  github_name text,
  github_avatar_url text,
  github_access_token_encrypted text not null,
  vercel_token_encrypted text,
  vercel_team_target text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  brief text not null,
  repo_full_name text,
  repo_url text,
  repo_strategy text,
  repo_description text,
  base_branch text not null default 'main',
  branch_name text,
  status text not null default 'queued',
  current_stage text not null default 'queued',
  result_summary text,
  pr_url text,
  preview_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  stage text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_jobs_user_created_at on jobs(user_id, created_at desc);
create index if not exists idx_jobs_status_created_at on jobs(status, created_at);
create index if not exists idx_job_events_job_id_created_at on job_events(job_id, created_at);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on users;
drop trigger if exists trg_jobs_updated_at on jobs;

create trigger trg_users_updated_at
before update on users
for each row
execute function set_updated_at();

create trigger trg_jobs_updated_at
before update on jobs
for each row
execute function set_updated_at();
