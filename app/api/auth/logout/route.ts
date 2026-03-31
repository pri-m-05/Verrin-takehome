import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";
import { env } from "@/lib/env";

export async function GET(): Promise<NextResponse> {
  await clearSession();
  return NextResponse.redirect(env.appUrl);
}
