/**
 * Messaging rules.
 *
 * Access here is by membership, not by permission: holding `messages.use` lets
 * you use the feature, it does not let you read a thread you are not part of.
 * Every read and write therefore checks that the caller is a member of the
 * thread, which is the same relationship-based model the parent portal uses.
 */

export interface ThreadMemberLike {
  userId: string;
  lastReadAt: Date | null;
}

export interface MessageLike {
  senderId: string;
  createdAt: Date;
}

/** Whether a user may see a thread at all. */
export function isMember(
  members: readonly ThreadMemberLike[],
  userId: string,
): boolean {
  return members.some((member) => member.userId === userId);
}

/**
 * Unread count for one participant.
 *
 * Your own messages never count as unread — marking your own reply as unread
 * to yourself is a bug users notice immediately.
 */
export function unreadCount(
  messages: readonly MessageLike[],
  member: ThreadMemberLike | undefined,
): number {
  if (!member) return 0;
  return messages.filter((message) => {
    if (message.senderId === member.userId) return false;
    if (!member.lastReadAt) return true;
    return message.createdAt.getTime() > member.lastReadAt.getTime();
  }).length;
}

/** A readable thread title from its participants, when none was set. */
export function threadTitle(
  subject: string | null,
  participants: readonly { name: string; userId: string }[],
  viewerId: string,
): string {
  if (subject && subject.trim()) return subject;

  const others = participants.filter((p) => p.userId !== viewerId);
  if (others.length === 0) return "Just you";
  if (others.length <= 3) return others.map((p) => p.name).join(", ");
  return `${others.slice(0, 2).map((p) => p.name).join(", ")} and ${others.length - 2} others`;
}

export interface Validation {
  ok: boolean;
  reason?: string;
}

export function validateMessage(body: string): Validation {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, reason: "Write something first." };
  if (trimmed.length > 5000) {
    return { ok: false, reason: "Messages are limited to 5000 characters." };
  }
  return { ok: true };
}
