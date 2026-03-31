import { NextRequest, NextResponse } from "next/server";
import { clearVercelSettingsForUser, getUserById, saveVercelSettingsForUser } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { env } from "@/lib/env";

export async function GET(): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    connected: Boolean(user.vercel_token_encrypted || env.vercelToken),
    teamTarget: user.vercel_team_target ?? env.vercelTeamId ?? ""
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { token?: string; teamTarget?: string };
  const token = body.token?.trim();

  if (!token) {
    return NextResponse.json({ error: "A Vercel token is required." }, { status: 400 });
  }

  const user = await saveVercelSettingsForUser(session.userId, token, body.teamTarget ?? null);

  return NextResponse.json({
    connected: true,
    teamTarget: user.vercel_team_target ?? ""
  });
}

export async function DELETE(): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await clearVercelSettingsForUser(session.userId);
  return NextResponse.json({ connected: false, teamTarget: "" });
}
