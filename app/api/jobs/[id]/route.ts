import { NextRequest, NextResponse } from "next/server";
import { getJobByIdForUser, getJobEvents } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_: NextRequest, context: Context): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await getJobByIdForUser(id, session.userId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const events = await getJobEvents(id);
  return NextResponse.json({ job, events });
}
