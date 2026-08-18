import Link from "next/link";

import { ChildSwitcher } from "@/app/(app)/portal/child-switcher";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
  type Tone,
} from "@/components/ui";
import {
  formatDate,
  formatMoney,
  formatPercent,
  relativeDays,
  toNumber,
} from "@/lib/format";
import { getPortalContext, resolvePortalStudent } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "My school" };

export default async function PortalPage({ searchParams }: PageProps<"/portal">) {
  const params = await searchParams;

  // A portal account with no linked student would otherwise loop through
  // resolvePortalStudent's redirect, so handle that case first.
  const preliminary = await getPortalContext();
  if (preliminary.children.length === 0) {
    return (
      <>
        <PageHeader title="My school" />
        <Alert tone="warning" title="No student linked to this account">
          Your login is not yet connected to a student record. Please contact
          the school office at {preliminary.session.school.name} so they can
          link it.
        </Alert>
      </>
    );
  }

  const { context, child } = await resolvePortalStudent(params.child);
  const session = context.session;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;
  const currency = session.school.currency;

  const isParent = child.relationship !== "self";

  const [
    attendanceGroups,
    invoiceTotals,
    latestCard,
    homework,
    notices,
    transport,
  ] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId: child.id, ...(yearId ? { academicYearId: yearId } : {}) },
      _count: { _all: true },
    }),
    db.invoice.aggregate({
      where: { studentId: child.id, ...(yearId ? { academicYearId: yearId } : {}) },
      _sum: { total: true, amountPaid: true, amountDue: true },
    }),
    // Only published report cards are ever visible to a family — a draft the
    // school is still working on must not leak.
    db.reportCard.findFirst({
      where: { studentId: child.id, isPublished: true },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        percentage: true,
        grade: true,
        rank: true,
        result: true,
        publishedAt: true,
        term: { select: { name: true } },
      },
    }),
    // tenant-safe: child.id is verified by resolvePortalStudent before this runs.
    db.homeworkSubmission.findMany({
      where: {
        studentId: child.id,
        homework: { dueOn: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      },
      orderBy: { homework: { dueOn: "asc" } },
      take: 5,
      select: {
        id: true,
        status: true,
        homework: {
          select: {
            id: true,
            title: true,
            dueOn: true,
            subject: { select: { name: true } },
          },
        },
      },
    }),
    db.notice.findMany({
      where: {
        publishedAt: { not: null },
        OR: [
          { audience: { hasSome: isParent ? ["ALL", "PARENTS"] : ["ALL", "STUDENTS"] } },
          { section: { enrollments: { some: { studentId: child.id } } } },
        ],
      },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
      select: { id: true, title: true, body: true, publishedAt: true, isPinned: true },
    }),
    db.transportAssignment.findFirst({
      where: { studentId: child.id, isActive: true },
      select: {
        direction: true,
        route: { select: { name: true } },
        stop: { select: { name: true, pickupTime: true, dropTime: true } },
      },
    }),
  ]);

  const attendanceTotal = attendanceGroups.reduce((sum, row) => sum + row._count._all, 0);
  const attendancePresent = attendanceGroups
    .filter((row) => row.status === "PRESENT" || row.status === "LATE")
    .reduce((sum, row) => sum + row._count._all, 0);
  const attendanceRate =
    attendanceTotal > 0 ? (attendancePresent / attendanceTotal) * 100 : null;

  const outstanding = toNumber(invoiceTotals._sum.amountDue);
  const billed = toNumber(invoiceTotals._sum.total);
  const paid = toNumber(invoiceTotals._sum.amountPaid);

  const pendingHomework = homework.filter(
    (item) => item.status === "ASSIGNED" || item.status === "MISSING",
  ).length;

  const resultTone: Tone =
    latestCard?.result === "PASS" ? "success"
    : latestCard?.result === "FAIL" ? "danger"
    : "neutral";

  return (
    <>
      <PageHeader
        title={isParent ? `${child.firstName}'s school` : "My school"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{child.admissionNo}</span>
            {child.className ? (
              <>
                <span>·</span>
                <span>{child.className}</span>
              </>
            ) : null}
            {child.rollNumber ? (
              <>
                <span>·</span>
                <span>Roll {child.rollNumber}</span>
              </>
            ) : null}
          </span>
        }
      />

      <ChildSwitcher students={context.children} selectedId={child.id} />

      {attendanceRate !== null && attendanceRate < 75 ? (
        <div className="mb-4">
          <Alert tone="warning" title="Attendance is below 75%">
            {isParent ? `${child.firstName} has` : "You have"} attended{" "}
            {formatPercent(attendanceRate, 1)} of recorded sessions this year.
            Many boards require 75% to sit examinations.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Attendance"
          value={attendanceRate === null ? "—" : formatPercent(attendanceRate, 1)}
          sublabel={`${attendancePresent} of ${attendanceTotal} sessions`}
          tone={
            attendanceRate === null ? "neutral"
            : attendanceRate >= 90 ? "success"
            : attendanceRate >= 75 ? "warning"
            : "danger"
          }
          href={`/portal/attendance?child=${child.id}`}
        />
        <StatTile
          label="Fees due"
          value={formatMoney(outstanding, currency)}
          sublabel={outstanding > 0 ? "payment pending" : "all settled"}
          tone={outstanding > 0 ? "danger" : "success"}
          href={`/portal/fees?child=${child.id}`}
        />
        <StatTile
          label="Latest result"
          value={latestCard ? formatPercent(toNumber(latestCard.percentage), 1) : "—"}
          sublabel={latestCard ? `${latestCard.term.name} · grade ${latestCard.grade ?? "—"}` : "not published yet"}
          tone={latestCard ? resultTone : "neutral"}
          href={`/portal/results?child=${child.id}`}
        />
        <StatTile
          label="Homework pending"
          value={String(pendingHomework)}
          sublabel={pendingHomework > 0 ? "awaiting submission" : "nothing pending"}
          tone={pendingHomework > 0 ? "warning" : "success"}
          href={`/portal/homework?child=${child.id}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Homework due next"
            action={
              <Link
                href={`/portal/homework?child=${child.id}`}
                className="text-xs font-medium text-brand"
              >
                View all
              </Link>
            }
          />
          {homework.length === 0 ? (
            <EmptyState title="Nothing due" description="No homework is scheduled ahead." />
          ) : (
            <ul className="divide-y divide-border">
              {homework.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.homework.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {item.homework.subject.name} · due {relativeDays(item.homework.dueOn)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      item.status === "SUBMITTED" || item.status === "GRADED" ? "success"
                      : item.status === "LATE" ? "warning"
                      : "neutral"
                    }
                  >
                    {item.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Fee summary" description="Current academic year" />
          <div className="px-5 py-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Paid</span>
              <span className="numeric font-semibold">{formatMoney(paid, currency)}</span>
            </div>
            <div className="mt-2">
              <ProgressBar
                value={billed > 0 ? (paid / billed) * 100 : 0}
                tone={outstanding > 0 ? "warning" : "success"}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              of {formatMoney(billed, currency)} billed
            </p>

            {transport ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-[11px] text-muted uppercase">Transport</p>
                <p className="mt-1 text-sm font-medium">{transport.route.name}</p>
                <p className="text-xs text-muted">
                  {transport.stop.name}
                  {transport.stop.pickupTime ? ` · pickup ${transport.stop.pickupTime}` : ""}
                  {transport.stop.dropTime ? ` · drop ${transport.stop.dropTime}` : ""}
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Notices from school" />
        {notices.length === 0 ? (
          <EmptyState title="No notices" />
        ) : (
          <ul className="divide-y divide-border">
            {notices.map((notice) => (
              <li key={notice.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{notice.title}</p>
                  {notice.isPinned ? <Badge tone="brand">Pinned</Badge> : null}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-strong">
                  {notice.body}
                </p>
                <p className="mt-1.5 text-xs text-muted">
                  {formatDate(notice.publishedAt, "long")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
