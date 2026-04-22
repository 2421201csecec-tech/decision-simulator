import { NextRequest, NextResponse } from "next/server";
import { getThreadById, saveClarifyDraft, type ClarifyDraft } from "@/lib/server/thread-store";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";
import { clarifyDraftSchema, errorResponse } from "@/lib/server/validation";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/clarify-draft`,
    method: "GET",
  });
  if (proxied) {
    return proxied;
  }

  const thread = await getThreadById(threadId);

  if (!thread) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ threadId: thread.id, clarifyDraft: thread.clarifyDraft ?? null });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: request.clone(),
    path: `/api/v1/threads/${threadId}/clarify-draft`,
    method: "PUT",
  });
  if (proxied) {
    return proxied;
  }

  const body = (await request.json().catch(() => null)) as ClarifyDraft | null;

  if (!body) {
    return errorResponse("Invalid payload", 400);
  }

  const parsed = clarifyDraftSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid payload", 400);
  }

  const saved = await saveClarifyDraft(threadId, {
    title: parsed.data.title,
    coreProblem: parsed.data.coreProblem,
    desiredOutcome: parsed.data.desiredOutcome,
    context: parsed.data.context,
    constraints: parsed.data.constraints,
    assumptions: parsed.data.assumptions,
  });

  if (!saved) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ threadId: saved.id, clarifyDraft: saved.clarifyDraft });
}
