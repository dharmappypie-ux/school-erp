import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/avatar";
import {
  Alert,
  Badge,
  BarChart,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  Table,
  Td,
  Th,
  type Tone,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatPercent } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Student attendance" };

const STATUS_TONE: Record<string, Tone> = {
  PRESENT: "success",
  LATE: "warning",
  ABSENT: "danger",
  HALF_DAY: "warning",
  EXCUSED: "info",
  ON_LEAVE: "info",
  HOLIDAY: "neutral",
};

export default async function StudentAttendancePage({
  params,
}: PageProps<"/students/[id]/attendance">) {
  const session = await requirePermission("attendance.read");
  const db = scopedDb(session.schoolId);
  const { id } = await params;
  const yearId = session.academicYear?.id;

  const student = await db.student.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      photoUrl: true,
      enrollments: {
        where: yearId ? { academicYearId: yearId } : undefined,
        take: 1,
        select: {
          section: { select: { name: true, classLevel: { select: { name: true } } } },
        },
      },
    },
  });
  if (!student) notFound();

  const [groups, records] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId: id, ...(yearId ? { academicYearId: yearId } : {}) },
      _count: { _all: true },
    }),
    db.attendanceRecord.findMany({
      where: { studentId: id, ...(yearId ? { academicYearId: yearId } : {}) },
      orderBy: { date: "desc" },
      take: 90,
      select: {
        id: true,
        date: true,
        status: true,
        remarks: true,
        source: true,
        markedBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const counts = Object.fromEntries(
    groups.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;
  const total = groups.reduce((sum, row) => sum + row._count._all, 0);
  const present = (counts.PRESENT ?? 0) + (counts.LATE ?? 0);
  const rate = total > 0 ? (present / total) * 100 : null;

  // Monthly rate from the records already loaded, oldest month first.
  const byMonth = new Map<string, { present: number; total: number }>();
  for (const record of [...records].reverse()) {
    const key = record.date.toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
    });
    const entry = byMonth.get(key) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (record.status === "PRESENT" || record.status === "LATE") entry.present += 1;
    byMonth.set(key, entry);
  }
  const series = [...byMonth.entries()].map(([label, entry]) => {
    const percent = entry.total > 0 ? (entry.present / entry.total) * 100 : 0;
    return {
      label,
      value: Math.round(percent),
      tone: (percent >= 90 ? "success" : percent >= 75 ? "brand" : "warning") as Tone,
    };
  });

  // The longest run of consecutive absences, the signal the AI model weights
  // most heavily and the one a class teacher should see directly.
  let longestRun = 0;
  let currentRun = 0;
  for (const record of [...records].reverse()) {
    if (record.status === "ABSENT") {
      currentRun += 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 0;
    }
  }

  const enrollment = student.enrollments[0];

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar
              firstName={student.firstName}
              lastName={student.lastName}
              photoUrl={student.photoUrl}
              size="lg"
            />
            {student.firstName} {student.lastName}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{student.admissionNo}</span>
            {enrollment ? (
              <>
                <span>·</span>
                <span>
                  {enrollment.section.classLevel.name} {enrollment.section.name}
                </span>
              </>
            ) : null}
            <span>·</span>
            <span>attendance history</span>
          </span>
        }
        action={
          <Link
            href={`/students/${student.id}`}
            className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
          >
            Back to profile
          </Link>
        }
      />

      {rate !== null && rate < 75 ? (
        <div className="mb-4">
          <Alert tone="warning" title="Below the 75% threshold">
            {student.firstName} has attended {formatPercent(rate, 1)} of recorded
            sessions this year. Many boards require 75% to sit examinations.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Attendance rate"
          value={rate === null ? "—" : formatPercent(rate, 1)}
          sublabel={`${present} of ${total} sessions`}
          tone={
            rate === null ? "neutral"
            : rate >= 90 ? "success"
            : rate >= 75 ? "warning"
            : "danger"
          }
        />
        <StatTile label="Absent" value={String(counts.ABSENT ?? 0)} tone="danger" />
        <StatTile label="Late" value={String(counts.LATE ?? 0)} tone="warning" />
        <StatTile
          label="Longest absence run"
          value={String(longestRun)}
          sublabel={longestRun >= 3 ? "consecutive days" : "no long run"}
          tone={longestRun >= 5 ? "danger" : longestRun >= 3 ? "warning" : "success"}
        />
      </div>

      {series.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title="Monthly attendance" description="Share of sessions attended" />
          <div className="px-5 py-5">
            <BarChart data={series} height={160} format={(value) => `${value}%`} />
          </div>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Session record"
          description={`Most recent ${records.length} sessions`}
        />
        {records.length === 0 ? (
          <EmptyState title="No attendance recorded for this student" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th>Source</Th>
                <Th>Marked by</Th>
                <Th>Remarks</Th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-surface-hover">
                  <Td>{formatDate(record.date, "long")}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[record.status] ?? "neutral"}>
                      {record.status.replace("_", " ").toLowerCase()}
                    </Badge>
                  </Td>
                  <Td className="text-muted-strong">
                    {record.source.replace("_", " ").toLowerCase()}
                  </Td>
                  <Td className="text-muted-strong">
                    {record.markedBy
                      ? `${record.markedBy.firstName} ${record.markedBy.lastName ?? ""}`
                      : "—"}
                  </Td>
                  <Td className="text-muted">{record.remarks ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
