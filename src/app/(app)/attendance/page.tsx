import {
  AttendanceSheet,
  type SheetStudent,
} from "@/app/(app)/attendance/attendance-sheet";
import { FilterSelect } from "@/components/data-controls";
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { formatDate, formatPercent } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Attendance" };

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function AttendancePage({
  searchParams,
}: PageProps<"/attendance">) {
  const session = await requireAuth();
  if (!hasPermission(session.permissions, "attendance.read")) {
    // Portal users reach their own attendance through /portal instead.
    return (
      <Alert tone="warning" title="Not available">
        Your account cannot view class attendance.
      </Alert>
    );
  }

  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const yearId = session.academicYear?.id;

  const date =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : isoDate(new Date());
  const day = new Date(`${date}T00:00:00.000Z`);

  const sections = yearId
    ? await db.section.findMany({
        where: { academicYearId: yearId },
        orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
        select: { id: true, name: true, classLevel: { select: { name: true } } },
      })
    : [];

  const sectionId =
    typeof params.section === "string" && params.section
      ? params.section
      : (sections[0]?.id ?? "");

  const canMark = hasPermission(session.permissions, "attendance.mark");

  const [dayTotals, enrollments, existing, holiday] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { date: day },
      _count: { _all: true },
    }),
    sectionId && yearId
      ? db.enrollment.findMany({
          where: { sectionId, academicYearId: yearId, isActive: true },
          orderBy: [{ rollNumber: "asc" }],
          select: {
            rollNumber: true,
            student: {
              select: { id: true, firstName: true, lastName: true, admissionNo: true },
            },
          },
        })
      : [],
    sectionId
      ? db.attendanceRecord.findMany({
          where: { sectionId, date: day },
          select: { studentId: true, status: true },
        })
      : [],
    db.holiday.findFirst({ where: { date: day } }),
  ]);

  const statusByStudent = new Map(
    existing.map((record) => [record.studentId, record.status]),
  );

  const students: SheetStudent[] = enrollments.map((enrollment) => ({
    studentId: enrollment.student.id,
    firstName: enrollment.student.firstName,
    lastName: enrollment.student.lastName,
    admissionNo: enrollment.student.admissionNo,
    rollNumber: enrollment.rollNumber,
    status: (statusByStudent.get(enrollment.student.id) ?? null) as
      | SheetStudent["status"],
  }));

  const marked = dayTotals.reduce((sum, row) => sum + row._count._all, 0);
  const present = dayTotals
    .filter((row) => row.status === "PRESENT" || row.status === "LATE")
    .reduce((sum, row) => sum + row._count._all, 0);
  const absent =
    dayTotals.find((row) => row.status === "ABSENT")?._count._all ?? 0;

  const selectedSection = sections.find((section) => section.id === sectionId);
  const weekday = day.getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`${formatDate(day, "long")} · ${selectedSection ? `${selectedSection.classLevel.name} ${selectedSection.name}` : "select a class"}`}
      />

      {holiday ? (
        <div className="mb-4">
          <Alert tone="info" title={`Holiday — ${holiday.name}`}>
            This date is marked as a holiday. Attendance is usually not recorded.
          </Alert>
        </div>
      ) : isWeekend ? (
        <div className="mb-4">
          <Alert tone="info" title="Weekend">
            {formatDate(day, "long")} falls on a weekend.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Marked today"
          value={String(marked)}
          sublabel="across all classes"
        />
        <StatTile
          label="Present"
          value={marked > 0 ? formatPercent((present / marked) * 100, 1) : "—"}
          sublabel={`${present} students`}
          tone="success"
        />
        <StatTile
          label="Absent"
          value={String(absent)}
          sublabel={absent > 0 ? "guardians can be notified" : "none"}
          tone={absent > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Class register"
          description={
            canMark
              ? "Tap a state per student, then save."
              : "You have view-only access to attendance."
          }
          action={
            <div className="flex flex-wrap gap-2">
              <FilterSelect
                paramName="section"
                label="Class"
                allLabel="Select class"
                options={sections.map((section) => ({
                  value: section.id,
                  label: `${section.classLevel.name} ${section.name}`,
                }))}
              />
              <form className="contents">
                <input
                  type="date"
                  name="date"
                  defaultValue={date}
                  aria-label="Attendance date"
                  className="h-9.5 rounded-[var(--radius-base)] border border-border-strong bg-surface px-3 text-sm"
                />
                <input type="hidden" name="section" value={sectionId} />
                <button
                  type="submit"
                  className="h-9.5 rounded-[var(--radius-base)] border border-border-strong px-3 text-sm font-medium hover:bg-surface-hover"
                >
                  Go
                </button>
              </form>
            </div>
          }
        />

        {!yearId ? (
          <EmptyState
            title="No academic year is current"
            description="Set a current academic year before recording attendance."
          />
        ) : students.length === 0 ? (
          <EmptyState
            title="No students enrolled"
            description="Choose a class that has active enrolments for this year."
          />
        ) : (
          <AttendanceSheet
            sectionId={sectionId}
            date={date}
            students={students}
            readOnly={!canMark}
          />
        )}
      </Card>
    </>
  );
}
