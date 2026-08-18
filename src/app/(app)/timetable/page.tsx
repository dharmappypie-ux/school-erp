import { GeneratePanel } from "@/app/(app)/timetable/generate-panel";
import { FilterSelect } from "@/components/data-controls";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  cn,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";
import { findConflicts, WEEK, type Weekday } from "@/lib/timetable";

export const metadata = { title: "Timetable" };

/** Distinct, theme-aware tints so each subject is recognisable across the grid. */
const SUBJECT_TINTS = [
  "bg-brand-soft text-brand",
  "bg-success-soft text-success",
  "bg-warning-soft text-warning",
  "bg-info-soft text-info",
  "bg-danger-soft text-danger",
  "bg-surface-muted text-muted-strong",
];

function tintFor(subjectId: string, index: Map<string, number>): string {
  if (!index.has(subjectId)) index.set(subjectId, index.size);
  return SUBJECT_TINTS[(index.get(subjectId) ?? 0) % SUBJECT_TINTS.length];
}

export default async function TimetablePage({
  searchParams,
}: PageProps<"/timetable">) {
  const session = await requirePermission("timetable.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const yearId = session.academicYear?.id;

  const view = params.view === "teacher" ? "teacher" : "section";

  const [sections, periods, classLevels, teachers] = await Promise.all([
    yearId
      ? db.section.findMany({
          where: { academicYearId: yearId },
          orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
          select: { id: true, name: true, classLevel: { select: { name: true } } },
        })
      : [],
    db.period.findMany({
      orderBy: { sequence: "asc" },
      select: { id: true, name: true, sequence: true, startTime: true, endTime: true, isBreak: true },
    }),
    db.classLevel.findMany({
      orderBy: { numericOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.staffMember.findMany({
      where: { staffType: "TEACHING", employmentStatus: "ACTIVE", deletedAt: null },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const sectionId =
    typeof params.section === "string" && params.section
      ? params.section
      : (sections[0]?.id ?? "");
  const teacherId =
    typeof params.teacher === "string" && params.teacher
      ? params.teacher
      : (teachers[0]?.id ?? "");

  // Fetch the whole year's slots once: the grid needs one subset, and the
  // clash audit needs all of them.
  const allSlots = yearId
    ? await db.timetableSlot.findMany({
        where: { academicYearId: yearId },
        select: {
          id: true,
          dayOfWeek: true,
          periodId: true,
          sectionId: true,
          subjectId: true,
          teacherId: true,
          roomNumber: true,
          subject: { select: { name: true, code: true } },
          teacher: { select: { firstName: true, lastName: true } },
          section: { select: { name: true, classLevel: { select: { name: true } } } },
        },
      })
    : [];

  const conflicts = findConflicts(
    allSlots.map((slot) => ({
      sectionId: slot.sectionId,
      dayOfWeek: slot.dayOfWeek as Weekday,
      periodId: slot.periodId,
      subjectId: slot.subjectId ?? "",
      teacherId: slot.teacherId,
    })),
  );
  const clashingSlotKeys = new Set(
    conflicts.flatMap((conflict) =>
      conflict.slots.map(
        (slot) => `${slot.sectionId}|${slot.dayOfWeek}|${slot.periodId}`,
      ),
    ),
  );

  const visible = allSlots.filter((slot) =>
    view === "teacher" ? slot.teacherId === teacherId : slot.sectionId === sectionId,
  );

  const byCell = new Map<string, (typeof allSlots)[number][]>();
  for (const slot of visible) {
    const key = `${slot.dayOfWeek}|${slot.periodId}`;
    byCell.set(key, [...(byCell.get(key) ?? []), slot]);
  }

  const days = WEEK.slice(0, 6);
  const tintIndex = new Map<string, number>();
  const canManage = hasPermission(session.permissions, "timetable.manage");

  const teachingPeriods = periods.filter((period) => !period.isBreak);
  const filled = visible.length;
  const capacity =
    view === "section" ? teachingPeriods.length * days.length : teachingPeriods.length * days.length;

  const selectedSection = sections.find((section) => section.id === sectionId);
  const selectedTeacher = teachers.find((teacher) => teacher.id === teacherId);

  return (
    <>
      <PageHeader
        title="Timetable"
        description={
          view === "teacher"
            ? selectedTeacher
              ? `${selectedTeacher.firstName} ${selectedTeacher.lastName ?? ""} · weekly schedule`
              : "Select a teacher"
            : selectedSection
              ? `${selectedSection.classLevel.name} ${selectedSection.name} · weekly schedule`
              : "Select a class"
        }
      />

      {conflicts.length > 0 ? (
        <div className="mb-4">
          <Alert tone="danger" title={`${conflicts.length} scheduling clashes`}>
            The stored timetable puts a teacher or a section in two places at
            once. Clashing lessons are outlined in red below. Regenerating
            rebuilds the grid without clashes.
          </Alert>
        </div>
      ) : allSlots.length > 0 ? (
        <div className="mb-4">
          <Alert tone="success" title="No clashes">
            All {allSlots.length} scheduled periods are conflict-free.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Scheduled periods" value={String(allSlots.length)} />
        <StatTile
          label={view === "teacher" ? "This teacher's load" : "This class's periods"}
          value={String(filled)}
          sublabel={`of ${capacity} weekly slots`}
          tone={filled > 0 ? "brand" : "neutral"}
        />
        <StatTile
          label="Clashes"
          value={String(conflicts.length)}
          tone={conflicts.length > 0 ? "danger" : "success"}
        />
        <StatTile label="Sections" value={String(sections.length)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader
            title={view === "teacher" ? "Teacher schedule" : "Class schedule"}
            action={
              <div className="flex flex-wrap gap-2">
                <FilterSelect
                  paramName="view"
                  label="View"
                  allLabel="By class"
                  options={[{ value: "teacher", label: "By teacher" }]}
                />
                {view === "teacher" ? (
                  <FilterSelect
                    paramName="teacher"
                    label="Teacher"
                    allLabel="Select teacher"
                    options={teachers.map((teacher) => ({
                      value: teacher.id,
                      label: `${teacher.firstName} ${teacher.lastName ?? ""}`.trim(),
                    }))}
                  />
                ) : (
                  <FilterSelect
                    paramName="section"
                    label="Class"
                    allLabel="Select class"
                    options={sections.map((section) => ({
                      value: section.id,
                      label: `${section.classLevel.name} ${section.name}`,
                    }))}
                  />
                )}
              </div>
            }
          />

          {allSlots.length === 0 ? (
            <EmptyState
              title="No timetable yet"
              description={
                canManage
                  ? "Use the panel alongside to generate one from the subject-teacher assignments."
                  : "Ask an administrator to generate the timetable."
              }
            />
          ) : (
            <div className="scroll-slim overflow-x-auto p-4">
              <table className="w-full min-w-[52rem] border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="w-28 px-2 py-1.5 text-left text-[10px] font-semibold tracking-wide text-muted uppercase">
                      Period
                    </th>
                    {days.map((day) => (
                      <th
                        key={day}
                        className="px-2 py-1.5 text-center text-[10px] font-semibold tracking-wide text-muted uppercase"
                      >
                        {day.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => (
                    <tr key={period.id}>
                      <th className="px-2 py-1 text-left align-middle">
                        <span className="block text-xs font-medium">{period.name}</span>
                        <span className="block text-[10px] text-muted">
                          {period.startTime}–{period.endTime}
                        </span>
                      </th>

                      {period.isBreak ? (
                        <td
                          colSpan={days.length}
                          className="rounded-[var(--radius-base)] bg-surface-muted px-2 py-2 text-center text-[11px] tracking-wide text-muted uppercase"
                        >
                          {period.name}
                        </td>
                      ) : (
                        days.map((day) => {
                          const cell = byCell.get(`${day}|${period.id}`) ?? [];
                          const slot = cell[0];
                          const clashing =
                            slot &&
                            clashingSlotKeys.has(
                              `${slot.sectionId}|${slot.dayOfWeek}|${slot.periodId}`,
                            );

                          return (
                            <td key={day} className="p-0 align-top">
                              {slot ? (
                                <div
                                  className={cn(
                                    "min-h-14 rounded-[var(--radius-base)] px-2 py-1.5",
                                    tintFor(slot.subjectId ?? "", tintIndex),
                                    clashing && "ring-2 ring-danger",
                                  )}
                                  title={
                                    clashing
                                      ? "This lesson clashes with another"
                                      : undefined
                                  }
                                >
                                  <span className="block text-[11px] font-semibold">
                                    {slot.subject?.code ?? "—"}
                                  </span>
                                  <span className="block truncate text-[10px] opacity-80">
                                    {view === "teacher"
                                      ? `${slot.section.classLevel.name} ${slot.section.name}`
                                      : slot.teacher
                                        ? `${slot.teacher.firstName} ${slot.teacher.lastName ?? ""}`
                                        : "unstaffed"}
                                  </span>
                                  {cell.length > 1 ? (
                                    <span className="mt-0.5 block text-[10px] font-semibold text-danger">
                                      +{cell.length - 1} clash
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="min-h-14 rounded-[var(--radius-base)] border border-dashed border-border" />
                              )}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Subject key */}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {[...new Set(visible.map((slot) => slot.subjectId))]
                  .filter((id): id is string => Boolean(id))
                  .map((id) => {
                    const example = visible.find((slot) => slot.subjectId === id);
                    return (
                      <span
                        key={id}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          tintFor(id, tintIndex),
                        )}
                      >
                        {example?.subject?.code} · {example?.subject?.name}
                      </span>
                    );
                  })}
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="h-fit">
            <CardHeader
              title="Scheduling"
              description="Build from subject-teacher assignments"
            />
            <GeneratePanel classLevels={classLevels} canManage={canManage} />
          </Card>

          {conflicts.length > 0 ? (
            <Card>
              <CardHeader
                title="Clash details"
                description={`First ${Math.min(6, conflicts.length)} of ${conflicts.length}`}
              />
              <ul className="divide-y divide-border">
                {conflicts.slice(0, 6).map((conflict, index) => (
                  <li key={index} className="px-5 py-3">
                    <Badge tone="danger">
                      {conflict.kind === "TEACHER_DOUBLE_BOOKED"
                        ? "Teacher double-booked"
                        : "Section double-booked"}
                    </Badge>
                    <p className="mt-1 text-xs text-muted">
                      {conflict.dayOfWeek.toLowerCase()} ·{" "}
                      {periods.find((period) => period.id === conflict.periodId)?.name ??
                        "period"}{" "}
                      · {conflict.slots.length} lessons
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
