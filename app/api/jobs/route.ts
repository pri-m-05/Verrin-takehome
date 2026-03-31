import { NextRequest, NextResponse } from "next/server";
import { createJob, listJobsByUser } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await listJobsByUser(session.userId);
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { brief?: string };
  const brief = body.brief?.trim();

  if (!brief) {
    return NextResponse.json({ error: "A brief is required." }, { status: 400 });
  }

  const job = await createJob(session.userId, brief);
  return NextResponse.json({ job });
}
