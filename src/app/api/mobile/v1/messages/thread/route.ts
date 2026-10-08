import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/messages/thread?threadId= — the messages in one thread. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "messages.use");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const threadId = new URL(req.url).searchParams.get("threadId");
  if (!threadId) return cors(NextResponse.json({ error: "threadId is required" }, { status: 400 }));

  const db = scopedDb(session.schoolId);
  const thread = await db.messageThread.findFirst({
    where: { id: threadId, members: { some: { userId: session.userId } } },
    select: {
      id: true,
      subject: true,
      members: { select: { userId: true, user: { select: { firstName: true, lastName: true } } } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true, body: true, senderId: true, createdAt: true },
      },
    },
  });
  if (!thread) return cors(NextResponse.json({ error: "Conversation not found." }, { status: 404 }));

  // Opening a thread marks it read.
  await db.messageThreadMember.updateMany({
    where: { threadId, userId: session.userId },
    data: { lastReadAt: new Date() },
  });

  const other = thread.members.find((m) => m.userId !== session.userId)?.user;
  return cors(NextResponse.json({
    id: thread.id,
    subject: thread.subject,
    name: other ? `${other.firstName} ${other.lastName ?? ""}`.trim() : "Conversation",
    messages: thread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderId === session.userId,
      at: m.createdAt.toISOString(),
    })),
  }));
}
