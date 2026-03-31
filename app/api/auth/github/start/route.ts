import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildGithubAuthorizeUrl } from "@/lib/github";
import { setOauthState } from "@/lib/session";

export async function GET(): Promise<NextResponse> {
  const state = crypto.randomBytes(16).toString("hex");
  await setOauthState(state);
  return NextResponse.redirect(buildGithubAuthorizeUrl(state));
}
