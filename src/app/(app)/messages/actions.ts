"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { validateMessage } from "@/lib/messaging";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

const StartSchema = z.object({
  recipientId: z.string().min(1, "Choose who to message"),
  subject: z.string().trim().max(120).optional(),
  body: z.string().min(1, "Write a message"),
});

/**
 * Starts a new direct conversation, or reuses the existing one between the two
 * people. Recipient scoping is enforced on the server: a portal user (student
 * or guardian) may only open a thread with a staff member, never with another
 * family. Staff may message anyone in their school.
 */
export async function startThread(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = StartSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const check = validateMessage(parsed.data.body);
  if (!check.ok) return { ok: false, message: check.reason ?? "Invalid message", values: raw };

  const session = await requirePermission("messages.use");
  const db = scopedDb(session.schoolId);
  const { recipientId, subject, body } = parsed.data;

  if (recipientId === session.userId) {
    return { ok: false, message: "You cannot message yourself.", values: raw };
  }

  const recipient = await db.user.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      status: true,
      firstName: true,
      lastName: true,
      staff: { select: { id: true } },
    },
  });
  if (!recipient || recipient.status !== "ACTIVE") {
    return { ok: false, message: "That person is not an active user in your school.", values: raw };
  }

  // A portal user (no staff record) may only reach staff.
  const senderIsStaff = Boolean(session.staffId);
  if (!senderIsStaff && !recipient.staff) {
    return { ok: false, message: "You can only start a conversation with a staff member.", values: raw };
  }

  // Reuse an existing direct thread between exactly these two people.
  const mine = await db.messageThread.findMany({
    where: { kind: "DIRECT", members: { some: { userId: session.userId } } },
    select: { id: true, members: { select: { userId: true } } },
  });
  const existing = mine.find(
    (thread) =>
      thread.members.length === 2 &&
      thread.members.some((member) => member.userId === recipientId),
  );

  const now = new Date();

  if (existing) {
    // tenant-safe: `existing` came from a query requiring the caller to be a
    // member of the thread, and threads carry schoolId, so it is in this school.
    await db.message.create({
      data: { threadId: existing.id, senderId: session.userId, body: body.trim() },
    });
    await db.messageThread.update({ where: { id: existing.id }, data: { lastMessageAt: now } });
    revalidatePath("/messages");
    return { ok: true, message: `Message sent to ${recipient.firstName}.` };
  }

  // tenant-safe: scopedDb injects schoolId on the thread create; the recipient
  // was resolved through the scoped client, so both members are in this school.
  await db.messageThread.create({
    data: {
      schoolId: session.schoolId,
      kind: "DIRECT",
      subject: subject || null,
      lastMessageAt: now,
      members: {
        create: [
          { userId: session.userId, lastReadAt: now },
          { userId: recipientId },
        ],
      },
      messages: {
        create: [{ senderId: session.userId, body: body.trim() }],
      },
    },
  });

  revalidatePath("/messages");
  return {
    ok: true,
    message: `Conversation with ${recipient.firstName} ${recipient.lastName ?? ""} started.`.trim(),
  };
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
