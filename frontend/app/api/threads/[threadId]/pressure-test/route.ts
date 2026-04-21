import { NextRequest, NextResponse } from "next/server";
import { generatePressureTest, getPressureTest } from "@/lib/server/thread-store";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const pressureTest = await getPressureTest(threadId);

  if (!pressureTest) {
    return NextResponse.json({ message: "Pressure test not found" }, { status: 404 });
  }

  return NextResponse.json({ pressureTest });
}

export async function POST(_: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const thread = await generatePressureTest(threadId);

  if (!thread) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ pressureTest: thread.pressureTest });
}
