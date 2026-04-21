import { NextRequest, NextResponse } from "next/server";
import { createThread, getGroupedThreads, type ThreadStatus } from "@/lib/server/thread-store";
import { createThreadSchema, errorResponse } from "@/lib/server/validation";

export async function GET(request: NextRequest) {
  const grouped = request.nextUrl.searchParams.get("grouped") === "true";

  if (grouped) {
    const data = await getGroupedThreads();
    return NextResponse.json(data);
  }

  const data = await getGroupedThreads();
  const all = [...data.active, ...data.revisions, ...data.failureAnalysis, ...data.history];
  return NextResponse.json({ threads: all });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.json().catch(() => null);
  if (!rawBody) {
    return errorResponse("Invalid payload", 400);
  }

  const parsed = createThreadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid payload", 400);
  }

  const body = parsed.data;
  const status = (body.status as ThreadStatus | undefined) ?? undefined;

  const thread = await createThread({
    title: body.title,
    parentThreadId: body.parentThreadId,
    status,
  });

  return NextResponse.json(thread, { status: 201 });
}
