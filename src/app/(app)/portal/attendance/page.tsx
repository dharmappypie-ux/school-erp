import { ChildSwitcher } from "@/app/(app)/portal/child-switcher";
import {
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
import { formatDate, formatPercent } from "@/lib/format";
import { resolvePortalStudent } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Attendance" };

const STATUS_TONE: Record<string, Tone> = {
  PRESENT: "success",
  LATE: "warning",
  ABSENT: "danger",
  HALF_DAY: "warning",
  EXCUSED: "info",
  ON_LEAVE: "info",
  HOLIDAY: "neutral",
};

export default async function PortalAttendancePage({
  searchParams,
}: PageProps<"/portal/attendance">) {
  const params = await searchParams;
  const { context, child } = await resolvePortalStudent(params.child);
  const session = context.session;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;

  const [groups, recent] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId: child.id, ...(yearId ? { academicYearId: yearId } : {}) },
      _count: { _all: true },
    }),
    db.attendanceRecord.findMany({
      where: { studentId: child.id, ...(yearId ? { academicYearId: yearId } : {}) },
      orderBy: { date: "desc" },
      take: 40,
      select: { id: true, date: true, status: true, remarks: true },
    }),
  ]);

  const total = groups.reduce((sum, row) => sum + row._count._all, 0);
  const counts = Object.fromEntries(
    groups.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;
  const present = (counts.PRESENT ?? 0) + (counts.LATE ?? 0);
  const rate = total > 0 ? (present / total) * 100 : null;

  // Month-by-month rate, oldest first, from the records already fetched.
  const byMonth = new Map<string, { present: number; total: number }>();
  for (const record of [...recent].reverse()) {
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

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`${child.firstName} ${child.lastName ?? ""} · ${child.className ?? child.admissionNo}`}
      />

      <ChildSwitcher students={context.children} selectedId={child.id} />

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
        <StatTile label="Present" value={String(counts.PRESENT ?? 0)} tone="success" />
        <StatTile label="Absent" value={String(counts.ABSENT ?? 0)} tone="danger" />
        <StatTile label="Late" value={String(counts.LATE ?? 0)} tone="warning" />
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
        <CardHeader title="Recent record" description="Most recent 40 sessions" />
        {recent.length === 0 ? (
          <EmptyState title="No attendance recorded yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th>Remarks</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((record) => (
                <tr key={record.id}>
                  <Td>{formatDate(record.date, "long")}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[record.status] ?? "neutral"}>
                      {record.status.replace("_", " ").toLowerCase()}
                    </Badge>
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
