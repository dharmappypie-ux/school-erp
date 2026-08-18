import Link from "next/link";

import { GeneratePanel } from "@/app/(app)/exams/report-cards/generate-panel";
import { FilterSelect } from "@/components/data-controls";
import {
  Badge,
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
import { formatDate, formatPercent, toNumber } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Report cards" };

const RESULT_TONE: Record<string, Tone> = {
  PASS: "success",
  FAIL: "danger",
  ABSENT: "warning",
};

export default async function ReportCardsPage({
  searchParams,
}: PageProps<"/exams/report-cards">) {
  const session = await requirePermission("reportcards.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const yearId = session.academicYear?.id;

  const [terms, sections] = await Promise.all([
    yearId
      ? db.examTerm.findMany({
          where: { academicYearId: yearId },
          orderBy: { sequence: "asc" },
          select: { id: true, name: true },
        })
      : [],
    yearId
      ? db.section.findMany({
          where: { academicYearId: yearId },
          orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
          select: { id: true, name: true, classLevel: { select: { name: true } } },
        })
      : [],
  ]);

  const termId =
    typeof params.term === "string" && params.term ? params.term : (terms[0]?.id ?? "");
  const sectionId =
    typeof params.section === "string" && params.section
      ? params.section
      : (sections[0]?.id ?? "");

  const [cards, summary] = await Promise.all([
    termId && sectionId
      ? db.reportCard.findMany({
          where: {
            termId,
            student: {
              enrollments: {
                some: { sectionId, ...(yearId ? { academicYearId: yearId } : {}) },
              },
            },
          },
          orderBy: [{ rank: "asc" }],
          select: {
            id: true,
            percentage: true,
            grade: true,
            gpa: true,
            rank: true,
            result: true,
            isPublished: true,
            publishedAt: true,
            obtainedMarks: true,
            totalMarks: true,
            student: {
              select: { id: true, firstName: true, lastName: true, admissionNo: true },
            },
          },
        })
      : [],
    termId
      ? db.reportCard.groupBy({
          by: ["result"],
          where: { termId },
          _count: { _all: true },
        })
      : [],
  ]);

  const resultCounts = Object.fromEntries(
    summary.map((row) => [row.result ?? "UNKNOWN", row._count._all]),
  ) as Record<string, number>;
  const totalCards = summary.reduce((sum, row) => sum + row._count._all, 0);
  const publishedCount = cards.filter((card) => card.isPublished).length;

  const classAverage =
    cards.length > 0
      ? cards.reduce((sum, card) => sum + toNumber(card.percentage), 0) / cards.length
      : null;

  const canGenerate = hasPermission(session.permissions, "reportcards.generate");
  const canPublish = hasPermission(session.permissions, "reportcards.publish");

  return (
    <>
      <PageHeader
        title="Report cards"
        description="Generate, review and publish results by class."
        action={
          <Link
            href="/exams"
            className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
          >
            Back to exams
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Cards in term"
          value={String(totalCards)}
          sublabel="across all classes"
        />
        <StatTile
          label="Passed"
          value={String(resultCounts.PASS ?? 0)}
          sublabel={
            totalCards > 0
              ? formatPercent(((resultCounts.PASS ?? 0) / totalCards) * 100, 0)
              : "—"
          }
          tone="success"
        />
        <StatTile
          label="Needs attention"
          value={String((resultCounts.FAIL ?? 0) + (resultCounts.ABSENT ?? 0))}
          sublabel="failed or absent"
          tone={(resultCounts.FAIL ?? 0) > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="Class average"
          value={classAverage === null ? "—" : formatPercent(classAverage, 1)}
          sublabel={`${publishedCount} of ${cards.length} published`}
          tone={classAverage === null ? "neutral" : classAverage >= 60 ? "success" : "warning"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Class results"
            description="Ordered by rank"
            action={
              <div className="flex flex-wrap gap-2">
                <FilterSelect
                  paramName="term"
                  label="Term"
                  allLabel="First term"
                  options={terms.map((term) => ({ value: term.id, label: term.name }))}
                />
                <FilterSelect
                  paramName="section"
                  label="Class"
                  allLabel="First class"
                  options={sections.map((section) => ({
                    value: section.id,
                    label: `${section.classLevel.name} ${section.name}`,
                  }))}
                />
              </div>
            }
          />

          {cards.length === 0 ? (
            <EmptyState
              title="No report cards for this class and term"
              description={
                canGenerate
                  ? "Use the panel alongside to generate them from the marks on record."
                  : "Ask an administrator to generate them."
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="w-14">Rank</Th>
                  <Th>Student</Th>
                  <Th className="text-right">Marks</Th>
                  <Th className="text-right">%</Th>
                  <Th>Grade</Th>
                  <Th>Result</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card.id} className="hover:bg-surface-hover">
                    <Td className="numeric font-semibold">{card.rank ?? "—"}</Td>
                    <Td>
                      <Link
                        href={`/exams/report-cards/${card.id}`}
                        className="font-medium hover:text-brand"
                      >
                        {card.student.firstName} {card.student.lastName}
                      </Link>
                      <span className="block font-mono text-[11px] text-muted">
                        {card.student.admissionNo}
                      </span>
                    </Td>
                    <Td className="numeric text-right text-muted-strong">
                      {toNumber(card.obtainedMarks)} / {toNumber(card.totalMarks)}
                    </Td>
                    <Td className="numeric text-right font-medium">
                      {formatPercent(toNumber(card.percentage), 1)}
                    </Td>
                    <Td>
                      <Badge tone="brand">{card.grade ?? "—"}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={RESULT_TONE[card.result ?? ""] ?? "neutral"}>
                        {card.result?.toLowerCase() ?? "—"}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      {card.isPublished ? (
                        <span
                          className="text-[11px] text-success"
                          title={`Published ${formatDate(card.publishedAt)}`}
                        >
                          published
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">draft</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {canGenerate && terms.length > 0 && sections.length > 0 ? (
          <Card className="h-fit">
            <CardHeader
              title="Generate"
              description="Recompute from marks on record"
            />
            <GeneratePanel
              terms={terms}
              sections={sections.map((section) => ({
                id: section.id,
                label: `${section.classLevel.name} ${section.name}`,
              }))}
              defaultTermId={termId}
              defaultSectionId={sectionId}
              canPublish={canPublish}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}
