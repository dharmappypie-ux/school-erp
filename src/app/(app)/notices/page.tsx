import { NoticeActions, NoticeForm } from "@/app/(app)/notices/notice-form";
import { DrawerForm } from "@/components/drawer-form";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { requireAnyPermission } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Notices" };

export default async function NoticesPage() {
  const session = await requireAnyPermission(["notices.read", "notices.manage"]);
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;
  const canManage = hasPermission(session.permissions, "notices.manage");
  const now = new Date();

  const [notices, sections] = await Promise.all([
    db.notice.findMany({
      // Readers only ever see published notices; editors see drafts too.
      where: canManage ? {} : { publishedAt: { not: null } },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        author: { select: { firstName: true, lastName: true } },
        section: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
      },
    }),
    canManage && yearId
      ? db.section.findMany({
          where: { academicYearId: yearId },
          orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
          select: { id: true, name: true, classLevel: { select: { name: true } } },
        })
      : [],
  ]);

  const published = notices.filter((notice) => notice.publishedAt !== null);
  const drafts = notices.filter((notice) => notice.publishedAt === null);
  const expired = published.filter(
    (notice) => notice.expiresAt !== null && notice.expiresAt < now,
  );
  const pinned = published.filter((notice) => notice.isPinned);

  return (
    <>
      <PageHeader
        title="Notices"
        description={
          canManage
            ? "Publish announcements to parents, students and staff."
            : "Announcements from the school."
        }
        action={
          canManage ? (
            <DrawerForm
              trigger="New notice"
              title="New notice"
              description="Publish immediately or save as a draft"
              width="w-[32rem]"
            >
              <NoticeForm
                bare
                sections={sections.map((section) => ({
                  id: section.id,
                  label: `${section.classLevel.name} ${section.name}`,
                }))}
              />
            </DrawerForm>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Published" value={String(published.length)} tone="success" />
        <StatTile
          label="Pinned"
          value={String(pinned.length)}
          sublabel="shown first"
          tone={pinned.length > 0 ? "brand" : "neutral"}
        />
        {canManage ? (
          <StatTile
            label="Drafts"
            value={String(drafts.length)}
            sublabel={drafts.length > 0 ? "not visible to anyone" : "none waiting"}
            tone={drafts.length > 0 ? "warning" : "neutral"}
          />
        ) : (
          <StatTile label="This year" value={String(published.length)} />
        )}
        <StatTile
          label="Expired"
          value={String(expired.length)}
          sublabel={expired.length > 0 ? "past their end date" : "none"}
          tone={expired.length > 0 ? "neutral" : "success"}
        />
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="Notice board"
            description={
              canManage
                ? "Drafts are visible here only, never to the audience"
                : undefined
            }
          />
          {notices.length === 0 ? (
            <EmptyState
              title="No notices yet"
              description={
                canManage
                  ? "Publish one with “New notice” at the top right."
                  : "Nothing has been announced."
              }
            />
            ) : (
              <ul className="divide-y divide-border">
                {notices.map((notice) => {
                  const isExpired =
                    notice.expiresAt !== null && notice.expiresAt < now;
                  return (
                    <li key={notice.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{notice.title}</p>
                            {notice.isPinned ? <Badge tone="brand">Pinned</Badge> : null}
                            {notice.publishedAt === null ? (
                              <Badge tone="warning">Draft</Badge>
                            ) : null}
                            {isExpired ? <Badge tone="neutral">Expired</Badge> : null}
                          </div>

                          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-strong">
                            {notice.body}
                          </p>

                          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                            <span>
                              {notice.publishedAt
                                ? formatDateTime(notice.publishedAt)
                                : `drafted ${formatDate(notice.createdAt)}`}
                            </span>
                            <span>·</span>
                            <span>{notice.audience.join(", ").toLowerCase()}</span>
                            {notice.section ? (
                              <>
                                <span>·</span>
                                <span>
                                  {notice.section.classLevel.name} {notice.section.name}
                                </span>
                              </>
                            ) : null}
                            {notice.author ? (
                              <>
                                <span>·</span>
                                <span>
                                  {notice.author.firstName} {notice.author.lastName ?? ""}
                                </span>
                              </>
                            ) : null}
                            {notice.expiresAt ? (
                              <>
                                <span>·</span>
                                <span>expires {formatDate(notice.expiresAt)}</span>
                              </>
                            ) : null}
                          </p>
                        </div>

                        {canManage ? (
                          <NoticeActions
                            noticeId={notice.id}
                            isPublished={notice.publishedAt !== null}
                            isPinned={notice.isPinned}
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
        </Card>
      </div>
    </>
  );
}
