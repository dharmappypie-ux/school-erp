import Link from "next/link";

import { CurriculumEditor } from "@/app/(app)/academics/curriculum-editor";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
  Table,
  Td,
  Th,
  type Tone,
} from "@/components/ui";
import {
  curriculumLoad,
  teacherCommitments,
  type LoadState,
} from "@/lib/academics";
import { requireAnyPermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Classes & subjects" };

const LOAD_TONE: Record<LoadState, Tone> = {
  EMPTY: "neutral",
  UNDER: "success",
  EXACT: "warning",
  OVER: "danger",
};

const COMMITMENT_TONE: Record<string, Tone> = {
  LIGHT: "neutral",
  HEALTHY: "success",
  HEAVY: "warning",
  OVERCOMMITTED: "danger",
};

const WORKING_DAYS = 6;

export default async function AcademicsPage() {
  const session = await requireAnyPermission(["academics.read", "academics.manage"]);
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;

  const [classLevels, subjects, periods, teachers, departments] = await Promise.all([
    db.classLevel.findMany({
      orderBy: { numericOrder: "asc" },
      select: {
        id: true,
        name: true,
        stream: true,
        sections: {
          where: yearId ? { academicYearId: yearId } : undefined,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            capacity: true,
            roomNumber: true,
            classTeacher: { select: { firstName: true, lastName: true } },
            _count: { select: { enrollments: { where: { isActive: true } } } },
          },
        },
        subjects: {
          select: {
            id: true,
            weeklyPeriods: true,
            maxMarks: true,
            passMarks: true,
            teacherId: true,
            teacher: { select: { firstName: true, lastName: true } },
            subject: {
              select: { id: true, name: true, code: true, isCoScholastic: true },
            },
          },
        },
      },
    }),
    db.subject.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        isElective: true,
        isCoScholastic: true,
        isGraded: true,
        department: { select: { name: true } },
        _count: { select: { classSubjects: true } },
      },
    }),
    db.period.findMany({ select: { isBreak: true } }),
    db.staffMember.findMany({
      where: { staffType: "TEACHING", employmentStatus: "ACTIVE", deletedAt: null },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const teachingPeriodsPerDay = periods.filter((period) => !period.isBreak).length;
  const weeklyCapacity = teachingPeriodsPerDay * WORKING_DAYS;

  const loads = classLevels.map((level) => ({
    level,
    load: curriculumLoad(
      level.subjects.map((entry) => ({
        subjectId: entry.subject.id,
        subjectName: entry.subject.name,
        weeklyPeriods: entry.weeklyPeriods,
        teacherId: entry.teacherId,
      })),
      teachingPeriodsPerDay,
      WORKING_DAYS,
    ),
  }));

  const commitments = teacherCommitments(
    classLevels.flatMap((level) =>
      level.subjects.map((entry) => ({
        subjectId: entry.subject.id,
        subjectName: entry.subject.name,
        weeklyPeriods: entry.weeklyPeriods,
        teacherId: entry.teacherId,
        teacherName: entry.teacher
          ? `${entry.teacher.firstName} ${entry.teacher.lastName ?? ""}`.trim()
          : "Unknown",
        sections: level.sections.length,
      })),
    ),
    weeklyCapacity,
  );

  const overAllocated = loads.filter((entry) => entry.load.state === "OVER");
  const overcommitted = commitments.filter((row) => row.state === "OVERCOMMITTED");
  const unstaffedCount = loads.reduce(
    (sum, entry) => sum + entry.load.unstaffed.length,
    0,
  );
  const totalSections = classLevels.reduce(
    (sum, level) => sum + level.sections.length,
    0,
  );
  const totalStudents = classLevels.reduce(
    (sum, level) =>
      sum + level.sections.reduce((inner, section) => inner + section._count.enrollments, 0),
    0,
  );

  const canManage = hasPermission(session.permissions, "academics.manage");

  return (
    <>
      <PageHeader
        title="Classes & subjects"
        description={`${classLevels.length} classes · ${totalSections} sections · ${subjects.length} subjects`}
      />

      {overAllocated.length > 0 ? (
        <div className="mb-4">
          <Alert
            tone="danger"
            title={`${overAllocated.length} class(es) allocated more periods than the week holds`}
          >
            {overAllocated
              .map(
                (entry) =>
                  `${entry.level.name} needs ${entry.load.allocated} of ${entry.load.capacity}`,
              )
              .join("; ")}
            . The timetable generator cannot place them all and will report a
            shortfall.
          </Alert>
        </div>
      ) : null}

      {overcommitted.length > 0 ? (
        <div className="mb-4">
          <Alert
            tone="danger"
            title={`${overcommitted.length} teacher(s) assigned more periods than the week holds`}
          >
            {overcommitted
              .map((row) => `${row.teacherName} (${row.periods} of ${weeklyCapacity})`)
              .join("; ")}
            . They cannot be timetabled without dropping lessons.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Students enrolled"
          value={String(totalStudents)}
          sublabel={`across ${totalSections} sections`}
        />
        <StatTile
          label="Weekly capacity"
          value={String(weeklyCapacity)}
          sublabel={`${teachingPeriodsPerDay} teaching periods × ${WORKING_DAYS} days`}
        />
        <StatTile
          label="Unstaffed subjects"
          value={String(unstaffedCount)}
          sublabel={unstaffedCount > 0 ? "no teacher assigned" : "all covered"}
          tone={unstaffedCount > 0 ? "warning" : "success"}
        />
        <StatTile
          label="Overcommitted teachers"
          value={String(overcommitted.length)}
          sublabel={overcommitted.length > 0 ? "cannot be timetabled" : "loads fit"}
          tone={overcommitted.length > 0 ? "danger" : "success"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Curriculum by class"
            description="Weekly periods against the timetable's capacity"
          />
          {classLevels.length === 0 ? (
            <EmptyState title="No classes configured" />
          ) : (
            <div className="divide-y divide-border">
              {loads.map(({ level, load }) => (
                <div key={level.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{level.name}</p>
                      <p className="text-xs text-muted">
                        {level.sections.length} section
                        {level.sections.length === 1 ? "" : "s"} ·{" "}
                        {level.sections.reduce(
                          (sum, section) => sum + section._count.enrollments,
                          0,
                        )}{" "}
                        students
                      </p>
                    </div>
                    <Badge tone={LOAD_TONE[load.state]}>
                      {load.allocated}/{load.capacity} periods
                    </Badge>
                  </div>

                  <div className="mt-2">
                    <ProgressBar
                      value={Math.min(100, (load.allocated / Math.max(1, load.capacity)) * 100)}
                      tone={LOAD_TONE[load.state]}
                    />
                  </div>

                  {level.subjects.length === 0 ? (
                    <p className="mt-2 text-xs text-warning">
                      No subjects mapped — this class cannot be timetabled.
                    </p>
                  ) : (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {level.subjects
                        .slice()
                        .sort((a, b) => b.weeklyPeriods - a.weeklyPeriods)
                        .map((entry) => (
                          <span
                            key={entry.id}
                            title={
                              entry.teacher
                                ? `${entry.teacher.firstName} ${entry.teacher.lastName ?? ""}`
                                : "No teacher assigned"
                            }
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              entry.teacherId === null
                                ? "bg-warning-soft text-warning"
                                : entry.subject.isCoScholastic
                                  ? "bg-surface-muted text-muted-strong"
                                  : "bg-brand-soft text-brand"
                            }`}
                          >
                            {entry.subject.code} · {entry.weeklyPeriods}
                            {entry.teacherId === null ? " · unstaffed" : ""}
                          </span>
                        ))}
                    </div>
                  )}

                  {level.sections.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] text-muted">
                      {level.sections.map((section) => (
                        <span key={section.id}>
                          {section.name}: {section._count.enrollments}/{section.capacity}
                          {section.classTeacher
                            ? ` · ${section.classTeacher.firstName}`
                            : " · no class teacher"}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {canManage ? (
            <Card className="h-fit">
              <CardHeader title="Edit curriculum" description="Assign subjects and teachers" />
              <CurriculumEditor
                classLevels={classLevels.map((level) => ({ id: level.id, name: level.name }))}
                subjects={subjects.map((subject) => ({
                  id: subject.id,
                  name: subject.name,
                  code: subject.code,
                }))}
                teachers={teachers.map((teacher) => ({
                  id: teacher.id,
                  name: `${teacher.firstName} ${teacher.lastName ?? ""}`.trim(),
                }))}
                departments={departments}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Teaching loads"
              description={`Against a ${weeklyCapacity}-period week`}
            />
            {commitments.length === 0 ? (
              <EmptyState title="No teachers assigned to subjects" />
            ) : (
              <ul className="divide-y divide-border">
                {commitments.slice(0, 10).map((row) => (
                  <li key={row.teacherId} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/staff/${row.teacherId}`}
                        className="truncate text-sm hover:text-brand"
                      >
                        {row.teacherName}
                      </Link>
                      <Badge tone={COMMITMENT_TONE[row.state] ?? "neutral"}>
                        {row.periods}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted">
                      {row.assignments} subject{row.assignments === 1 ? "" : "s"} ·{" "}
                      {row.state.toLowerCase()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Subjects"
          description={`${subjects.filter((s) => s.isCoScholastic).length} co-scholastic, excluded from the percentage`}
        />
        {subjects.length === 0 ? (
          <EmptyState title="No subjects configured" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Subject</Th>
                <Th>Code</Th>
                <Th>Department</Th>
                <Th className="text-right">Classes</Th>
                <Th>Type</Th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((subject) => (
                <tr key={subject.id} className="hover:bg-surface-hover">
                  <Td className="font-medium">{subject.name}</Td>
                  <Td className="font-mono text-xs">{subject.code}</Td>
                  <Td className="text-muted-strong">
                    {subject.department?.name ?? "—"}
                  </Td>
                  <Td className="numeric text-right">{subject._count.classSubjects}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {subject.isCoScholastic ? (
                        <Badge tone="neutral">co-scholastic</Badge>
                      ) : (
                        <Badge tone="brand">scholastic</Badge>
                      )}
                      {subject.isElective ? <Badge tone="info">elective</Badge> : null}
                      {!subject.isGraded ? <Badge tone="warning">ungraded</Badge> : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        Changing the curriculum does not move lessons already scheduled —
        regenerate the timetable to apply it. Co-scholastic subjects appear on
        report cards but are excluded from the overall percentage.
      </p>
    </>
  );
}
