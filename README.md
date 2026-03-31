# Verrin Autonomous Agent — complete build challenge version

This version is designed around the actual Verrin challenge bar:

- one brief from the user
- no repo URL required in the main flow
- GitHub OAuth sign-in
- automatic repo selection or creation
- autonomous implementation loop with repair attempts
- push to GitHub
- PR for existing repos or direct main push for greenfield repos
- live preview deployment to Vercel
- production-style frontend with a clear execution timeline

## What this product automates

Once an operator has configured the environment variables, the end user flow is:

1. Connect GitHub
2. Paste one software brief
3. Click launch
4. Watch the run
5. A preview URL opens automatically when ready

## Operator setup

You still need real credentials for GitHub OAuth, Supabase, OpenAI, and Vercel. Those cannot be minted from inside this codebase.

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

Copy `.env.example` to `.env` and fill it in.

### 3. Create the Supabase schema

Run `supabase/schema.sql` in the Supabase SQL editor.

### 4. Start the app and worker

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run worker
```

### 5. Configure GitHub OAuth

Create a GitHub OAuth App and use:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/github/callback`

Recommended scopes: `repo read:user user:email`

### 6. Configure Vercel token

Set `VERCEL_TOKEN` so the agent can create preview deployments automatically.

## Product behavior

### Existing repo flow

- repo candidates are fetched from the authenticated GitHub account
- the model chooses the best repo or decides to create a new one
- a feature branch is created
- code is written, validated, pushed, and a PR is opened
- a preview deployment is created from the generated workspace

### Greenfield flow

- a new repository is created automatically
- the agent scaffolds a deployable Next.js product
- it customizes the codebase to the brief
- it commits directly to `main`
- it deploys a live preview to Vercel

## Main files

- `app/` UI and API routes
- `components/` dashboard and run views
- `lib/` auth, GitHub, OpenAI, worker, repo, and deployment logic
- `scripts/worker.ts` polling worker
- `supabase/schema.sql` persistence

## Notes

- The product is intentionally operator-configured but end-user zero-touch after launch.
- GitHub OAuth is used so the user never has to paste a personal access token into the UI.
- Vercel deployment is handled automatically through the CLI with a configured token.
