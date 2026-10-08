import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/messages/threads — the signed-in user's conversations. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "messages.use");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const threads = await db.messageThread.findMany({
    where: { members: { some: { userId: session.userId } } },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      subject: true,
      lastMessageAt: true,
      members: {
        select: {
          userId: true,
          lastReadAt: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
    },
  });

  return cors(NextResponse.json({
    items: threads.map((t) => {
      const me = t.members.find((m) => m.userId === session.userId);
      const other = t.members.find((m) => m.userId !== session.userId)?.user;
      const unread = me?.lastReadAt == null || me.lastReadAt < t.lastMessageAt;
      return {
        id: t.id,
        subject: t.subject,
        name: other ? `${other.firstName} ${other.lastName ?? ""}`.trim() : "Conversation",
        preview: t.messages[0]?.body ?? "",
        lastMessageAt: t.lastMessageAt.toISOString(),
        unread,
      };
    }),
  }));
}
