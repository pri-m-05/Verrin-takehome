import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getUserById } from "@/lib/db";
import { env } from "@/lib/env";

export async function GET(): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  const user = await getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      githubLogin: user.github_login,
      githubName: user.github_name,
      githubAvatarUrl: user.github_avatar_url,
      vercelConnected: Boolean(user.vercel_token_encrypted || env.vercelToken),
      vercelTeamTarget: user.vercel_team_target ?? env.vercelTeamId ?? null
    }
  });
}
