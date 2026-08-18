import Link from "next/link";

import { FilterSelect } from "@/components/data-controls";
import {
  Badge,
  ButtonLink,
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
import { requireAnyPermission } from "@/lib/auth";
import { formatDate, formatPercent } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Examinations" };

const STATUS_TONE: Record<string, Tone> = {
  PLANNED: "neutral",
  SCHEDULED: "info",
  ONGOING: "warning",
  MARKS_ENTRY: "warning",
  COMPLETED: "success",
  PUBLISHED: "success",
  CANCELLED: "danger",
};

export default async function ExamsPage({ searchParams }: PageProps<"/exams">) {
  const session = await requireAnyPermission(["exams.read", "marks.read"]);
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const yearId = session.academicYear?.id;

  const terms = yearId
    ? await db.examTerm.findMany({
        where: { academicYearId: yearId },
        orderBy: { sequence: "asc" },
        select: { id: true, name: true, startDate: true, endDate: true, isPublished: true },
      })
    : [];

  const termId =
    typeof params.term === "string" && params.term ? params.term : (terms[0]?.id ?? "");
  const classFilter = typeof params.class === "string" ? params.class : "";

  const [exams, classLevels, markCounts, enrollmentCounts, cardCount] =
    await Promise.all([
      termId
        ? db.exam.findMany({
            where: { termId, ...(classFilter ? { classLevelId: classFilter } : {}) },
            orderBy: [
              { classLevel: { numericOrder: "asc" } },
              { subject: { name: "asc" } },
            ],
            select: {
              id: true,
              name: true,
              maxMarks: true,
              status: true,
              classLevelId: true,
              classLevel: { select: { name: true, numericOrder: true } },
              subject: { select: { name: true, code: true } },
              schedules: {
                orderBy: { examDate: "asc" },
                take: 1,
                select: { examDate: true, startTime: true },
              },
            },
          })
        : [],
      db.classLevel.findMany({
        orderBy: { numericOrder: "asc" },
        select: { id: true, name: true },
      }),
      termId
        ? db.markEntry.groupBy({
            by: ["examId"],
            where: { exam: { termId } },
            _count: { _all: true },
          })
        : [],
      yearId
        ? db.enrollment.groupBy({
            by: ["sectionId"],
            where: { academicYearId: yearId, isActive: true },
            _count: { _all: true },
          })
        : [],
      termId ? db.reportCard.count({ where: { termId } }) : 0,
    ]);

  // Expected candidates per class level = students enrolled across its sections.
  const sections = yearId
    ? await db.section.findMany({
        where: { academicYearId: yearId },
        select: { id: true, classLevelId: true },
      })
    : [];
  const enrolledBySection = new Map(
    enrollmentCounts.map((row) => [row.sectionId, row._count._all]),
  );
  const expectedByClass = new Map<string, number>();
  for (const section of sections) {
    expectedByClass.set(
      section.classLevelId,
      (expectedByClass.get(section.classLevelId) ?? 0) +
        (enrolledBySection.get(section.id) ?? 0),
    );
  }

  const marksByExam = new Map(markCounts.map((row) => [row.examId, row._count._all]));

  const totalExpected = exams.reduce(
    (sum, exam) => sum + (expectedByClass.get(exam.classLevelId) ?? 0),
    0,
  );
  const totalEntered = exams.reduce(
    (sum, exam) => sum + (marksByExam.get(exam.id) ?? 0),
    0,
  );
  const completion = totalExpected > 0 ? (totalEntered / totalExpected) * 100 : 0;

  const canEnterMarks = hasPermission(session.permissions, "marks.enter");
  const canGenerate = hasPermission(session.permissions, "reportcards.generate");
  const selectedTerm = terms.find((term) => term.id === termId);

  return (
    <>
      <PageHeader
        title="Examinations"
        description={
          selectedTerm
            ? `${selectedTerm.name} · ${formatDate(selectedTerm.startDate)} – ${formatDate(selectedTerm.endDate)}`
            : "No exam term configured"
        }
        action={
          canGenerate ? (
            <ButtonLink href="/exams/report-cards">Report cards</ButtonLink>
          ) : undefined
        }
      />

      {terms.length === 0 ? (
        <EmptyState
          title="No exam terms for this academic year"
          description="Create a term before scheduling exams."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Exams in term" value={String(exams.length)} />
            <StatTile
              label="Marks entered"
              value={formatPercent(completion, 0)}
              sublabel={`${totalEntered} of ${totalExpected} papers`}
              tone={completion >= 99 ? "success" : completion > 0 ? "warning" : "neutral"}
            />
            <StatTile
              label="Report cards"
              value={String(cardCount)}
              sublabel={cardCount > 0 ? "generated" : "not generated yet"}
              tone={cardCount > 0 ? "success" : "neutral"}
              href="/exams/report-cards"
            />
            <StatTile
              label="Term status"
              value={selectedTerm?.isPublished ? "Published" : "In progress"}
              tone={selectedTerm?.isPublished ? "success" : "info"}
            />
          </div>

          <Card className="mt-4">
            <CardHeader
              title="Exam papers"
              description="Marks-entry progress per paper"
              action={
                <div className="flex flex-wrap gap-2">
                  <FilterSelect
                    paramName="term"
                    label="Term"
                    allLabel="Current term"
                    options={terms.map((term) => ({ value: term.id, label: term.name }))}
                  />
                  <FilterSelect
                    paramName="class"
                    label="Class"
                    allLabel="All classes"
                    options={classLevels.map((level) => ({
                      value: level.id,
                      label: level.name,
                    }))}
                  />
                </div>
              }
            />

            {exams.length === 0 ? (
              <EmptyState
                title="No exam papers in this term"
                description="Adjust the filters, or create exams for this term."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Class</Th>
                    <Th>Subject</Th>
                    <Th>Scheduled</Th>
                    <Th className="text-right">Max</Th>
                    <Th>Marks entered</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {exams.map((exam) => {
                    const expected = expectedByClass.get(exam.classLevelId) ?? 0;
                    const entered = marksByExam.get(exam.id) ?? 0;
                    const percent = expected > 0 ? (entered / expected) * 100 : 0;
                    const schedule = exam.schedules[0];

                    return (
                      <tr key={exam.id} className="hover:bg-surface-hover">
                        <Td className="font-medium">{exam.classLevel.name}</Td>
                        <Td>
                          {exam.subject.name}
                          <span className="block font-mono text-[11px] text-muted">
                            {exam.subject.code}
                          </span>
                        </Td>
                        <Td className="text-muted-strong">
                          {schedule
                            ? `${formatDate(schedule.examDate)} · ${schedule.startTime}`
                            : "Not scheduled"}
                        </Td>
                        <Td className="numeric text-right">{String(exam.maxMarks)}</Td>
                        <Td className="w-40">
                          <div className="flex items-center gap-2">
                            <ProgressBar
                              value={percent}
                              tone={percent >= 99 ? "success" : percent > 0 ? "warning" : "neutral"}
                            />
                            <span className="numeric shrink-0 text-[11px] text-muted">
                              {entered}/{expected}
                            </span>
                          </div>
                        </Td>
                        <Td>
                          <Badge tone={STATUS_TONE[exam.status] ?? "neutral"}>
                            {exam.status.replace("_", " ").toLowerCase()}
                          </Badge>
                        </Td>
                        <Td className="text-right">
                          <Link
                            href={`/exams/${exam.id}/marks`}
                            className="text-xs font-medium text-brand"
                          >
                            {canEnterMarks ? "Enter marks" : "View marks"}
                          </Link>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
