import { NextResponse } from "next/server";
import { z } from "zod";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  threadId: z.string().min(1).optional(),
  recipientId: z.string().min(1).optional(),
  subject: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1, "Write a message").max(4000),
}).refine((v) => v.threadId || v.recipientId, { message: "Pick a conversation or a recipient" });

/**
 * POST /api/mobile/v1/messages/send — reply to a thread (threadId) or start a
 * new DIRECT conversation (recipientId). Mirrors the web startThread/sendMessage:
 * reuses an existing 1:1 thread, and parents may only message staff.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "messages.use");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { body } = parsed.data;
  const db = scopedDb(session.schoolId);
  const now = new Date();

  // Reply path.
  if (parsed.data.threadId) {
    const thread = await db.messageThread.findFirst({
      where: { id: parsed.data.threadId, members: { some: { userId: session.userId } } },
      select: { id: true },
    });
    if (!thread) return cors(NextResponse.json({ error: "Conversation not found." }, { status: 404 }));
    await db.message.create({ data: { threadId: thread.id, senderId: session.userId, body } });
    await db.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: now } });
    await db.messageThreadMember.updateMany({ where: { threadId: thread.id, userId: session.userId }, data: { lastReadAt: now } });
    return cors(NextResponse.json({ ok: true, message: "Reply sent." }));
  }

  // Start path.
  const recipientId = parsed.data.recipientId!;
  if (recipientId === session.userId) {
    return cors(NextResponse.json({ error: "You can't message yourself." }, { status: 400 }));
  }
  const recipient = await db.user.findUnique({
    where: { id: recipientId },
    select: { id: true, firstName: true, status: true, staff: { select: { id: true } } },
  });
  if (!recipient || recipient.status !== "ACTIVE") {
    return cors(NextResponse.json({ error: "That person can't be messaged." }, { status: 404 }));
  }
  if (!session.staffId && !recipient.staff) {
    return cors(NextResponse.json({ error: "You can only start a conversation with a staff member." }, { status: 403 }));
  }

  // Reuse an existing 1:1 thread if one exists.
  const mine = await db.messageThread.findMany({
    where: { kind: "DIRECT", members: { some: { userId: session.userId } } },
    select: { id: true, members: { select: { userId: true } } },
  });
  const existing = mine.find((t) => t.members.length === 2 && t.members.some((m) => m.userId === recipientId));

  if (existing) {
    await db.message.create({ data: { threadId: existing.id, senderId: session.userId, body } });
    await db.messageThread.update({ where: { id: existing.id }, data: { lastMessageAt: now } });
    return cors(NextResponse.json({ ok: true, threadId: existing.id, message: `Message sent to ${recipient.firstName}.` }));
  }

  const thread = await db.messageThread.create({
    data: {
      schoolId: session.schoolId,
      subject: parsed.data.subject || null,
      kind: "DIRECT",
      lastMessageAt: now,
      members: { create: [{ userId: session.userId, lastReadAt: now }, { userId: recipientId }] },
      messages: { create: [{ senderId: session.userId, body }] },
    },
    select: { id: true },
  });
  return cors(NextResponse.json({ ok: true, threadId: thread.id, message: `Message sent to ${recipient.firstName}.` }));
}
