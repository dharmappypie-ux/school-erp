import Link from "next/link";

import {
  Alert,
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
  cn,
} from "@/components/ui";
import {
  agingBuckets,
  distribution,
  mean,
  median,
  rankGroups,
  slope,
  trend,
  type Trend,
} from "@/lib/analytics";
import { requirePermission } from "@/lib/auth";
import { formatMoney, formatPercent, toNumber } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Analytics" };

/** Grade bands for the performance histogram. */
/**
 * Five bands rather than six: the ordinal data ramp fits five steps with
 * visible lightness gaps in both themes, and the pass line is not lost by
 * merging the bottom two — "Pass rate" is its own stat tile above.
 */
const GRADE_BANDS = [
  { label: "90–100", min: 90, max: 100 },
  { label: "75–89", min: 75, max: 89.99 },
  { label: "60–74", min: 60, max: 74.99 },
  { label: "45–59", min: 45, max: 59.99 },
  { label: "Below 45", min: 0, max: 44.99 },
];

/** Renders a period-over-period change, or says why it cannot. */
function TrendBadge({ value, invert }: { value: Trend; invert?: boolean }) {
  if (value.direction === "NEW") {
    return <Badge tone="info">new</Badge>;
  }
  if (value.direction === "FLAT" || value.percentChange === null) {
    return <Badge tone="neutral">no change</Badge>;
  }

  const rising = value.direction === "UP";
  // For metrics where up is bad (arrears, absences) the colour flips.
  const good = invert ? !rising : rising;

  return (
    <Badge tone={good ? "success" : "danger"}>
      {rising ? "▲" : "▼"} {Math.abs(value.percentChange)}%
    </Badge>
  );
}

export default async function AnalyticsPage() {
  const session = await requirePermission("analytics.read");
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;
  const currency = session.school.currency;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

  const [
    studentsByStatus,
    studentsByGender,
    sections,
    attendanceRecent,
    attendancePrior,
    attendanceDaily,
    marks,
    invoices,
    paymentsRecent,
    paymentsPrior,
    admissionFunnel,
    transportAssigned,
    hostelAllocated,
    booksOnLoan,
    staffCount,
  ] = await Promise.all([
    db.student.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    db.student.groupBy({
      by: ["gender"],
      where: { deletedAt: null, status: "ACTIVE" },
      _count: { _all: true },
    }),
    yearId
      ? db.section.findMany({
          where: { academicYearId: yearId },
          orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            capacity: true,
            classLevel: { select: { name: true } },
            _count: { select: { enrollments: { where: { isActive: true } } } },
          },
        })
      : [],
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { date: { gte: thirtyDaysAgo } },
      _count: { _all: true },
    }),
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      _count: { _all: true },
    }),
    db.attendanceRecord.groupBy({
      by: ["date", "status"],
      where: { date: { gte: thirtyDaysAgo } },
      _count: { _all: true },
    }),
    db.markEntry.findMany({
      where: { isAbsent: false },
      select: {
        marksObtained: true,
        studentId: true,
        exam: {
          select: {
            maxMarks: true,
            subject: { select: { id: true, name: true, isGraded: true } },
            classLevel: { select: { id: true, name: true, numericOrder: true } },
          },
        },
      },
    }),
    db.invoice.findMany({
      where: yearId ? { academicYearId: yearId } : {},
      select: { dueDate: true, amountDue: true, total: true, amountPaid: true },
    }),
    db.payment.aggregate({
      where: { status: "SUCCESS", paidAt: { gte: thirtyDaysAgo, lt: now } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.payment.aggregate({
      where: { status: "SUCCESS", paidAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.admissionApplication.groupBy({
      by: ["status"],
      where: yearId ? { academicYearId: yearId } : {},
      _count: { _all: true },
    }),
    db.transportAssignment.count({ where: { isActive: true } }),
    db.hostelAllocation.count({ where: { isActive: true } }),
    db.bookIssue.count({ where: { returnedOn: null } }),
    db.staffMember.count({
      where: { employmentStatus: "ACTIVE", deletedAt: null },
    }),
  ]);

  // -- Enrolment --------------------------------------------------------------
  const activeStudents =
    studentsByStatus.find((row) => row.status === "ACTIVE")?._count._all ?? 0;
  const totalCapacity = sections.reduce((sum, s) => sum + s.capacity, 0);
  const totalEnrolled = sections.reduce(
    (sum, s) => sum + s._count.enrollments,
    0,
  );

  // -- Attendance -------------------------------------------------------------
  function rate(rows: { status: string; _count: { _all: number } }[]): number {
    const total = rows.reduce((sum, row) => sum + row._count._all, 0);
    if (total === 0) return 0;
    const present = rows
      .filter((row) => row.status === "PRESENT" || row.status === "LATE")
      .reduce((sum, row) => sum + row._count._all, 0);
    return (present / total) * 100;
  }
  const attendanceNow = rate(attendanceRecent);
  const attendanceBefore = rate(attendancePrior);
  const attendanceTrend = trend(
    Math.round(attendanceNow * 10) / 10,
    Math.round(attendanceBefore * 10) / 10,
  );

  const dailyMap = new Map<string, { present: number; total: number }>();
  for (const row of attendanceDaily) {
    const key = row.date.toISOString().slice(0, 10);
    const entry = dailyMap.get(key) ?? { present: 0, total: 0 };
    entry.total += row._count._all;
    if (row.status === "PRESENT" || row.status === "LATE") {
      entry.present += row._count._all;
    }
    dailyMap.set(key, entry);
  }
  const dailySeries = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([key, entry]) => ({
      label: new Date(key).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      value: entry.total > 0 ? Math.round((entry.present / entry.total) * 100) : 0,
      step: 4 as const,
    }));
  const attendanceSlope = slope(dailySeries.map((point) => point.value));

  // -- Academic performance ---------------------------------------------------
  const scored = marks
    .filter((mark) => mark.exam.subject.isGraded && toNumber(mark.exam.maxMarks) > 0)
    .map((mark) => ({
      percent:
        (toNumber(mark.marksObtained) / toNumber(mark.exam.maxMarks)) * 100,
      subjectId: mark.exam.subject.id,
      subjectName: mark.exam.subject.name,
      classId: mark.exam.classLevel.id,
      className: mark.exam.classLevel.name,
      order: mark.exam.classLevel.numericOrder,
    }));

  const gradeSpread = distribution(
    scored.map((row) => row.percent),
    GRADE_BANDS,
  );
  const overallMean = mean(scored.map((row) => row.percent));
  const overallMedian = median(scored.map((row) => row.percent));
  const passRate =
    scored.length > 0
      ? (scored.filter((row) => row.percent >= 33).length / scored.length) * 100
      : null;

  const bySubject = new Map<string, { label: string; values: number[] }>();
  for (const row of scored) {
    const entry = bySubject.get(row.subjectId) ?? { label: row.subjectName, values: [] };
    entry.values.push(row.percent);
    bySubject.set(row.subjectId, entry);
  }
  const subjectRanking = rankGroups(
    [...bySubject.entries()].map(([key, value]) => ({ key, ...value })),
    { minimumSample: 20 },
  );

  const byClass = new Map<string, { label: string; values: number[] }>();
  for (const row of scored) {
    const entry = byClass.get(row.classId) ?? { label: row.className, values: [] };
    entry.values.push(row.percent);
    byClass.set(row.classId, entry);
  }
  const classRanking = rankGroups(
    [...byClass.entries()].map(([key, value]) => ({ key, ...value })),
    { minimumSample: 20 },
  );

  // -- Finance ----------------------------------------------------------------
  const invoiceRows = invoices.map((invoice) => ({
    dueDate: invoice.dueDate,
    amountDue: toNumber(invoice.amountDue),
  }));
  const aging = agingBuckets(invoiceRows, now);
  const totalOverdue = aging.reduce((sum, bucket) => sum + bucket.amount, 0);
  const billed = invoices.reduce((sum, i) => sum + toNumber(i.total), 0);
  const collected = invoices.reduce((sum, i) => sum + toNumber(i.amountPaid), 0);
  const collectionRate = billed > 0 ? (collected / billed) * 100 : 0;

  const outstandingBalances = invoiceRows
    .map((row) => row.amountDue)
    .filter((amount) => amount > 0);
  const meanBalance = mean(outstandingBalances);
  const medianBalance = median(outstandingBalances);

  const collectionTrend = trend(
    toNumber(paymentsRecent._sum.amount),
    toNumber(paymentsPrior._sum.amount),
  );

  // -- Admissions -------------------------------------------------------------
  const applications = admissionFunnel.reduce(
    (sum, row) => sum + row._count._all,
    0,
  );
  const enrolledApplicants =
    admissionFunnel.find((row) => row.status === "ENROLLED")?._count._all ?? 0;
  const rejected =
    admissionFunnel.find((row) => row.status === "REJECTED")?._count._all ?? 0;
  const conversionRate =
    applications > 0 ? (enrolledApplicants / applications) * 100 : null;

  const noData = activeStudents === 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description={
          session.academicYear
            ? `${session.school.name} · ${session.academicYear.name}`
            : session.school.name
        }
      />

      {noData ? (
        <EmptyState
          title="Nothing to analyse yet"
          description="Once students, attendance and marks are recorded, this page fills in."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Active students"
              value={String(activeStudents)}
              sublabel={`${staffCount} staff · ${
                totalCapacity > 0
                  ? formatPercent((totalEnrolled / totalCapacity) * 100, 0)
                  : "—"
              } of seats filled`}
              href="/students"
            />
            <StatTile
              label="Attendance, last 30 days"
              value={formatPercent(attendanceNow, 1)}
              sublabel={
                <span className="flex items-center gap-1.5">
                  <TrendBadge value={attendanceTrend} />
                  <span className="text-muted">vs previous 30</span>
                </span>
              }
              tone={attendanceNow >= 90 ? "success" : "warning"}
              href="/attendance"
            />
            <StatTile
              label="Collected, last 30 days"
              value={formatMoney(paymentsRecent._sum.amount, currency)}
              sublabel={
                <span className="flex items-center gap-1.5">
                  <TrendBadge value={collectionTrend} />
                  <span className="text-muted">
                    {paymentsRecent._count._all} receipts
                  </span>
                </span>
              }
              href="/fees/payments"
            />
            <StatTile
              label="Overdue"
              value={formatMoney(totalOverdue, currency)}
              sublabel={`${aging.reduce((s, b) => s + b.count, 0)} invoices past due`}
              tone={totalOverdue > 0 ? "danger" : "success"}
              href="/fees"
            />
          </div>

          {/* -- Attendance ------------------------------------------------- */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Attendance trend"
                description={
                  attendanceSlope === null
                    ? "Not enough days recorded to show a direction"
                    : attendanceSlope > 0.1
                      ? "Rising across the period"
                      : attendanceSlope < -0.1
                        ? "Falling across the period"
                        : "Broadly steady across the period"
                }
              />
              <div className="px-5 py-5">
                {dailySeries.length === 0 ? (
                  <EmptyState title="No attendance in the last 30 days" />
                ) : (
                  <BarChart
                    data={dailySeries}
                    height={170}
                    format={(value) => `${value}%`}
                  />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Student body" description="Active students" />
              <div className="space-y-3 px-5 py-5">
                {studentsByGender.map((row) => {
                  const percent =
                    activeStudents > 0
                      ? (row._count._all / activeStudents) * 100
                      : 0;
                  return (
                    <div key={row.gender ?? "unknown"}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="capitalize">
                          {row.gender?.toLowerCase() ?? "not recorded"}
                        </span>
                        <span className="numeric text-muted">
                          {row._count._all} · {formatPercent(percent, 0)}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <ProgressBar value={percent} tone="brand" />
                      </div>
                    </div>
                  );
                })}

                <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Using transport</dt>
                    <dd className="numeric font-semibold">{transportAssigned}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">In hostel</dt>
                    <dd className="numeric font-semibold">{hostelAllocated}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Books on loan</dt>
                    <dd className="numeric font-semibold">{booksOnLoan}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Applications</dt>
                    <dd className="numeric font-semibold">{applications}</dd>
                  </div>
                </dl>
              </div>
            </Card>
          </div>

          {/* -- Academic performance ---------------------------------------- */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Score distribution"
                description={`${gradeSpread.total} graded marks across the school`}
              />
              <div className="px-5 py-5">
                {gradeSpread.total === 0 ? (
                  <EmptyState title="No marks recorded yet" />
                ) : (
                  <>
                    <BarChart
                      // Darker means higher: an ordinal ramp shows the shape of
                      // the distribution without colouring low marks as an
                      // alarm. Whether the school should worry is the pass-rate
                      // figure's job, not the bars'.
                      data={gradeSpread.bands.map((band, index) => ({
                        label: band.label,
                        value: band.count,
                        step: (gradeSpread.bands.length - index) as 1 | 2 | 3 | 4 | 5,
                      }))}
                      height={170}
                    />
                    <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
                      <div>
                        <dt className="text-xs text-muted">Mean</dt>
                        <dd className="numeric font-semibold">
                          {overallMean === null ? "—" : formatPercent(overallMean, 1)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Median</dt>
                        <dd className="numeric font-semibold">
                          {overallMedian === null ? "—" : formatPercent(overallMedian, 1)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Pass rate</dt>
                        <dd className="numeric font-semibold">
                          {passRate === null ? "—" : formatPercent(passRate, 1)}
                        </dd>
                      </div>
                    </dl>
                    {gradeSpread.outOfRange > 0 ? (
                      <p className="mt-2 text-xs text-warning">
                        {gradeSpread.outOfRange} marks fall outside 0–100 and are
                        excluded from the bands above.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Subjects by average"
                description="Weakest at the bottom"
              />
              {subjectRanking.length === 0 ? (
                <EmptyState title="No marks to rank" />
              ) : (
                <ul className="divide-y divide-border">
                  {subjectRanking.map((subject) => (
                    <li key={subject.key} className="px-5 py-2.5">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">{subject.label}</span>
                        <span
                          className={cn(
                            "numeric shrink-0 font-medium",
                            subject.value >= 60 ? "text-success" : "text-warning",
                          )}
                        >
                          {formatPercent(subject.value, 1)}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <ProgressBar
                          value={subject.value}
                          tone={subject.value >= 60 ? "success" : "warning"}
                        />
                      </div>
                      {!subject.comparable ? (
                        <p className="mt-1 text-[11px] text-muted">
                          only {subject.sampleSize} marks — too few to compare
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* -- Finance ------------------------------------------------------ */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Receivables aging"
                description="How long fee balances have been outstanding"
              />
              {totalOverdue === 0 ? (
                <EmptyState
                  title="Nothing overdue"
                  description="Every issued invoice is either settled or not yet due."
                />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Age</Th>
                      <Th className="text-right">Invoices</Th>
                      <Th className="text-right">Amount</Th>
                      <Th className="w-40">Share</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {aging.map((bucket) => {
                      const share =
                        totalOverdue > 0 ? (bucket.amount / totalOverdue) * 100 : 0;
                      return (
                        <tr key={bucket.label}>
                          <Td className="font-medium">{bucket.label}</Td>
                          <Td className="numeric text-right">{bucket.count}</Td>
                          <Td className="numeric text-right">
                            {formatMoney(bucket.amount, currency)}
                          </Td>
                          <Td>
                            <ProgressBar
                              value={share}
                              tone={
                                bucket.from >= 91 ? "danger"
                                : bucket.from >= 61 ? "warning"
                                : "brand"
                              }
                            />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card>
              <CardHeader title="Collection" description="Current academic year" />
              <div className="space-y-4 px-5 py-5">
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted">Collected</span>
                    <span className="numeric font-semibold">
                      {formatPercent(collectionRate, 1)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar
                      value={collectionRate}
                      tone={collectionRate >= 75 ? "success" : "warning"}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {formatMoney(collected, currency)} of{" "}
                    {formatMoney(billed, currency)}
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Median balance</dt>
                    <dd className="numeric font-semibold">
                      {medianBalance === null ? "—" : formatMoney(medianBalance, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Mean balance</dt>
                    <dd className="numeric font-semibold">
                      {meanBalance === null ? "—" : formatMoney(meanBalance, currency)}
                    </dd>
                  </div>
                </dl>
                {meanBalance !== null &&
                medianBalance !== null &&
                meanBalance > medianBalance * 1.5 ? (
                  <p className="text-xs text-muted">
                    The mean sits well above the median, so a small number of
                    large debtors accounts for much of the balance. The median
                    is the better guide to what a typical family owes.
                  </p>
                ) : null}
              </div>
            </Card>
          </div>

          {/* -- Classes ------------------------------------------------------ */}
          <Card className="mt-4">
            <CardHeader
              title="Classes"
              description="Enrolment against capacity, and average score"
              action={
                <Link href="/academics" className="text-xs font-medium text-brand">
                  Classes & subjects
                </Link>
              }
            />
            {sections.length === 0 ? (
              <EmptyState title="No sections configured" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Class</Th>
                    <Th className="text-right">Enrolled</Th>
                    <Th className="w-40">Capacity used</Th>
                    <Th className="text-right">Average score</Th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => {
                    const used =
                      section.capacity > 0
                        ? (section._count.enrollments / section.capacity) * 100
                        : 0;
                    const ranked = classRanking.find(
                      (entry) => entry.label === section.classLevel.name,
                    );
                    return (
                      <tr key={section.id} className="hover:bg-surface-hover">
                        <Td className="font-medium">
                          {section.classLevel.name} {section.name}
                        </Td>
                        <Td className="numeric text-right">
                          {section._count.enrollments} / {section.capacity}
                        </Td>
                        <Td>
                          <ProgressBar
                            value={Math.min(100, used)}
                            tone={
                              used > 100 ? "danger"
                              : used >= 90 ? "warning"
                              : "success"
                            }
                          />
                        </Td>
                        <Td className="numeric text-right">
                          {ranked ? (
                            <>
                              {formatPercent(ranked.value, 1)}
                              {!ranked.comparable ? (
                                <span className="block text-[11px] text-muted">
                                  {ranked.sampleSize} marks
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>

          {conversionRate !== null ? (
            <div className="mt-4">
              <Alert tone="info" title="Admissions">
                {applications} applications this year — {enrolledApplicants}{" "}
                enrolled ({formatPercent(conversionRate, 0)}), {rejected} rejected.
                The remainder are still moving through the funnel.
              </Alert>
            </div>
          ) : null}

          <p className="mt-3 text-xs text-muted">
            Groups with too few marks to compare fairly are labelled rather than
            hidden. Percentage changes are omitted where the previous period was
            zero, since a percentage would be undefined.
          </p>
        </>
      )}
    </>
  );
}
