import { NextRequest, NextResponse } from "next/server";
import { exchangeGithubCode, getAuthenticatedGithubUser } from "@/lib/github";
import { upsertGithubUser } from "@/lib/db";
import { consumeOauthState, createSession } from "@/lib/session";
import { env } from "@/lib/env";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = await consumeOauthState();

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${env.appUrl}/?authError=state`);
  }

  try {
    const accessToken = await exchangeGithubCode(code);
    const githubUser = await getAuthenticatedGithubUser(accessToken);
    const user = await upsertGithubUser(githubUser, accessToken);

    await createSession({
      userId: user.id,
      githubLogin: user.github_login
    });

    return NextResponse.redirect(env.appUrl);
  } catch {
    return NextResponse.redirect(`${env.appUrl}/?authError=oauth`);
  }
}
