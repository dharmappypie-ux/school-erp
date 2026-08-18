"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { validateMessage } from "@/lib/messaging";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const SendSchema = z.object({
  threadId: z.string().min(1),
  body: z.string().min(1),
});

/**
 * Posts a message to a thread the caller belongs to.
 *
 * Membership is checked on the server every time. `messages.use` grants access
 * to the feature, never to a particular conversation — a thread id guessed or
 * copied from elsewhere must not be writable.
 */
export async function sendMessage(
  input: z.infer<typeof SendSchema>,
): Promise<ActionResult> {
  const parsed = SendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input" };

  const check = validateMessage(parsed.data.body);
  if (!check.ok) return { ok: false, message: check.reason ?? "Invalid message" };

  const session = await requirePermission("messages.use");
  const db = scopedDb(session.schoolId);

  const thread = await db.messageThread.findFirst({
    where: {
      id: parsed.data.threadId,
      // Membership is part of the query, not a check afterwards, so there is no
      // path that reads the thread before deciding whether it may be read.
      members: { some: { userId: session.userId } },
    },
    select: { id: true },
  });
  if (!thread) return { ok: false, message: "That conversation is not yours." };

  // tenant-safe: `thread` came from a query requiring the caller to be a
  // member, and threads carry schoolId, so the thread is in this school.
  await db.message.create({
    data: {
      threadId: thread.id,
      senderId: session.userId,
      body: parsed.data.body.trim(),
    },
  });

  await db.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // Posting also marks the thread read for the sender.
  // tenant-safe: scoped by the thread membership resolved above.
  await db.messageThreadMember.updateMany({
    where: { threadId: thread.id, userId: session.userId },
    data: { lastReadAt: new Date() },
  });

  revalidatePath("/messages");
  return { ok: true, message: "Sent." };
}

export async function markRead(threadId: string): Promise<ActionResult> {
  const session = await requirePermission("messages.use");
  const db = scopedDb(session.schoolId);

  const thread = await db.messageThread.findFirst({
    where: { id: threadId, members: { some: { userId: session.userId } } },
    select: { id: true },
  });
  if (!thread) return { ok: false, message: "That conversation is not yours." };

  // tenant-safe: membership verified immediately above.
  await db.messageThreadMember.updateMany({
    where: { threadId: thread.id, userId: session.userId },
    data: { lastReadAt: new Date() },
  });

  revalidatePath("/messages");
  return { ok: true, message: "Marked read." };
}
