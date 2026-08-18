import Link from "next/link";

import {
  Badge,
  BarChart,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatDate, formatMoney, formatNumber, formatPercent, toNumber } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Dashboard" };

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** The last `count` weekdays, oldest first. */
function recentWeekdays(count: number): Date[] {
  const days: Date[] = [];
  const cursor = startOfDay(new Date());
  while (days.length < count) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return days.reverse();
}

export default async function DashboardPage() {
  const session = await requireAuth();
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;

  const days = recentWeekdays(10);
  const windowStart = days[0];

  // The navigation was already permission-filtered, but the dashboard was not:
  // a teacher with no `fees.read` was still shown school-wide collection and
  // arrears. Each panel is now gated on the same permission that guards the
  // page it links to, and the queries behind a hidden panel are not run.
  const can = {
    fees: hasPermission(session.permissions, "fees.read"),
    staff: hasPermission(session.permissions, "staff.read"),
    admissions: hasPermission(session.permissions, "admissions.read"),
    leave: hasPermission(session.permissions, "leave.read"),
    insights: hasPermission(session.permissions, "ai.insights"),
  };
  const ZERO_INVOICES = {
    _sum: { total: null, amountPaid: null, amountDue: null },
    _count: { _all: 0 },
  };

  const [
    studentCount,
    staffCount,
    sectionCount,
    attendanceWindow,
    invoiceTotals,
    overdueCount,
    recentPayments,
    notices,
    pendingLeave,
    openAdmissions,
    upcomingHomework,
    riskyStudents,
  ] = await Promise.all([
    db.student.count({ where: { status: "ACTIVE", deletedAt: null } }),
    can.staff
      ? db.staffMember.count({ where: { employmentStatus: "ACTIVE", deletedAt: null } })
      : 0,
    yearId ? db.section.count({ where: { academicYearId: yearId } }) : 0,

    db.attendanceRecord.groupBy({
      by: ["date", "status"],
      where: { date: { gte: windowStart } },
      _count: { _all: true },
    }),

    can.fees
      ? db.invoice.aggregate({
          where: yearId ? { academicYearId: yearId } : {},
          _sum: { total: true, amountPaid: true, amountDue: true },
          _count: { _all: true },
        })
      : ZERO_INVOICES,

    can.fees
      ? db.invoice.count({
          where: {
            status: { in: ["OVERDUE", "PARTIALLY_PAID", "ISSUED"] },
            dueDate: { lt: new Date() },
          },
        })
      : 0,

    can.fees
      ? db.payment.findMany({
      where: { status: "SUCCESS" },
      orderBy: { paidAt: "desc" },
      take: 6,
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        mode: true,
        paidAt: true,
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
      },
        })
      : [],

    db.notice.findMany({
      where: { publishedAt: { not: null } },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
      select: { id: true, title: true, publishedAt: true, isPinned: true, audience: true },
    }),

    can.leave ? db.leaveRequest.count({ where: { status: "PENDING" } }) : 0,

    can.admissions
      ? db.admissionApplication.count({
          where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED"] } },
        })
      : 0,

    db.homework.findMany({
      where: { dueOn: { gte: startOfDay(new Date()) } },
      orderBy: { dueOn: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        dueOn: true,
        subject: { select: { name: true } },
        section: { select: { name: true, classLevel: { select: { name: true } } } },
      },
    }),

    // Students whose absence rate over the window is high enough to warrant a
    // look. Computed here rather than read from RiskScore so the dashboard is
    // useful before the nightly scoring job has ever run.
    db.attendanceRecord.groupBy({
      by: ["studentId"],
      where: { date: { gte: windowStart }, status: "ABSENT" },
      _count: { _all: true },
      having: { studentId: { _count: { gte: Math.max(3, Math.ceil(days.length * 0.4)) } } },
      orderBy: { _count: { studentId: "desc" } },
      take: 6,
    }),
  ]);

  // -- Attendance series ----------------------------------------------------
  const byDay = new Map<string, { present: number; total: number }>();
  for (const row of attendanceWindow) {
    const key = row.date.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { present: 0, total: 0 };
    entry.total += row._count._all;
    if (row.status === "PRESENT" || row.status === "LATE") {
      entry.present += row._count._all;
    }
    byDay.set(key, entry);
  }

  const attendanceSeries = days.map((day) => {
    const entry = byDay.get(day.toISOString().slice(0, 10));
    const percent = entry && entry.total > 0 ? (entry.present / entry.total) * 100 : 0;
    return {
      label: day.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      value: Math.round(percent),
      tone:
        percent >= 90 ? ("success" as const)
        : percent >= 75 ? ("brand" as const)
        : percent > 0 ? ("warning" as const)
        : ("neutral" as const),
    };
  });

  const today = byDay.get(startOfDay(new Date()).toISOString().slice(0, 10));
  const latestWithData = [...attendanceSeries].reverse().find((day) => day.value > 0);
  const todayPercent = today && today.total > 0 ? (today.present / today.total) * 100 : null;

  // -- Fees -----------------------------------------------------------------
  const billed = toNumber(invoiceTotals._sum.total);
  const collected = toNumber(invoiceTotals._sum.amountPaid);
  const outstanding = toNumber(invoiceTotals._sum.amountDue);
  const collectionRate = billed > 0 ? (collected / billed) * 100 : 0;

  // -- At-risk names --------------------------------------------------------
  const riskyIds = riskyStudents.map((row) => row.studentId);
  const riskyDetails = riskyIds.length
    ? await db.student.findMany({
        where: { id: { in: riskyIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
          enrollments: {
            where: yearId ? { academicYearId: yearId } : undefined,
            take: 1,
            select: {
              section: { select: { name: true, classLevel: { select: { name: true } } } },
            },
          },
        },
      })
    : [];
  const riskyById = new Map(riskyDetails.map((student) => [student.id, student]));

  const currency = session.school.currency;

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${session.firstName}`}
        description={
          session.academicYear
            ? `${session.school.name} · Academic year ${session.academicYear.name}`
            : `${session.school.name} · no academic year is marked current`
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active students"
          value={formatNumber(studentCount)}
          sublabel={`${sectionCount} sections`}
          href="/students"
        />
        {can.staff ? (
          <StatTile
            label="Active staff"
            value={formatNumber(staffCount)}
            sublabel={pendingLeave > 0 ? `${pendingLeave} leave requests pending` : "No pending leave"}
            tone={pendingLeave > 0 ? "warning" : "neutral"}
            href="/staff"
          />
        ) : null}
        <StatTile
          label="Attendance today"
          value={todayPercent === null ? "—" : formatPercent(todayPercent, 0)}
          sublabel={
            todayPercent === null
              ? latestWithData
                ? `Last recorded ${latestWithData.label}: ${latestWithData.value}%`
                : "Not yet marked"
              : todayPercent >= 90
                ? "On track"
                : "Below target"
          }
          tone={todayPercent === null ? "neutral" : todayPercent >= 90 ? "success" : "warning"}
          href="/attendance"
        />
        {can.fees ? (
          <StatTile
            label="Fees outstanding"
            value={formatMoney(outstanding, currency)}
            sublabel={`${overdueCount} invoices overdue`}
            tone={overdueCount > 0 ? "danger" : "success"}
            href="/fees"
          />
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Attendance trend"
            description={`Share of students present across the last ${days.length} school days`}
            action={
              <Link href="/attendance" className="text-xs font-medium text-brand">
                View details
              </Link>
            }
          />
          <div className="px-5 py-5">
            {attendanceSeries.some((day) => day.value > 0) ? (
              <BarChart
                data={attendanceSeries}
                height={180}
                format={(value) => (value > 0 ? `${value}%` : "—")}
              />
            ) : (
              <EmptyState
                title="No attendance recorded yet"
                description="Once attendance is marked, the daily trend appears here."
              />
            )}
          </div>
        </Card>

        {can.fees ? (
        <Card>
          <CardHeader title="Fee collection" description="Current academic year" />
          <div className="space-y-4 px-5 py-5">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted">Collected</span>
                <span className="numeric text-sm font-semibold">
                  {formatMoney(collected, currency)}
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar
                  value={collectionRate}
                  tone={collectionRate >= 75 ? "success" : collectionRate >= 50 ? "warning" : "danger"}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {formatPercent(collectionRate, 1)} of {formatMoney(billed, currency)} billed
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted">Invoices</dt>
                <dd className="numeric mt-0.5 font-semibold">
                  {formatNumber(invoiceTotals._count._all)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Overdue</dt>
                <dd className="numeric mt-0.5 font-semibold text-danger">
                  {formatNumber(overdueCount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Applications open</dt>
                <dd className="numeric mt-0.5 font-semibold">
                  {formatNumber(openAdmissions)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Outstanding</dt>
                <dd className="numeric mt-0.5 font-semibold">
                  {formatMoney(outstanding, currency)}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Students needing attention"
            description={`Highest absence counts over the last ${days.length} school days`}
            action={
              <Link href="/insights" className="text-xs font-medium text-brand">
                AI insights
              </Link>
            }
          />
          {riskyStudents.length === 0 ? (
            <EmptyState
              title="No attendance concerns"
              description="No student has crossed the absence threshold in this window."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Class</Th>
                  <Th className="text-right">Absences</Th>
                </tr>
              </thead>
              <tbody>
                {riskyStudents.map((row) => {
                  const student = riskyById.get(row.studentId);
                  if (!student) return null;
                  const enrollment = student.enrollments[0];
                  const absences = row._count._all;
                  return (
                    <tr key={row.studentId}>
                      <Td>
                        <Link
                          href={`/students/${student.id}`}
                          className="font-medium hover:text-brand"
                        >
                          {student.firstName} {student.lastName}
                        </Link>
                        <span className="block text-xs text-muted">
                          {student.admissionNo}
                        </span>
                      </Td>
                      <Td className="text-muted-strong">
                        {enrollment
                          ? `${enrollment.section.classLevel.name} ${enrollment.section.name}`
                          : "—"}
                      </Td>
                      <Td className="text-right">
                        <Badge tone={absences >= days.length * 0.6 ? "danger" : "warning"}>
                          {absences} of {days.length}
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        {can.fees ? (
        <Card>
          <CardHeader
            title="Recent fee receipts"
            action={
              <Link href="/fees/payments" className="text-xs font-medium text-brand">
                All payments
              </Link>
            }
          />
          {recentPayments.length === 0 ? (
            <EmptyState title="No payments recorded yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Receipt</Th>
                  <Th>Student</Th>
                  <Th>Mode</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr key={payment.id}>
                    <Td className="font-mono text-xs">{payment.receiptNo}</Td>
                    <Td>
                      {payment.student.firstName} {payment.student.lastName}
                      <span className="block text-xs text-muted">
                        {formatDate(payment.paidAt)}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone="neutral">{payment.mode}</Badge>
                    </Td>
                    <Td className="numeric text-right font-medium">
                      {formatMoney(payment.amount, currency)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Notice board"
            action={
              <Link href="/notices" className="text-xs font-medium text-brand">
                All notices
              </Link>
            }
          />
          {notices.length === 0 ? (
            <EmptyState title="No notices published" />
          ) : (
            <ul className="divide-y divide-border">
              {notices.map((notice) => (
                <li key={notice.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{notice.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDate(notice.publishedAt)} · {notice.audience.join(", ")}
                    </p>
                  </div>
                  {notice.isPinned ? <Badge tone="brand">Pinned</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Homework due next"
            action={
              <Link href="/homework" className="text-xs font-medium text-brand">
                All homework
              </Link>
            }
          />
          {upcomingHomework.length === 0 ? (
            <EmptyState title="Nothing due" description="No homework is scheduled ahead." />
          ) : (
            <ul className="divide-y divide-border">
              {upcomingHomework.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {item.section.classLevel.name} {item.section.name} · {item.subject.name}
                    </p>
                  </div>
                  <Badge tone="info">{formatDate(item.dueOn)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
