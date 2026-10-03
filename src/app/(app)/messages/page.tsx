import Link from "next/link";

import { Composer } from "@/app/(app)/messages/composer";
import { NewMessage } from "@/app/(app)/messages/new-thread";
import { Avatar } from "@/components/avatar";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  cn,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDateTime, relativeDays } from "@/lib/format";
import { threadTitle, unreadCount } from "@/lib/messaging";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const session = await requirePermission("messages.use");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const openId = typeof params.thread === "string" ? params.thread : "";

  // Only threads the caller belongs to are ever fetched.
  const threads = await db.messageThread.findMany({
    where: { members: { some: { userId: session.userId } } },
    orderBy: { lastMessageAt: "desc" },
    take: 40,
    select: {
      id: true,
      subject: true,
      kind: true,
      lastMessageAt: true,
      members: {
        select: {
          userId: true,
          lastReadAt: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, senderId: true, createdAt: true, body: true },
      },
    },
  });

  const summaries = threads.map((thread) => {
    const me = thread.members.find((m) => m.userId === session.userId);
    return {
      id: thread.id,
      title: threadTitle(
        thread.subject,
        thread.members.map((m) => ({
          userId: m.userId,
          name: `${m.user.firstName} ${m.user.lastName ?? ""}`.trim(),
        })),
        session.userId,
      ),
      kind: thread.kind,
      lastMessageAt: thread.lastMessageAt,
      unread: unreadCount(thread.messages, me),
      preview: thread.messages.at(-1)?.body ?? "",
      messageCount: thread.messages.length,
    };
  });

  const active = openId
    ? threads.find((thread) => thread.id === openId)
    : threads[0];

  const totalUnread = summaries.reduce((sum, s) => sum + s.unread, 0);

  // Who this person may start a conversation with. Everyone can reach staff;
  // staff can additionally reach guardians (parents). The server re-checks this
  // on send, so the list is a convenience, not the security boundary.
  const senderIsStaff = Boolean(session.staffId);
  const [staffContacts, guardianContacts] = await Promise.all([
    db.staffMember.findMany({
      where: { employmentStatus: "ACTIVE", deletedAt: null, userId: { not: null } },
      orderBy: { firstName: "asc" },
      select: { userId: true, firstName: true, lastName: true, employeeId: true },
    }),
    senderIsStaff
      ? db.guardian.findMany({
          where: { userId: { not: null } },
          orderBy: { firstName: "asc" },
          take: 500,
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            students: {
              take: 1,
              select: { student: { select: { firstName: true, admissionNo: true } } },
            },
          },
        })
      : [],
  ]);

  const recipients = [
    ...staffContacts
      .filter((staff) => staff.userId && staff.userId !== session.userId)
      .map((staff) => ({
        value: staff.userId!,
        label: `${staff.firstName} ${staff.lastName ?? ""} · staff`.trim(),
      })),
    ...guardianContacts
      .filter((guardian) => guardian.userId && guardian.userId !== session.userId)
      .map((guardian) => {
        const child = guardian.students[0]?.student;
        return {
          value: guardian.userId!,
          label: `${guardian.firstName} ${guardian.lastName ?? ""}${
            child ? ` · parent of ${child.firstName} (${child.admissionNo})` : " · guardian"
          }`.trim(),
        };
      }),
  ];

  const nameFor = (userId: string) => {
    const member = active?.members.find((m) => m.userId === userId);
    return member ? `${member.user.firstName} ${member.user.lastName ?? ""}`.trim() : "Unknown";
  };

  return (
    <>
      <PageHeader
        title="Messages"
        description="Conversations you are part of"
        action={recipients.length > 0 ? <NewMessage recipients={recipients} /> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Conversations" value={String(summaries.length)} />
        <StatTile
          label="Unread"
          value={String(totalUnread)}
          tone={totalUnread > 0 ? "warning" : "success"}
        />
        <StatTile
          label="Messages"
          value={String(summaries.reduce((sum, s) => sum + s.messageCount, 0))}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title="Conversations" description="Most recent first" />
          {summaries.length === 0 ? (
            <EmptyState
              title="No conversations"
              description="Start one with “New message”, or wait to be added to a thread."
            />
          ) : (
            <ul className="divide-y divide-border">
              {summaries.map((thread) => (
                <li key={thread.id}>
                  <Link
                    href={`/messages?thread=${thread.id}`}
                    className={cn(
                      "block px-5 py-3 transition-colors hover:bg-surface-hover",
                      active?.id === thread.id ? "bg-surface-hover" : "",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{thread.title}</span>
                      {thread.unread > 0 ? (
                        <Badge tone="brand">{thread.unread}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {thread.preview || "No messages yet"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {relativeDays(thread.lastMessageAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          {!active ? (
            <EmptyState title="Nothing selected" description="Choose a conversation." />
          ) : (
            <>
              <CardHeader
                title={threadTitle(
                  active.subject,
                  active.members.map((m) => ({
                    userId: m.userId,
                    name: `${m.user.firstName} ${m.user.lastName ?? ""}`.trim(),
                  })),
                  session.userId,
                )}
                description={`${active.members.length} participants`}
              />

              <div className="max-h-[28rem] space-y-3 overflow-y-auto px-5 py-4">
                {active.messages.length === 0 ? (
                  <p className="text-sm text-muted">No messages yet — start the conversation.</p>
                ) : (
                  active.messages.map((message) => {
                    const mine = message.senderId === session.userId;
                    return (
                      <div
                        key={message.id}
                        className={cn("flex gap-2.5", mine ? "flex-row-reverse" : "")}
                      >
                        <Avatar
                          firstName={nameFor(message.senderId).split(" ")[0] ?? "?"}
                          lastName={nameFor(message.senderId).split(" ")[1] ?? ""}
                          size="sm"
                        />
                        <div className={cn("max-w-[75%]", mine ? "text-right" : "")}>
                          <p className="text-[11px] text-muted">
                            {mine ? "You" : nameFor(message.senderId)} ·{" "}
                            {formatDateTime(message.createdAt)}
                          </p>
                          <p
                            className={cn(
                              "mt-1 inline-block whitespace-pre-wrap rounded-[var(--radius-base)] px-3 py-2 text-sm",
                              mine
                                ? "bg-brand-soft text-brand"
                                : "bg-surface-subtle text-muted-strong",
                            )}
                          >
                            {message.body}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <Composer threadId={active.id} />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
